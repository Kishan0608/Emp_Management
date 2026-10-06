-- =====================================================================
-- ATTENDANCE SOURCE PER COMPANY
-- 'app'     : employees clock in / break / clock out in the app, and HR/Boss add or
--             correct days by hand (the default for every company).
-- 'machine' : the company has a punching machine. Its punches are imported by
--             HR/Boss (app.import_punch_records). Employees cannot punch in the app;
--             HR/Boss can still correct a day by hand.
-- =====================================================================

alter table public.organizations
  add column if not exists attendance_source text not null default 'app'
    check (attendance_source in ('app', 'machine'));

create or replace function app.attendance_source_for(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select o.attendance_source from public.users u join public.organizations o on o.id = u.organization_id where u.id = p_user),
    'app')
$$;

-- ---------- block self-service punches for machine companies ----------
-- Covers clock_in / break_start / break_end / clock_out, which all write as the employee.
-- The nightly job (no auth.uid()) and HR/Boss corrections (auth.uid() is not the employee) are not affected,
-- and the import sets a transaction flag to bypass the rule.
create or replace function app.block_self_punch_for_machine() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id = auth.uid()
     and coalesce(current_setting('app.attendance_import', true), '') <> 'on'
     and app.attendance_source_for(new.user_id) = 'machine' then
    raise exception 'Your company records attendance from the punching machine. Clock in and out are not used.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists attendance_block_self_punch on public.attendance_records;
create trigger attendance_block_self_punch before insert or update on public.attendance_records
  for each row execute function app.block_self_punch_for_machine();

-- ---------- Boss / HR: choose the source for a company ----------
create or replace function public.set_attendance_source(p_org uuid, p_source text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_boss() then raise exception 'Only the Boss can change how attendance is recorded' using errcode = '42501'; end if;
  if p_source not in ('app', 'machine') then raise exception 'Unknown attendance source'; end if;
  update public.organizations set attendance_source = p_source where id = p_org;
  if not found then raise exception 'Company not found'; end if;
  perform app.audit('organization.attendance_source', 'organizations', p_org, jsonb_build_object('attendance_source', p_source));
end $$;

-- ---------- Boss / HR: import punch-machine rows for one company ----------
-- p_rows: [{ "email": "...", "work_date": "YYYY-MM-DD", "clock_in": "HH:MM", "break_start": "HH:MM",
--            "break_end": "HH:MM", "clock_out": "HH:MM" }]   (times are the company's local time)
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
    select * into v_user from public.users
      where lower(email) = lower(r ->> 'email') and organization_id = p_org and is_active and account_status = 'active';
    if not found then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('email', r ->> 'email', 'reason', 'Not an active employee of this company'));
      continue;
    end if;

    begin
      v_work_date := (r ->> 'work_date')::date;
      v_ci := case when r ->> 'clock_in' is not null then ((r ->> 'work_date') || ' ' || (r ->> 'clock_in'))::timestamp at time zone v_tz end;
      v_bs := case when r ->> 'break_start' is not null then ((r ->> 'work_date') || ' ' || (r ->> 'break_start'))::timestamp at time zone v_tz end;
      v_be := case when r ->> 'break_end' is not null then ((r ->> 'work_date') || ' ' || (r ->> 'break_end'))::timestamp at time zone v_tz end;
      v_co := case when r ->> 'clock_out' is not null then ((r ->> 'work_date') || ' ' || (r ->> 'clock_out'))::timestamp at time zone v_tz end;
    exception when others then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('email', r ->> 'email', 'reason', 'Date or time not readable'));
      continue;
    end;

    if v_ci is null then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('email', r ->> 'email', 'reason', 'No clock-in time'));
      continue;
    end if;
    if v_co is not null and v_co <= v_ci then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('email', r ->> 'email', 'reason', 'Clock-out is before clock-in'));
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

-- ---------- grants: new functions need their own grant (see migration 027) ----------
grant execute on function public.set_attendance_source(uuid, text), public.import_punch_records(uuid, jsonb) to authenticated;
revoke execute on function public.set_attendance_source(uuid, text), public.import_punch_records(uuid, jsonb) from public, anon;
revoke execute on function app.attendance_source_for(uuid), app.block_self_punch_for_machine() from public, anon, authenticated;
