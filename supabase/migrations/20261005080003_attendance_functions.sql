-- =====================================================================
-- 027 ATTENDANCE: functions
-- Timezone-safe "today"/lateness helpers, punch RPCs, HR/Boss reports,
-- salary-from-attendance calculation, and a nightly job that closes missed days.
-- =====================================================================

-- ---------- timezone helpers ----------
create or replace function app.attendance_tz() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(s.attendance_timezone, 'Asia/Kolkata') from public.app_settings s where s.id = 1
$$;

create or replace function app.local_date(p_ts timestamptz default now()) returns date
language sql stable security definer set search_path = '' as $$
  select (p_ts at time zone app.attendance_tz())::date
$$;

create or replace function app.is_working_day(p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select extract(dow from p_date)::int <> (select s.attendance_weekly_off_dow from public.app_settings s where s.id = 1)
$$;

-- ---------- salary from attendance (shared by attendance_overview and attendance_detail) ----------
create or replace function app.compute_payable(p_user uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_salary numeric; v_joined date; v_days_in_month int; v_per_day numeric;
  v_absent int; v_half int; v_month_start date; v_month_end date; v_bound date;
begin
  select salary_monthly, joined_on into v_salary, v_joined from public.users where id = p_user;
  v_month_start := date_trunc('month', p_month)::date;
  v_month_end   := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_days_in_month := extract(day from v_month_end);
  v_per_day := coalesce(v_salary, 0) / v_days_in_month;
  -- never count future days, and never count days before the employee joined
  v_bound := least(v_month_end, app.local_date());

  select count(*) filter (where status = 'absent'), count(*) filter (where status = 'half_day')
    into v_absent, v_half
  from public.attendance_records
  where user_id = p_user and work_date between greatest(v_month_start, coalesce(v_joined, v_month_start)) and v_bound
    and app.is_working_day(work_date);

  return jsonb_build_object(
    'base_salary', v_salary, 'per_day_rate', round(v_per_day, 2), 'days_in_month', v_days_in_month,
    'absent_days', coalesce(v_absent, 0), 'half_days', coalesce(v_half, 0),
    'deduction', round(v_per_day * (coalesce(v_absent, 0) + 0.5 * coalesce(v_half, 0)), 2),
    'payable_salary', round(coalesce(v_salary, 0) - v_per_day * (coalesce(v_absent, 0) + 0.5 * coalesce(v_half, 0)), 2)
  );
end $$;

-- ---------- punches (self-service) ----------
create or replace function public.clock_in() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := app.local_date();
  v_local_time time := (now() at time zone app.attendance_tz())::time;
  v_start time; v_grace int; v_cutoff time;
  v_late boolean; v_late_minutes int;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;

  select s.attendance_work_start, s.attendance_late_grace_minutes into v_start, v_grace from public.app_settings s where s.id = 1;
  v_cutoff := v_start + make_interval(mins => v_grace);
  v_late := v_local_time > v_cutoff;
  v_late_minutes := case when v_late then greatest(0, extract(epoch from (v_local_time - v_cutoff)) / 60) else 0 end;

  insert into public.attendance_records (user_id, work_date, clock_in_at, is_late, late_minutes)
  values (auth.uid(), v_today, now(), v_late, v_late_minutes)
  on conflict (user_id, work_date) do nothing;
  if not found then raise exception 'You already clocked in today'; end if;

  perform app.audit('attendance.clock_in', 'attendance_records', auth.uid(), jsonb_build_object('work_date', v_today, 'is_late', v_late));
  return public.attendance_today();
end $$;

create or replace function public.break_start() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.attendance_records;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into v_row from public.attendance_records where user_id = auth.uid() and work_date = app.local_date() for update;
  if not found or v_row.clock_in_at is null then raise exception 'Clock in first'; end if;
  if v_row.break_start_at is not null then raise exception 'Break already started'; end if;
  if v_row.clock_out_at is not null then raise exception 'You already clocked out today'; end if;
  update public.attendance_records set break_start_at = now() where id = v_row.id;
  return public.attendance_today();
end $$;

create or replace function public.break_end() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.attendance_records;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into v_row from public.attendance_records where user_id = auth.uid() and work_date = app.local_date() for update;
  if not found or v_row.break_start_at is null then raise exception 'Start your break first'; end if;
  if v_row.break_end_at is not null then raise exception 'Break already ended'; end if;
  update public.attendance_records set break_end_at = now() where id = v_row.id;
  return public.attendance_today();
end $$;

create or replace function public.clock_out() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.attendance_records;
  v_cutoff_local time; v_limit int; v_out_local time;
  v_break_end timestamptz; v_worked int;
  v_status public.attendance_status; v_reason text; v_late_count int;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into v_row from public.attendance_records where user_id = auth.uid() and work_date = app.local_date() for update;
  if not found or v_row.clock_in_at is null then raise exception 'Clock in first'; end if;
  if v_row.clock_out_at is not null then raise exception 'You already clocked out today'; end if;

  v_break_end := v_row.break_end_at;
  if v_row.break_start_at is not null and v_break_end is null then v_break_end := now(); end if;

  v_worked := (extract(epoch from (now() - v_row.clock_in_at - coalesce(v_break_end - v_row.break_start_at, interval '0'))) / 60)::int;
  v_worked := greatest(0, v_worked);

  select s.attendance_half_day_cutoff, s.attendance_late_warning_limit into v_cutoff_local, v_limit from public.app_settings s where s.id = 1;
  v_out_local := (now() at time zone app.attendance_tz())::time;

  select count(*) into v_late_count from public.attendance_records
    where user_id = auth.uid() and is_late and date_trunc('month', work_date) = date_trunc('month', app.local_date());

  if v_out_local <= v_cutoff_local then
    v_status := 'half_day'; v_reason := 'early_clockout';
  elsif v_row.is_late and v_late_count > v_limit then
    v_status := 'half_day'; v_reason := 'late_streak';
  else
    v_status := 'present'; v_reason := null;
  end if;

  update public.attendance_records set
    clock_out_at = now(), break_end_at = v_break_end, worked_minutes = v_worked, status = v_status, half_day_reason = v_reason
  where id = v_row.id;

  perform app.audit('attendance.clock_out', 'attendance_records', auth.uid(), jsonb_build_object('work_date', v_row.work_date, 'status', v_status));

  if v_row.is_late then
    if v_late_count > v_limit then
      perform app.notify(auth.uid(), 'attendance', 'Half day — too many late arrivals',
        'This is late arrival #' || v_late_count || ' this month. Today is marked Half Day.', 'attendance_records', v_row.id);
    else
      perform app.notify(auth.uid(), 'attendance', 'Late arrival warning ' || v_late_count || ' of ' || v_limit,
        case when v_late_count = v_limit
          then 'One more late day this month will be marked Half Day.'
          else (v_limit - v_late_count) || ' warning(s) left this month before late days become Half Day.'
        end, 'attendance_records', v_row.id);
    end if;
  end if;

  return public.attendance_today();
end $$;

create or replace function public.attendance_today() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_row public.attendance_records;
  v_next text;
  v_late_count int;
  s public.app_settings;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into s from public.app_settings where id = 1;
  select * into v_row from public.attendance_records where user_id = auth.uid() and work_date = app.local_date();

  v_next := case
    when v_row.id is null or v_row.clock_in_at is null then 'clock_in'
    when v_row.break_start_at is null then 'break_start'
    when v_row.break_end_at is null then 'break_end'
    when v_row.clock_out_at is null then 'clock_out'
    else 'done'
  end;

  select count(*) into v_late_count from public.attendance_records
    where user_id = auth.uid() and is_late and date_trunc('month', work_date) = date_trunc('month', app.local_date());

  return jsonb_build_object(
    'record', case when v_row.id is null then null else jsonb_build_object(
      'id', v_row.id, 'work_date', v_row.work_date, 'clock_in_at', v_row.clock_in_at,
      'break_start_at', v_row.break_start_at, 'break_end_at', v_row.break_end_at, 'clock_out_at', v_row.clock_out_at,
      'status', v_row.status, 'half_day_reason', v_row.half_day_reason, 'is_late', v_row.is_late,
      'late_minutes', v_row.late_minutes, 'worked_minutes', v_row.worked_minutes) end,
    'next_action', v_next,
    'late_count_this_month', v_late_count,
    'thresholds', jsonb_build_object(
      'work_start', s.attendance_work_start, 'work_end', s.attendance_work_end,
      'grace_minutes', s.attendance_late_grace_minutes, 'half_day_cutoff', s.attendance_half_day_cutoff,
      'warning_limit', s.attendance_late_warning_limit)
  );
end $$;

-- ---------- self history ----------
create or replace function public.my_attendance(p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_start date := date_trunc('month', p_month)::date; v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  return jsonb_build_object(
    'records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'work_date', r.work_date, 'clock_in_at', r.clock_in_at, 'break_start_at', r.break_start_at,
        'break_end_at', r.break_end_at, 'clock_out_at', r.clock_out_at, 'status', r.status,
        'half_day_reason', r.half_day_reason, 'is_late', r.is_late, 'late_minutes', r.late_minutes,
        'worked_minutes', r.worked_minutes, 'auto_closed', r.auto_closed) order by r.work_date desc)
      from public.attendance_records r where r.user_id = auth.uid() and r.work_date between v_start and v_end), '[]'::jsonb),
    'summary', (
      select jsonb_build_object(
        'present', count(*) filter (where r.status = 'present'), 'half_day', count(*) filter (where r.status = 'half_day'),
        'absent', count(*) filter (where r.status = 'absent'), 'late', count(*) filter (where r.is_late))
      from public.attendance_records r where r.user_id = auth.uid() and r.work_date between v_start and v_end));
