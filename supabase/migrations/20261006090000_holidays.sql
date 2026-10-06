-- =====================================================================
-- 032 HOLIDAYS (festivals, national and company holidays)
--
-- Boss/HR add a holiday with a name and a date (or a range of days), for
-- every company or one company. On a holiday:
--   * every employee is credited a full PAID day: no salary deduction,
--     never counted as leave, never uses the paid-leave quota
--   * the nightly job does not mark anyone absent
--   * leave cannot be booked on it
--   * calendars (employee phones and HR/Boss) show the festival name
--     instead of clock-in / clock-out
-- An employee who still clocks in on a holiday is simply shown as worked.
-- Writes only through the hr_* RPCs below; everyone signed in can read.
-- =====================================================================

create table if not exists public.holidays (
  id              uuid primary key default gen_random_uuid(),
  holiday_date    date not null,
  name            text not null check (char_length(trim(name)) between 2 and 80),
  kind            text not null default 'festival' check (kind in ('festival', 'national', 'company', 'other')),
  organization_id uuid references public.organizations(id) on delete cascade,   -- null = every company
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- one holiday per day per scope ("all companies" counts as its own scope)
create unique index if not exists holidays_date_scope_uniq
  on public.holidays (holiday_date, coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists holidays_date_idx on public.holidays (holiday_date);

drop trigger if exists holidays_touch on public.holidays;
create trigger holidays_touch before update on public.holidays
  for each row execute function app.touch_updated_at();

alter table public.holidays enable row level security;
revoke all on public.holidays from anon;
revoke insert, update, delete on public.holidays from authenticated;
grant select on public.holidays to authenticated;
drop policy if exists holidays_read on public.holidays;
create policy holidays_read on public.holidays for select to authenticated using (app.is_active_user());

-- ---------- helpers ----------
create or replace function app.is_holiday(p_user uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.holidays h
    where h.holiday_date = p_date
      and (h.organization_id is null
           or h.organization_id = (select u.organization_id from public.users u where u.id = p_user))
  )
$$;

-- the holidays that apply to one person in a date range (a company-specific one wins over "all companies")
create or replace function app.holidays_json(p_user uuid, p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'holiday_date', x.holiday_date, 'name', x.name, 'kind', x.kind, 'organization_id', x.organization_id)
         order by x.holiday_date), '[]'::jsonb)
  from (
    select distinct on (h.holiday_date) h.*
    from public.holidays h
    where h.holiday_date between p_from and p_to
      and (h.organization_id is null
           or h.organization_id = (select u.organization_id from public.users u where u.id = p_user))
    order by h.holiday_date, h.organization_id nulls last
  ) x
$$;

revoke execute on function app.is_holiday(uuid, date), app.holidays_json(uuid, date, date) from public, anon, authenticated;

