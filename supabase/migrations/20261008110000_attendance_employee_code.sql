-- =====================================================================
-- PUNCHING-MACHINE IMPORT: match by employee code, not email
-- Timestamp machines identify people by an enrollment number / card ID,
-- not email. Boss/HR set each person's code once; the importer matches on
-- it. Email matching is kept as a fallback for rows that carry no code.
-- =====================================================================

alter table public.users add column if not exists employee_code text;

-- One code per company (case/space-insensitive), not globally: two different
-- companies' machines may both use "001".
drop index if exists users_employee_code_idx;
create unique index users_employee_code_idx on public.users (organization_id, upper(trim(employee_code)))
  where employee_code is not null and trim(employee_code) <> '';

create or replace function public.admin_set_employee_code(p_user_id uuid, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_code text := nullif(trim(p_code), '');
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only the Boss or HR can set the employee code' using errcode = '42501'; end if;
  update public.users set employee_code = v_code, updated_at = now() where id = p_user_id;
  if not found then raise exception 'Person not found'; end if;
  perform app.audit('employee_details.employee_code', 'users', p_user_id, jsonb_build_object('employee_code', v_code));
exception when unique_violation then
  raise exception 'Another person in this company already has that employee code';
end $$;

-- Separate, deliberately tiny read: lets the edit screen prefill the field without
-- touching get_employee_profile, which this project's live function has moved beyond
-- what's in this migration history (it now reads from employee_details, not users).
create or replace function public.admin_get_employee_code(p_user_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when app.is_boss() or app.is_hr() then
    (select u.employee_code from public.users u where u.id = p_user_id)
  else null end
$$;

grant execute on function public.admin_set_employee_code(uuid, text), public.admin_get_employee_code(uuid) to authenticated;
revoke execute on function public.admin_set_employee_code(uuid, text), public.admin_get_employee_code(uuid) from public, anon;

-- ---------- import_punch_records: match by employee_code first, email as a fallback ----------
create or replace function public.import_punch_records(p_org uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  v_user public.users;
  v_tz text := app.attendance_tz();
  v_work_date date;
  v_ci timestamptz; v_bs timestamptz; v_be timestamptz; v_co timestamptz;
  s public.app_settings;
  v_late boolean; v_late_minutes int; v_worked int; v_status public.attendance_status; v_reason text;
  v_imported int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_late_count int; v_limit int;
  v_code text; v_email text;
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only the Boss or HR can import punches' using errcode = '42501'; end if;
  if not exists (select 1 from public.organizations where id = p_org and attendance_source = 'machine') then
    raise exception 'Set this company to punching machine first';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import takes a list of up to 5000 rows';
  end if;

  perform set_config('app.attendance_import', 'on', true);
  select * into s from public.app_settings where id = 1;
  v_limit := s.attendance_late_warning_limit;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_code := nullif(trim(r ->> 'employee_code'), '');
    v_email := nullif(trim(r ->> 'email'), '');

    if v_code is not null then
      select * into v_user from public.users
        where organization_id = p_org and upper(trim(employee_code)) = upper(v_code) and is_active and account_status = 'active';
    end if;
    if not found and v_email is not null then
      select * into v_user from public.users
        where lower(email) = lower(v_email) and organization_id = p_org and is_active and account_status = 'active';
    end if;
    if not found then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'email', coalesce(v_code, v_email, '(no code or email)'),
        'reason', case when v_code is not null then 'No active employee has this employee code' else 'Not an active employee of this company' end));
      continue;
    end if;

    begin
      v_work_date := (r ->> 'work_date')::date;
      v_ci := case when r ->> 'clock_in' is not null then ((r ->> 'work_date') || ' ' || (r ->> 'clock_in'))::timestamp at time zone v_tz end;
      v_bs := case when r ->> 'break_start' is not null then ((r ->> 'work_date') || ' ' || (r ->> 'break_start'))::timestamp at time zone v_tz end;
      v_be := case when r ->> 'break_end' is not null then ((r ->> 'work_date') || ' ' || (r ->> 'break_end'))::timestamp at time zone v_tz end;
      v_co := case when r ->> 'clock_out' is not null then ((r ->> 'work_date') || ' ' || (r ->> 'clock_out'))::timestamp at time zone v_tz end;
    exception when others then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('email', coalesce(v_code, v_email), 'reason', 'Date or time not readable'));
      continue;
    end;

    if v_ci is null then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('email', coalesce(v_code, v_email), 'reason', 'No clock-in time'));
      continue;
    end if;
    if v_co is not null and v_co <= v_ci then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('email', coalesce(v_code, v_email), 'reason', 'Clock-out is before clock-in'));
      continue;
    end if;

    -- Same lateness and half-day rules as the app's own punches.
    v_late := (v_ci at time zone v_tz)::time > (s.attendance_work_start + make_interval(mins => s.attendance_late_grace_minutes));
    v_late_minutes := case when v_late then greatest(0, extract(epoch from ((v_ci at time zone v_tz)::time - (s.attendance_work_start + make_interval(mins => s.attendance_late_grace_minutes)))) / 60)::int else 0 end;
    v_worked := case when v_co is null then null else greatest(0, (extract(epoch from (v_co - v_ci - coalesce(v_be - v_bs, interval '0'))) / 60)::int) end;

    insert into public.attendance_records (user_id, work_date, clock_in_at, break_start_at, break_end_at, clock_out_at, is_late, late_minutes, worked_minutes)
    values (v_user.id, v_work_date, v_ci, v_bs, v_be, v_co, v_late, v_late_minutes, v_worked)
    on conflict (user_id, work_date) do update set
      clock_in_at = excluded.clock_in_at, break_start_at = excluded.break_start_at, break_end_at = excluded.break_end_at,
      clock_out_at = excluded.clock_out_at, is_late = excluded.is_late, late_minutes = excluded.late_minutes,
      worked_minutes = excluded.worked_minutes, auto_closed = false;

    -- Status once the day is closed (same as clock_out).
    if v_co is not null then
      select count(*) into v_late_count from public.attendance_records
        where user_id = v_user.id and is_late and date_trunc('month', work_date) = date_trunc('month', v_work_date);
      if (v_co at time zone v_tz)::time <= s.attendance_half_day_cutoff then
        v_status := 'half_day'; v_reason := 'early_clockout';
      elsif v_late and v_late_count > v_limit then
        v_status := 'half_day'; v_reason := 'late_streak';
      else
        v_status := 'present'; v_reason := null;
      end if;
      update public.attendance_records set status = v_status, half_day_reason = v_reason
        where user_id = v_user.id and work_date = v_work_date;
    end if;

    v_imported := v_imported + 1;
  end loop;

  perform app.audit('attendance.import', 'organizations', p_org, jsonb_build_object('imported', v_imported, 'skipped', jsonb_array_length(v_skipped)));
  return jsonb_build_object('imported', v_imported, 'skipped', v_skipped);
end $$;