end $$;

-- ---------- HR / Boss ----------
create or replace function public.attendance_overview(p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_start date := date_trunc('month', p_month)::date; v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only Boss or HR can view company attendance' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(row_data order by row_data ->> 'full_name') from (
      select jsonb_build_object(
        'user_id', u.id, 'full_name', u.full_name, 'role', u.role,
        'department', (select d.name from public.departments d where d.id = u.department_id),
        'present', count(r.id) filter (where r.status = 'present'),
        'half_day', count(r.id) filter (where r.status = 'half_day'),
        'absent', count(r.id) filter (where r.status = 'absent'),
        'late', count(r.id) filter (where r.is_late)
      ) || app.compute_payable(u.id, p_month) as row_data
      from public.users u
      left join public.attendance_records r on r.user_id = u.id and r.work_date between v_start and v_end
      where u.is_active and u.account_status = 'active'
      group by u.id) sub), '[]'::jsonb);
end $$;

create or replace function public.attendance_detail(p_target uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u public.users;
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only Boss or HR can view company attendance' using errcode = '42501'; end if;
  select * into u from public.users where id = p_target;
  if not found then raise exception 'Person not found'; end if;

  return jsonb_build_object(
    'person', jsonb_build_object('id', u.id, 'full_name', u.full_name, 'role', u.role),
    'records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'work_date', r.work_date, 'clock_in_at', r.clock_in_at, 'break_start_at', r.break_start_at,
        'break_end_at', r.break_end_at, 'clock_out_at', r.clock_out_at, 'status', r.status,
        'half_day_reason', r.half_day_reason, 'is_late', r.is_late, 'late_minutes', r.late_minutes,
        'worked_minutes', r.worked_minutes, 'auto_closed', r.auto_closed) order by r.work_date desc)
      from public.attendance_records r
      where r.user_id = p_target
        and r.work_date between date_trunc('month', p_month)::date and (date_trunc('month', p_month) + interval '1 month - 1 day')::date),
      '[]'::jsonb),
    'salary', app.compute_payable(p_target, p_month));