-- ---------- salary: holidays never deduct and are reported ----------
create or replace function app.compute_payable(p_user uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_salary numeric; v_joined date; v_days_in_month int; v_per_day numeric;
  v_absent int; v_half int; v_leave_paid int; v_leave_unpaid int; v_holidays int;
  v_month_start date; v_month_end date; v_bound date; v_from date;
begin
  select s.salary, s.joined into v_salary, v_joined from app.salary_and_joined(p_user) s;
  v_month_start := date_trunc('month', p_month)::date;
  v_month_end   := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_days_in_month := extract(day from v_month_end);
  v_per_day := coalesce(v_salary, 0) / v_days_in_month;
  -- never count future days, and never count days before the employee joined
  v_bound := least(v_month_end, app.local_date());
  v_from  := greatest(v_month_start, coalesce(v_joined, v_month_start));

  select
    count(*) filter (where status = 'absent'),
    count(*) filter (where status = 'half_day'),
    count(*) filter (where status = 'leave' and leave_paid),
    count(*) filter (where status = 'leave' and not leave_paid)
    into v_absent, v_half, v_leave_paid, v_leave_unpaid
  from public.attendance_records
  where user_id = p_user and work_date between v_from and v_bound
    and app.is_working_day(work_date)
    and not app.is_holiday(p_user, work_date);   -- a holiday is a paid day whatever the record says

  select count(*) into v_holidays
  from jsonb_array_elements(app.holidays_json(p_user, v_from, v_bound));

  return jsonb_build_object(
    'base_salary', v_salary, 'per_day_rate', round(v_per_day, 2), 'days_in_month', v_days_in_month,
    'absent_days', coalesce(v_absent, 0), 'half_days', coalesce(v_half, 0),
    'paid_leave_days', coalesce(v_leave_paid, 0), 'unpaid_leave_days', coalesce(v_leave_unpaid, 0),
    'holiday_days', coalesce(v_holidays, 0),
    'deduction', round(v_per_day * (coalesce(v_absent, 0) + 0.5 * coalesce(v_half, 0) + coalesce(v_leave_unpaid, 0)), 2),
    'payable_salary', round(coalesce(v_salary, 0) - v_per_day * (coalesce(v_absent, 0) + 0.5 * coalesce(v_half, 0) + coalesce(v_leave_unpaid, 0)), 2),
    'as_of', v_bound
  );
end $$;
revoke execute on function app.compute_payable(uuid, date) from public, anon, authenticated;

-- ---------- nightly close-out: nobody is absent on a holiday ----------
create or replace function app.close_missed_attendance() returns void
language plpgsql security definer set search_path = '' as $$
declare v_yesterday date := app.local_date() - 1;
begin
  if not app.is_working_day(v_yesterday) then return; end if;

  insert into public.attendance_records (user_id, work_date, status, auto_closed)
  select u.id, v_yesterday, 'absent', true
  from public.users u
  cross join lateral app.salary_and_joined(u.id) sj
  where u.is_active and u.account_status = 'active'
    and (sj.joined is null or sj.joined <= v_yesterday)
    and not app.is_holiday(u.id, v_yesterday)
  on conflict (user_id, work_date) do nothing;

  -- clocked in but never out: half day on a working day, simply "worked" on a holiday
  update public.attendance_records r
  set status = case when app.is_holiday(r.user_id, r.work_date) then 'present'::public.attendance_status else 'half_day'::public.attendance_status end,
      half_day_reason = case when app.is_holiday(r.user_id, r.work_date) then null else 'early_clockout' end,
      auto_closed = true
  where r.work_date = v_yesterday and r.clock_in_at is not null and r.clock_out_at is null and r.status is null;
end $$;
revoke execute on function app.close_missed_attendance() from public, anon, authenticated;

-- ---------- leave never lands on a holiday, and holidays never use quota ----------
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
    where user_id = p_user_id and status = 'leave' and leave_paid and extract(year from work_date) = v_year
      and not app.is_holiday(p_user_id, work_date);
  return jsonb_build_object('year', v_year, 'quota', v_quota, 'used', coalesce(v_used, 0),
                            'remaining', greatest(0, v_quota - coalesce(v_used, 0)));
end $$;

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
  v_holiday text;
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

  select (app.holidays_json(p_user_id, p_work_date, p_work_date) -> 0 ->> 'name') into v_holiday;
  if v_holiday is not null then
    raise exception '% is a holiday (%), so no leave is needed', to_char(p_work_date, 'FMDD Mon'), v_holiday;
  end if;

  select s.attendance_annual_paid_leave_days into v_quota from public.app_settings s where s.id = 1;
  select count(*) into v_paid_used from public.attendance_records
    where user_id = p_user_id and status = 'leave' and leave_paid
      and extract(year from work_date) = v_year and work_date <> p_work_date
      and not app.is_holiday(p_user_id, work_date);

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

-- ---------- reads: carry holidays to every calendar ----------
create or replace function public.attendance_today() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_row public.attendance_records;
  v_next text;
  v_late_count int;
  v_holiday jsonb;
  s public.app_settings;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into s from public.app_settings where id = 1;
  select * into v_row from public.attendance_records where user_id = auth.uid() and work_date = app.local_date();
  v_holiday := app.holidays_json(auth.uid(), app.local_date(), app.local_date()) -> 0;

  v_next := case
    when v_row.status = 'leave' then 'done'
    -- a holiday needs no punches; someone who chose to come in can still finish their day
    when v_holiday is not null and (v_row.id is null or v_row.clock_in_at is null) then 'done'
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
    'holiday', v_holiday,
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
    'holidays', app.holidays_json(auth.uid(), v_start, v_end),
    'summary', (
      select jsonb_build_object(
        'present',  count(*) filter (where r.status = 'present'),
        'half_day', count(*) filter (where r.status = 'half_day' and not app.is_holiday(r.user_id, r.work_date)),
        'absent',   count(*) filter (where r.status = 'absent'   and not app.is_holiday(r.user_id, r.work_date)),
        'leave',    count(*) filter (where r.status = 'leave'    and not app.is_holiday(r.user_id, r.work_date)),
        'late',     count(*) filter (where r.is_late),
        'holiday',  jsonb_array_length(app.holidays_json(auth.uid(), v_start, v_end)))
      from public.attendance_records r where r.user_id = auth.uid() and r.work_date between v_start and v_end));
