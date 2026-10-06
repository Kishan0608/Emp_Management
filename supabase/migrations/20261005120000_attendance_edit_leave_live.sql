-- =====================================================================
-- 031 ATTENDANCE: HR/Boss punch edits + leave, made to work on the live schema
--
-- 20261005080004..080006 add HR punch correction and leave marking, but they
-- were never applied to the live project, so the app failed with
-- "Could not find the function public.hr_mark_leave(...)". They also read
-- salary from public.users, which only exists after 20260930000022
-- (consolidate_schema) — not applied live, where salary is still in
-- public.employee_details. This migration is safe on BOTH shapes:
--   * compute_payable reads salary from whichever table holds it
--   * every object is created idempotently
--
-- Adds on top of 080006:
--   * leave_type (sick / casual / emergency / other)
--   * HR chooses Paid or Unpaid; when left empty it follows the yearly quota
--
-- NOTE: `alter type ... add value 'leave'` must be committed before anything
-- uses the value, so it is applied as its own step first.
-- =====================================================================

-- ---------- step 1 (separate transaction) ----------
alter type public.attendance_status add value if not exists 'leave';

-- ---------- step 2 ----------
alter table public.attendance_records
  add column if not exists leave_reason          text,
  add column if not exists leave_paid            boolean,
  add column if not exists leave_attachment_path text,
  add column if not exists leave_type            text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_records_leave_type_check') then
    alter table public.attendance_records
      add constraint attendance_records_leave_type_check check (leave_type in ('sick', 'casual', 'emergency', 'other'));
  end if;
end $$;

alter table public.app_settings
  add column if not exists attendance_annual_paid_leave_days numeric not null default 18;  -- 1.5 days/month x 12
grant update (attendance_annual_paid_leave_days) on public.app_settings to authenticated;

-- ---------- salary lookup that works before and after consolidate_schema ----------
create or replace function app.salary_and_joined(p_user uuid, out salary numeric, out joined date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'users' and column_name = 'salary_monthly') then
    execute 'select salary_monthly, joined_on from public.users where id = $1' into salary, joined using p_user;
  else
    execute 'select salary_monthly, joined_on from public.employee_details where user_id = $1' into salary, joined using p_user;
  end if;
end $$;
revoke execute on function app.salary_and_joined(uuid) from public, anon, authenticated;

-- ---------- payable: unpaid leave deducts like an absent day; reports "as_of" ----------
create or replace function app.compute_payable(p_user uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_salary numeric; v_joined date; v_days_in_month int; v_per_day numeric;
  v_absent int; v_half int; v_leave_paid int; v_leave_unpaid int;
  v_month_start date; v_month_end date; v_bound date;
begin
  select s.salary, s.joined into v_salary, v_joined from app.salary_and_joined(p_user) s;
  v_month_start := date_trunc('month', p_month)::date;
  v_month_end   := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_days_in_month := extract(day from v_month_end);
  v_per_day := coalesce(v_salary, 0) / v_days_in_month;
  -- never count future days, and never count days before the employee joined
  v_bound := least(v_month_end, app.local_date());

  select
    count(*) filter (where status = 'absent'),
    count(*) filter (where status = 'half_day'),
    count(*) filter (where status = 'leave' and leave_paid),
    count(*) filter (where status = 'leave' and not leave_paid)
    into v_absent, v_half, v_leave_paid, v_leave_unpaid
  from public.attendance_records
  where user_id = p_user and work_date between greatest(v_month_start, coalesce(v_joined, v_month_start)) and v_bound
    and app.is_working_day(work_date);

  return jsonb_build_object(
    'base_salary', v_salary, 'per_day_rate', round(v_per_day, 2), 'days_in_month', v_days_in_month,
    'absent_days', coalesce(v_absent, 0), 'half_days', coalesce(v_half, 0),
    'paid_leave_days', coalesce(v_leave_paid, 0), 'unpaid_leave_days', coalesce(v_leave_unpaid, 0),
    'deduction', round(v_per_day * (coalesce(v_absent, 0) + 0.5 * coalesce(v_half, 0) + coalesce(v_leave_unpaid, 0)), 2),
    'payable_salary', round(coalesce(v_salary, 0) - v_per_day * (coalesce(v_absent, 0) + 0.5 * coalesce(v_half, 0) + coalesce(v_leave_unpaid, 0)), 2),
    'as_of', v_bound
  );
end $$;
revoke execute on function app.compute_payable(uuid, date) from public, anon, authenticated;

-- one record shape for every client-facing list, so leave fields are never missing
create or replace function app.attendance_record_json(r public.attendance_records) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id, 'work_date', r.work_date, 'clock_in_at', r.clock_in_at, 'break_start_at', r.break_start_at,
    'break_end_at', r.break_end_at, 'clock_out_at', r.clock_out_at, 'status', r.status,
    'half_day_reason', r.half_day_reason, 'is_late', r.is_late, 'late_minutes', r.late_minutes,
    'worked_minutes', r.worked_minutes, 'auto_closed', r.auto_closed,
    'leave_type', r.leave_type, 'leave_reason', r.leave_reason, 'leave_paid', r.leave_paid,
    'leave_attachment_path', r.leave_attachment_path)
