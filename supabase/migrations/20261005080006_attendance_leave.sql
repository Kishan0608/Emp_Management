-- =====================================================================
-- 029 ATTENDANCE: HR-marked leave, paid-leave quota, and salary impact
-- HR/Boss can mark a day as leave (with a reason and an optional
-- attachment, e.g. a medical certificate). Each employee gets a paid
-- leave quota of 1.5 days/month (18 days/year); leave beyond the quota
-- is unpaid and deducted from salary exactly like an absent day.
-- Manager and Employee get no execute grant on the write RPCs.
-- =====================================================================

alter type public.attendance_status add value if not exists 'leave';

alter table public.attendance_records
  add column leave_reason           text,
  add column leave_paid             boolean,
  add column leave_attachment_path  text;

alter table public.app_settings
  add column attendance_annual_paid_leave_days numeric not null default 18;  -- 1.5 days/month x 12

grant update (attendance_annual_paid_leave_days) on public.app_settings to authenticated;
-- covered by the existing settings_boss_update policy (migration 002) — no new policy needed.

-- ---------- HR marks/edits a day as leave ----------
create or replace function public.hr_mark_leave(
  p_user_id uuid, p_work_date date, p_reason text, p_attachment_path text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_year int := extract(year from p_work_date)::int;
  v_quota numeric;
  v_paid_used int;
  v_paid boolean;
  v_row public.attendance_records;
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only Boss or HR can mark leave' using errcode = '42501'; end if;
  if app.is_hr() and p_user_id = auth.uid() then raise exception 'HR cannot mark leave for themselves'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  if not exists (select 1 from public.users where id = p_user_id) then raise exception 'Person not found'; end if;

  select s.attendance_annual_paid_leave_days into v_quota from public.app_settings s where s.id = 1;

  select count(*) into v_paid_used from public.attendance_records
    where user_id = p_user_id and status = 'leave' and leave_paid
      and extract(year from work_date) = v_year and work_date <> p_work_date;

  v_paid := v_paid_used < v_quota;

  insert into public.attendance_records
    (user_id, work_date, status, leave_reason, leave_paid, leave_attachment_path,
     clock_in_at, break_start_at, break_end_at, clock_out_at, is_late, late_minutes, worked_minutes, half_day_reason, auto_closed)
  values
    (p_user_id, p_work_date, 'leave', trim(p_reason), v_paid, p_attachment_path,
     null, null, null, null, false, null, null, null, false)
  on conflict (user_id, work_date) do update set
    status = 'leave', leave_reason = excluded.leave_reason, leave_paid = excluded.leave_paid,
    leave_attachment_path = coalesce(excluded.leave_attachment_path, public.attendance_records.leave_attachment_path),
    clock_in_at = null, break_start_at = null, break_end_at = null, clock_out_at = null,
    is_late = false, late_minutes = null, worked_minutes = null, half_day_reason = null, auto_closed = false
  returning * into v_row;

  perform app.audit('attendance.hr_mark_leave', 'attendance_records', p_user_id, jsonb_build_object(
    'work_date', p_work_date, 'reason', v_row.leave_reason, 'paid', v_paid));
  perform app.notify(p_user_id, 'attendance', case when v_paid then 'Leave marked (paid)' else 'Leave marked (unpaid)' end,
    to_char(p_work_date, 'FMDD Mon YYYY') || ' was marked as leave by HR.' ||
      case when v_paid then '' else ' This exceeds your paid leave quota and will be deducted from salary.' end,
    'attendance_records', v_row.id);

  return jsonb_build_object(
    'id', v_row.id, 'work_date', v_row.work_date, 'clock_in_at', v_row.clock_in_at, 'break_start_at', v_row.break_start_at,
    'break_end_at', v_row.break_end_at, 'clock_out_at', v_row.clock_out_at, 'status', v_row.status,
    'half_day_reason', v_row.half_day_reason, 'is_late', v_row.is_late, 'late_minutes', v_row.late_minutes,
    'worked_minutes', v_row.worked_minutes, 'auto_closed', v_row.auto_closed,
    'leave_reason', v_row.leave_reason, 'leave_paid', v_row.leave_paid, 'leave_attachment_path', v_row.leave_attachment_path);
end $$;

-- ---------- HR cancels a previously marked leave ----------
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

-- ---------- paid-leave balance for the year (HR/Boss for anyone, self for own) ----------
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
  return jsonb_build_object('year', v_year, 'quota', v_quota, 'used', coalesce(v_used, 0), 'remaining', greatest(0, v_quota - coalesce(v_used, 0)));
end $$;

-- ---------- compute_payable: unpaid leave deducts exactly like an absent day ----------
-- Also reports 'as_of' (migration 20261005080005): the last date the deduction actually
-- covers, so the client can label a still-in-progress month's Payable figure accordingly.
create or replace function app.compute_payable(p_user uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_salary numeric; v_joined date; v_days_in_month int; v_per_day numeric;
  v_absent int; v_half int; v_leave_paid int; v_leave_unpaid int;
  v_month_start date; v_month_end date; v_bound date;
begin
  select salary_monthly, joined_on into v_salary, v_joined from public.users where id = p_user;
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

-- ---------- include leave fields in the per-record jsonb returned to clients ----------
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
    'record', case when v_row.id is null then null else jsonb_build_object(
      'id', v_row.id, 'work_date', v_row.work_date, 'clock_in_at', v_row.clock_in_at,
      'break_start_at', v_row.break_start_at, 'break_end_at', v_row.break_end_at, 'clock_out_at', v_row.clock_out_at,
      'status', v_row.status, 'half_day_reason', v_row.half_day_reason, 'is_late', v_row.is_late,
      'late_minutes', v_row.late_minutes, 'worked_minutes', v_row.worked_minutes,
      'leave_reason', v_row.leave_reason, 'leave_paid', v_row.leave_paid, 'leave_attachment_path', v_row.leave_attachment_path) end,
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
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'work_date', r.work_date, 'clock_in_at', r.clock_in_at, 'break_start_at', r.break_start_at,
        'break_end_at', r.break_end_at, 'clock_out_at', r.clock_out_at, 'status', r.status,
        'half_day_reason', r.half_day_reason, 'is_late', r.is_late, 'late_minutes', r.late_minutes,
        'worked_minutes', r.worked_minutes, 'auto_closed', r.auto_closed,
        'leave_reason', r.leave_reason, 'leave_paid', r.leave_paid, 'leave_attachment_path', r.leave_attachment_path) order by r.work_date desc)
      from public.attendance_records r where r.user_id = auth.uid() and r.work_date between v_start and v_end), '[]'::jsonb),
    'summary', (
      select jsonb_build_object(
        'present', count(*) filter (where r.status = 'present'), 'half_day', count(*) filter (where r.status = 'half_day'),
        'absent', count(*) filter (where r.status = 'absent'), 'late', count(*) filter (where r.is_late))
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
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'work_date', r.work_date, 'clock_in_at', r.clock_in_at, 'break_start_at', r.break_start_at,
        'break_end_at', r.break_end_at, 'clock_out_at', r.clock_out_at, 'status', r.status,
        'half_day_reason', r.half_day_reason, 'is_late', r.is_late, 'late_minutes', r.late_minutes,
        'worked_minutes', r.worked_minutes, 'auto_closed', r.auto_closed,
        'leave_reason', r.leave_reason, 'leave_paid', r.leave_paid, 'leave_attachment_path', r.leave_attachment_path) order by r.work_date desc)
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

create policy "leave attachments: upload by hr or boss" on storage.objects for insert to authenticated
with check (bucket_id = 'leave-attachments' and (app.is_boss() or app.is_hr()));

create policy "leave attachments: read if owner, hr, or boss" on storage.objects for select to authenticated
using (
  bucket_id = 'leave-attachments' and (
    app.is_boss() or app.is_hr() or (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- ---------- grants: every new function needs its own pair ----------
grant execute on function
  public.hr_mark_leave(uuid, date, text, text), public.hr_cancel_leave(uuid, date), public.leave_balance(uuid, int)
  to authenticated;
revoke execute on function
  public.hr_mark_leave(uuid, date, text, text), public.hr_cancel_leave(uuid, date), public.leave_balance(uuid, int)
  from public, anon;
