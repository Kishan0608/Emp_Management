-- =====================================================================
-- 028 ATTENDANCE: HR manual punch correction
-- Lets HR/Boss fix a day's clock-in / break / clock-out when an employee
-- forgot to punch (most commonly a missing clock-out). Manager and
-- Employee get no execute grant on this function.
-- =====================================================================

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
  if p_clock_in is null and (p_break_start is not null or p_break_end is not null or p_clock_out is not null) then
    raise exception 'Clock-in time is required';
  end if;
  if p_break_end is not null and p_break_start is null then raise exception 'Break start is required before break end'; end if;
  if p_break_start is not null and p_break_end is not null and p_break_end <= p_break_start then
    raise exception 'Break end must be after break start';
  end if;
  if p_clock_out is not null and p_clock_out <= p_clock_in then raise exception 'Clock-out must be after clock-in'; end if;

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
  end if;

  insert into public.attendance_records
    (user_id, work_date, clock_in_at, break_start_at, break_end_at, clock_out_at, is_late, late_minutes, worked_minutes, status, half_day_reason, auto_closed)
  values
    (p_user_id, p_work_date, p_clock_in, p_break_start, p_break_end, p_clock_out, coalesce(v_late, false), v_late_minutes, v_worked, v_status, v_reason, false)
  on conflict (user_id, work_date) do update set
    clock_in_at = excluded.clock_in_at, break_start_at = excluded.break_start_at, break_end_at = excluded.break_end_at,
    clock_out_at = excluded.clock_out_at, is_late = excluded.is_late, late_minutes = excluded.late_minutes,
    worked_minutes = excluded.worked_minutes, status = excluded.status, half_day_reason = excluded.half_day_reason,
    auto_closed = false
  returning * into v_row;

  perform app.audit('attendance.hr_edit', 'attendance_records', p_user_id, jsonb_build_object(
    'work_date', p_work_date, 'clock_in_at', p_clock_in, 'break_start_at', p_break_start,
    'break_end_at', p_break_end, 'clock_out_at', p_clock_out, 'status', v_status));

  return jsonb_build_object(
    'id', v_row.id, 'work_date', v_row.work_date, 'clock_in_at', v_row.clock_in_at, 'break_start_at', v_row.break_start_at,
    'break_end_at', v_row.break_end_at, 'clock_out_at', v_row.clock_out_at, 'status', v_row.status,
    'half_day_reason', v_row.half_day_reason, 'is_late', v_row.is_late, 'late_minutes', v_row.late_minutes,
    'worked_minutes', v_row.worked_minutes, 'auto_closed', v_row.auto_closed);
end $$;

grant execute on function public.hr_edit_attendance(uuid, date, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;
revoke execute on function public.hr_edit_attendance(uuid, date, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