end $$;

create or replace function public.admin_set_salary(p_user_id uuid, p_salary numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only Boss or HR can edit salary' using errcode = '42501'; end if;
  if app.is_hr() and p_user_id = auth.uid() then raise exception 'HR cannot edit their own record'; end if;
  update public.users set salary_monthly = p_salary, updated_at = now() where id = p_user_id;
  perform app.audit('employee_details.salary_update', 'users', p_user_id, jsonb_build_object('salary_monthly', p_salary));
end $$;

-- ---------- nightly: close out any day no one finished ----------
create or replace function app.close_missed_attendance() returns void
language plpgsql security definer set search_path = '' as $$
declare v_yesterday date := app.local_date() - 1;
begin
  if not app.is_working_day(v_yesterday) then return; end if;

  insert into public.attendance_records (user_id, work_date, status, auto_closed)
  select u.id, v_yesterday, 'absent', true
  from public.users u
  where u.is_active and u.account_status = 'active' and (u.joined_on is null or u.joined_on <= v_yesterday)
  on conflict (user_id, work_date) do nothing;

  update public.attendance_records
  set status = 'half_day', half_day_reason = 'early_clockout', auto_closed = true
  where work_date = v_yesterday and clock_in_at is not null and clock_out_at is null and status is null;
end $$;

select cron.schedule('close-missed-attendance', '30 19 * * *', $$select app.close_missed_attendance()$$);  -- 01:00 IST

-- ---------- grants: every new function needs its own pair; the blanket grant in migration 004 only covered functions that existed then ----------
grant execute on function
  public.clock_in(), public.break_start(), public.break_end(), public.clock_out(), public.attendance_today(),
  public.my_attendance(date), public.attendance_overview(date), public.attendance_detail(uuid, date),
  public.admin_set_salary(uuid, numeric)
  to authenticated;
revoke execute on function
  public.clock_in(), public.break_start(), public.break_end(), public.clock_out(), public.attendance_today(),
  public.my_attendance(date), public.attendance_overview(date), public.attendance_detail(uuid, date),
  public.admin_set_salary(uuid, numeric)
  from public, anon;

revoke execute on function app.attendance_tz(), app.local_date(timestamptz), app.is_working_day(date),
  app.compute_payable(uuid, date), app.close_missed_attendance()
  from public, anon, authenticated;