$$;
revoke execute on function app.attendance_record_json(public.attendance_records) from public, anon, authenticated;

-- ---------- HR/Boss: fix a day's punches (e.g. a forgotten clock-out) ----------
create or replace function public.hr_edit_attendance(
  p_user_id uuid, p_work_date date,
  p_clock_in timestamptz, p_break_start timestamptz, p_break_end timestamptz, p_clock_out timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_work_start time; v_grace int; v_half_cutoff time; v_limit int;
  v_local_in time; v_local_out time;
  v_late boolean; v_late_minutes int;
  v_worked int;
  v_status public.attendance_status; v_reason text; v_late_count int;
  v_row public.attendance_records;
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only Boss or HR can edit attendance' using errcode = '42501'; end if;
  if app.is_hr() and p_user_id = auth.uid() then raise exception 'HR cannot edit their own attendance'; end if;
  if not exists (select 1 from public.users where id = p_user_id) then raise exception 'Person not found'; end if;
  if p_work_date > app.local_date() then raise exception 'You can only edit today or earlier days'; end if;
  if p_clock_in is null and (p_break_start is not null or p_break_end is not null or p_clock_out is not null) then
    raise exception 'Clock-in time is required';
  end if;
  if p_break_end is not null and p_break_start is null then raise exception 'Break start is required before break end'; end if;
  if p_break_start is not null and p_break_start < p_clock_in then raise exception 'Break start must be after clock-in'; end if;
  if p_break_start is not null and p_break_end is not null and p_break_end <= p_break_start then
    raise exception 'Break end must be after break start';
  end if;
  if p_clock_out is not null and p_clock_out <= p_clock_in then raise exception 'Clock-out must be after clock-in'; end if;
  if p_clock_out is not null and p_break_end is not null and p_clock_out < p_break_end then
    raise exception 'Clock-out must be after break end';
  end if;

  select s.attendance_work_start, s.attendance_late_grace_minutes, s.attendance_half_day_cutoff, s.attendance_late_warning_limit
    into v_work_start, v_grace, v_half_cutoff, v_limit
  from public.app_settings s where s.id = 1;

  if p_clock_in is not null then
    v_local_in := (p_clock_in at time zone app.attendance_tz())::time;
    v_late := v_local_in > (v_work_start + make_interval(mins => v_grace));
    v_late_minutes := case when v_late then greatest(0, extract(epoch from (v_local_in - (v_work_start + make_interval(mins => v_grace)))) / 60)::int else 0 end;
  else
    v_late := false; v_late_minutes := null;
  end if;

  v_status := null; v_reason := null; v_worked := null;
  if p_clock_out is not null then
    v_worked := greatest(0, (extract(epoch from (p_clock_out - p_clock_in - coalesce(p_break_end - p_break_start, interval '0'))) / 60)::int);
    v_local_out := (p_clock_out at time zone app.attendance_tz())::time;

    select count(*) into v_late_count from public.attendance_records
      where user_id = p_user_id and is_late and date_trunc('month', work_date) = date_trunc('month', p_work_date)
        and work_date <> p_work_date;
    if v_late then v_late_count := v_late_count + 1; end if;

    if v_local_out <= v_half_cutoff then
      v_status := 'half_day'; v_reason := 'early_clockout';
    elsif v_late and v_late_count > v_limit then
      v_status := 'half_day'; v_reason := 'late_streak';
    else
      v_status := 'present'; v_reason := null;
    end if;
  elsif p_clock_in is null and p_work_date < app.local_date() then
    v_status := 'absent';   -- a past day with every punch cleared is an absence, not "in progress"
  end if;

  insert into public.attendance_records
    (user_id, work_date, clock_in_at, break_start_at, break_end_at, clock_out_at, is_late, late_minutes, worked_minutes, status, half_day_reason, auto_closed)
  values
    (p_user_id, p_work_date, p_clock_in, p_break_start, p_break_end, p_clock_out, coalesce(v_late, false), v_late_minutes, v_worked, v_status, v_reason, false)
  on conflict (user_id, work_date) do update set
    clock_in_at = excluded.clock_in_at, break_start_at = excluded.break_start_at, break_end_at = excluded.break_end_at,
    clock_out_at = excluded.clock_out_at, is_late = excluded.is_late, late_minutes = excluded.late_minutes,
    worked_minutes = excluded.worked_minutes, status = excluded.status, half_day_reason = excluded.half_day_reason,
    auto_closed = false,
    -- punches replace any leave on that day
    leave_type = null, leave_reason = null, leave_paid = null, leave_attachment_path = null
  returning * into v_row;

  perform app.audit('attendance.hr_edit', 'attendance_records', p_user_id, jsonb_build_object(
    'work_date', p_work_date, 'clock_in_at', p_clock_in, 'break_start_at', p_break_start,
    'break_end_at', p_break_end, 'clock_out_at', p_clock_out, 'status', v_status));
  perform app.notify(p_user_id, 'attendance', 'Attendance updated',
    'HR updated your attendance for ' || to_char(p_work_date, 'FMDD Mon YYYY') || '.', 'attendance_records', v_row.id);

  return app.attendance_record_json(v_row);
end $$;

-- ---------- HR/Boss: mark (or edit) a day as leave ----------
-- The 4-argument version from 080006 must not linger next to this one, or the API cannot choose.
drop function if exists public.hr_mark_leave(uuid, date, text, text);

create or replace function public.hr_mark_leave(
  p_user_id uuid, p_work_date date, p_reason text, p_attachment_path text default null,
  p_leave_type text default 'casual', p_paid boolean default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_year int := extract(year from p_work_date)::int;
  v_quota numeric;
  v_paid_used int;
  v_paid boolean;
  v_type text := coalesce(nullif(trim(p_leave_type), ''), 'casual');
  v_row public.attendance_records;
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only Boss or HR can mark leave' using errcode = '42501'; end if;
  if app.is_hr() and p_user_id = auth.uid() then raise exception 'HR cannot mark leave for themselves'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  if v_type not in ('sick', 'casual', 'emergency', 'other') then raise exception 'Unknown leave type'; end if;
  if not exists (select 1 from public.users where id = p_user_id) then raise exception 'Person not found'; end if;
  if p_attachment_path is not null and split_part(p_attachment_path, '/', 1) <> p_user_id::text then
    raise exception 'Attachment does not belong to this person';
  end if;

  select s.attendance_annual_paid_leave_days into v_quota from public.app_settings s where s.id = 1;
  select count(*) into v_paid_used from public.attendance_records
    where user_id = p_user_id and status = 'leave' and leave_paid
      and extract(year from work_date) = v_year and work_date <> p_work_date;

  -- HR's choice wins; left empty, it is paid while the yearly quota lasts.
  v_paid := coalesce(p_paid, v_paid_used < v_quota);

  insert into public.attendance_records
    (user_id, work_date, status, leave_type, leave_reason, leave_paid, leave_attachment_path,
     clock_in_at, break_start_at, break_end_at, clock_out_at, is_late, late_minutes, worked_minutes, half_day_reason, auto_closed)
  values
    (p_user_id, p_work_date, 'leave', v_type, trim(p_reason), v_paid, p_attachment_path,
     null, null, null, null, false, null, null, null, false)
  on conflict (user_id, work_date) do update set
    status = 'leave', leave_type = excluded.leave_type, leave_reason = excluded.leave_reason, leave_paid = excluded.leave_paid,
    leave_attachment_path = excluded.leave_attachment_path,
    clock_in_at = null, break_start_at = null, break_end_at = null, clock_out_at = null,
    is_late = false, late_minutes = null, worked_minutes = null, half_day_reason = null, auto_closed = false
  returning * into v_row;

  perform app.audit('attendance.hr_mark_leave', 'attendance_records', p_user_id, jsonb_build_object(
    'work_date', p_work_date, 'type', v_type, 'reason', v_row.leave_reason, 'paid', v_paid, 'paid_chosen_by_hr', p_paid is not null));
  perform app.notify(p_user_id, 'attendance',
    initcap(v_type) || ' leave approved (' || case when v_paid then 'paid' else 'unpaid' end || ')',
    to_char(p_work_date, 'FMDD Mon YYYY') || ' is marked as leave.' ||
      case when v_paid then '' else ' Unpaid leave is deducted from salary.' end,
    'attendance_records', v_row.id);

  return app.attendance_record_json(v_row);
end $$;

-- ---------- HR/Boss: cancel a marked leave ----------
create or replace function public.hr_cancel_leave(p_user_id uuid, p_work_date date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only Boss or HR can cancel leave' using errcode = '42501'; end if;
  if app.is_hr() and p_user_id = auth.uid() then raise exception 'HR cannot edit their own attendance'; end if;

  delete from public.attendance_records where user_id = p_user_id and work_date = p_work_date and status = 'leave';
  if not found then raise exception 'No leave found for that day'; end if;

  perform app.audit('attendance.hr_cancel_leave', 'attendance_records', p_user_id, jsonb_build_object('work_date', p_work_date));
  perform app.notify(p_user_id, 'attendance', 'Leave cancelled',
    to_char(p_work_date, 'FMDD Mon YYYY') || ' is no longer marked as leave.', 'attendance_records', null);
end $$;

-- ---------- paid-leave balance (HR/Boss for anyone, self for own) ----------
create or replace function public.leave_balance(p_user_id uuid, p_year int default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_year int := coalesce(p_year, extract(year from app.local_date())::int);
  v_quota numeric;
  v_used int;
begin
  if not (app.is_boss() or app.is_hr() or p_user_id = auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select s.attendance_annual_paid_leave_days into v_quota from public.app_settings s where s.id = 1;
  select count(*) into v_used from public.attendance_records
    where user_id = p_user_id and status = 'leave' and leave_paid and extract(year from work_date) = v_year;
  return jsonb_build_object('year', v_year, 'quota', v_quota, 'used', coalesce(v_used, 0),
                            'remaining', greatest(0, v_quota - coalesce(v_used, 0)));
end $$;

-- ---------- client-facing reads now carry leave fields ----------
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
    when v_row.status = 'leave' then 'done'
    when v_row.id is null or v_row.clock_in_at is null then 'clock_in'
    when v_row.break_start_at is null then 'break_start'
    when v_row.break_end_at is null then 'break_end'
    when v_row.clock_out_at is null then 'clock_out'
    else 'done'
  end;

  select count(*) into v_late_count from public.attendance_records
    where user_id = auth.uid() and is_late and date_trunc('month', work_date) = date_trunc('month', app.local_date());

  return jsonb_build_object(
    'record', case when v_row.id is null then null else app.attendance_record_json(v_row) end,
    'next_action', v_next,
    'late_count_this_month', v_late_count,
    'thresholds', jsonb_build_object(
      'work_start', s.attendance_work_start, 'work_end', s.attendance_work_end,
      'grace_minutes', s.attendance_late_grace_minutes, 'half_day_cutoff', s.attendance_half_day_cutoff,
      'warning_limit', s.attendance_late_warning_limit)
  );
end $$;

create or replace function public.my_attendance(p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_start date := date_trunc('month', p_month)::date; v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  return jsonb_build_object(
    'records', coalesce((
      select jsonb_agg(app.attendance_record_json(r) order by r.work_date desc)
      from public.attendance_records r where r.user_id = auth.uid() and r.work_date between v_start and v_end), '[]'::jsonb),
    'summary', (
      select jsonb_build_object(
        'present', count(*) filter (where r.status = 'present'), 'half_day', count(*) filter (where r.status = 'half_day'),
        'absent', count(*) filter (where r.status = 'absent'), 'leave', count(*) filter (where r.status = 'leave'),
        'late', count(*) filter (where r.is_late))
      from public.attendance_records r where r.user_id = auth.uid() and r.work_date between v_start and v_end));
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
      select jsonb_agg(app.attendance_record_json(r) order by r.work_date desc)
      from public.attendance_records r
      where r.user_id = p_target
        and r.work_date between date_trunc('month', p_month)::date and (date_trunc('month', p_month) + interval '1 month - 1 day')::date),
      '[]'::jsonb),
    'salary', app.compute_payable(p_target, p_month));
end $$;

-- ---------- storage for leave attachments (e.g. medical certificates) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('leave-attachments', 'leave-attachments', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "leave attachments: upload by hr or boss" on storage.objects;
create policy "leave attachments: upload by hr or boss" on storage.objects for insert to authenticated
with check (bucket_id = 'leave-attachments' and (app.is_boss() or app.is_hr()));

drop policy if exists "leave attachments: read if owner, hr, or boss" on storage.objects;
create policy "leave attachments: read if owner, hr, or boss" on storage.objects for select to authenticated
using (
  bucket_id = 'leave-attachments' and (
    app.is_boss() or app.is_hr() or (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- ---------- grants ----------
grant execute on function
  public.hr_edit_attendance(uuid, date, timestamptz, timestamptz, timestamptz, timestamptz),
  public.hr_mark_leave(uuid, date, text, text, text, boolean),
  public.hr_cancel_leave(uuid, date),
  public.leave_balance(uuid, int)
  to authenticated;
revoke execute on function
  public.hr_edit_attendance(uuid, date, timestamptz, timestamptz, timestamptz, timestamptz),
  public.hr_mark_leave(uuid, date, text, text, text, boolean),
  public.hr_cancel_leave(uuid, date),
  public.leave_balance(uuid, int)
  from public, anon;