end $$;

create or replace function public.attendance_detail(p_target uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  u public.users;
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only Boss or HR can view company attendance' using errcode = '42501'; end if;
  select * into u from public.users where id = p_target;
  if not found then raise exception 'Person not found'; end if;

  return jsonb_build_object(
    'person', jsonb_build_object('id', u.id, 'full_name', u.full_name, 'role', u.role),
    'records', coalesce((
      select jsonb_agg(app.attendance_record_json(r) order by r.work_date desc)
      from public.attendance_records r
      where r.user_id = p_target and r.work_date between v_start and v_end), '[]'::jsonb),
    'holidays', app.holidays_json(p_target, v_start, v_end),
    'salary', app.compute_payable(p_target, p_month));
end $$;

create or replace function public.attendance_overview(p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_start date := date_trunc('month', p_month)::date; v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only Boss or HR can view company attendance' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(row_data order by row_data ->> 'full_name') from (
      select jsonb_build_object(
        'user_id', u.id, 'full_name', u.full_name, 'role', u.role,
        'organization_id', u.organization_id,
        'department', (select d.name from public.departments d where d.id = u.department_id),
        'present',  count(r.id) filter (where r.status = 'present'),
        'half_day', count(r.id) filter (where r.status = 'half_day' and not app.is_holiday(u.id, r.work_date)),
        'absent',   count(r.id) filter (where r.status = 'absent'   and not app.is_holiday(u.id, r.work_date)),
        'leave',    count(r.id) filter (where r.status = 'leave'    and not app.is_holiday(u.id, r.work_date)),
        'late',     count(r.id) filter (where r.is_late)
      ) || app.compute_payable(u.id, p_month) as row_data
      from public.users u
      left join public.attendance_records r on r.user_id = u.id and r.work_date between v_start and v_end
      where u.is_active and u.account_status = 'active'
      group by u.id) sub), '[]'::jsonb);
end $$;

-- ---------- manage holidays (Boss: any company; HR: their own company, or all if HR has none) ----------
create or replace function app.holiday_scope_for_writer(p_org uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_my_org uuid;
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only Boss or HR can manage holidays' using errcode = '42501'; end if;
  if app.is_boss() then
    if p_org is not null and not exists (select 1 from public.organizations o where o.id = p_org) then
      raise exception 'Company not found';
    end if;
    return p_org;
  end if;
  select u.organization_id into v_my_org from public.users u where u.id = auth.uid();
  if v_my_org is null then return p_org; end if;
  if p_org is not null and p_org <> v_my_org then raise exception 'HR can only add holidays for their own company' using errcode = '42501'; end if;
  return v_my_org;
end $$;
revoke execute on function app.holiday_scope_for_writer(uuid) from public, anon, authenticated;

create or replace function app.notify_holiday_audience(p_org uuid, p_title text, p_body text, p_ref uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, ref_table, ref_id)
  select u.id, 'holiday', p_title, p_body, 'holidays', p_ref
  from public.users u
  where u.is_active and u.account_status = 'active'
    and (p_org is null or u.organization_id = p_org)
    and u.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
$$;
revoke execute on function app.notify_holiday_audience(uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.hr_add_holiday(
  p_name text, p_from date, p_to date default null, p_kind text default 'festival', p_org uuid default null
) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app.holiday_scope_for_writer(p_org);
  v_to date := coalesce(p_to, p_from);
  v_name text := trim(coalesce(p_name, ''));
  v_kind text := coalesce(nullif(trim(p_kind), ''), 'festival');
  v_day date;
  v_first uuid;
  v_id uuid;
  v_count int := 0;
begin
  if char_length(v_name) < 2 then raise exception 'Give the holiday a name'; end if;
  if char_length(v_name) > 80 then raise exception 'Holiday name is too long (80 characters max)'; end if;
  if v_kind not in ('festival', 'national', 'company', 'other') then raise exception 'Unknown holiday type'; end if;
  if p_from is null then raise exception 'Pick a date'; end if;
  if v_to < p_from then raise exception 'The end date is before the start date'; end if;
  if v_to - p_from > 30 then raise exception 'A holiday can span at most 31 days'; end if;

  for v_day in select g::date from generate_series(p_from, v_to, interval '1 day') g loop
    update public.holidays set name = v_name, kind = v_kind
      where holiday_date = v_day and organization_id is not distinct from v_org
      returning id into v_id;
    if not found then
      insert into public.holidays (holiday_date, name, kind, organization_id, created_by)
      values (v_day, v_name, v_kind, v_org, auth.uid())
      returning id into v_id;
    end if;
    v_first := coalesce(v_first, v_id);
    v_count := v_count + 1;
  end loop;

  perform app.audit('holiday.add', 'holidays', v_first, jsonb_build_object(
    'name', v_name, 'kind', v_kind, 'from', p_from, 'to', v_to, 'organization_id', v_org));

  -- tell people about holidays still to come (not ones entered after the fact)
  if v_to >= app.local_date() then
    perform app.notify_holiday_audience(v_org, 'Holiday: ' || v_name,
      case when v_to = p_from then to_char(p_from, 'FMDay, FMDD Mon YYYY')
           else to_char(p_from, 'FMDD Mon') || ' to ' || to_char(v_to, 'FMDD Mon YYYY') end
        || ' is a paid holiday. No need to clock in.',
      v_first);
  end if;
  return v_count;
end $$;

create or replace function public.hr_update_holiday(p_id uuid, p_name text, p_kind text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare h public.holidays; v_name text := trim(coalesce(p_name, ''));
begin
  select * into h from public.holidays where id = p_id;
  if not found then raise exception 'Holiday not found'; end if;
  perform app.holiday_scope_for_writer(h.organization_id);
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'Holiday name must be 2 to 80 characters'; end if;
  if p_kind is not null and p_kind not in ('festival', 'national', 'company', 'other') then raise exception 'Unknown holiday type'; end if;
  update public.holidays set name = v_name, kind = coalesce(p_kind, kind) where id = p_id;
  perform app.audit('holiday.update', 'holidays', p_id, jsonb_build_object('name', v_name, 'kind', coalesce(p_kind, h.kind)));
end $$;

create or replace function public.hr_delete_holiday(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare h public.holidays;
begin
  select * into h from public.holidays where id = p_id;
  if not found then raise exception 'Holiday not found'; end if;
  perform app.holiday_scope_for_writer(h.organization_id);
  delete from public.holidays where id = p_id;
  perform app.audit('holiday.delete', 'holidays', p_id, jsonb_build_object('name', h.name, 'date', h.holiday_date));
  if h.holiday_date >= app.local_date() then
    perform app.notify_holiday_audience(h.organization_id, 'Holiday cancelled: ' || h.name,
      to_char(h.holiday_date, 'FMDay, FMDD Mon YYYY') || ' is now a normal working day.', null);
  end if;
end $$;

-- the year's list: Boss/HR see every company's holidays, everyone else the ones that apply to them
create or replace function public.list_holidays(p_year int default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_year int := coalesce(p_year, extract(year from app.local_date())::int);
  v_my_org uuid;
  v_all boolean := app.is_boss() or app.is_hr();
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  select u.organization_id into v_my_org from public.users u where u.id = auth.uid();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', h.id, 'holiday_date', h.holiday_date, 'name', h.name, 'kind', h.kind,
             'organization_id', h.organization_id,
             'organization', (select o.name from public.organizations o where o.id = h.organization_id))
           order by h.holiday_date, h.organization_id nulls first)
    from public.holidays h
    where extract(year from h.holiday_date) = v_year
      and (v_all or h.organization_id is null or h.organization_id = v_my_org)), '[]'::jsonb);
end $$;

grant execute on function
  public.hr_add_holiday(text, date, date, text, uuid), public.hr_update_holiday(uuid, text, text),
  public.hr_delete_holiday(uuid), public.list_holidays(int)
  to authenticated;
revoke execute on function
  public.hr_add_holiday(text, date, date, text, uuid), public.hr_update_holiday(uuid, text, text),
  public.hr_delete_holiday(uuid), public.list_holidays(int)
  from public, anon;
