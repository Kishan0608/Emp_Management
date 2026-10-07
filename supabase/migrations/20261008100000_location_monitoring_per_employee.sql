-- =====================================================================
-- 044 LOCATION ALERTS: rules per employee (replaces the shared rules)
--
-- Turning "Monitor location" on for a person now stores THEIR rules:
--   office time      work_start - work_end (only checked inside it)
--   employee_after   minutes a problem lasts before the employee is notified
--   manager_after    further minutes before their manager + HR are notified
-- Still skipped: weekly off, holidays, approved leave, breaks, after clock-out.
-- Fixed behaviour (no settings): manager + HR are told; a reason from the
-- employee pauses escalation 30 min, once a day; no reminder or repeat.
-- users.location_monitored stays the on/off switch; the rules row is kept
-- when monitoring is switched off, so switching back on pre-fills it.
-- The unused shared-rule columns are removed in 20261008100100 (optional).
-- =====================================================================

create table if not exists public.location_monitoring (
  user_id            uuid primary key references public.users(id) on update cascade on delete cascade,
  work_start         time not null,
  work_end           time not null,
  employee_after_min int  not null check (employee_after_min between 1 and 240),
  manager_after_min  int  not null check (manager_after_min between 1 and 480),
  updated_by         uuid references public.users(id) on update cascade on delete set null,
  updated_at         timestamptz not null default now(),
  constraint location_monitoring_hours check (work_end > work_start)
);
alter table public.location_monitoring enable row level security;
revoke all on public.location_monitoring from anon, authenticated;
grant select on public.location_monitoring to authenticated;
create policy location_monitoring_read on public.location_monitoring for select to authenticated
  using ((select app.is_boss()) or (select app.is_hr()) or user_id = (select auth.uid()));
create index if not exists location_monitoring_updated_by_idx on public.location_monitoring (updated_by);

-- Switch on (with the person's rules) or update the rules
create or replace function public.admin_set_location_monitoring_rule(
  p_user uuid, p_work_start time, p_work_end time, p_employee_after_min int, p_manager_after_min int
) returns void language plpgsql security definer set search_path to '' as $function$
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only the Boss or HR can change location monitoring' using errcode = '42501'; end if;
  if not exists (select 1 from public.users where id = p_user and is_active) then raise exception 'Person not found'; end if;
  if p_work_start is null or p_work_end is null or p_work_end <= p_work_start then raise exception 'Office end time must be after the start time'; end if;
  if p_employee_after_min is null or p_employee_after_min not between 1 and 240 then raise exception 'Employee notification: 1 to 240 minutes'; end if;
  if p_manager_after_min is null or p_manager_after_min not between 1 and 480 then raise exception 'Manager notification: 1 to 480 minutes'; end if;

  insert into public.location_monitoring (user_id, work_start, work_end, employee_after_min, manager_after_min, updated_by, updated_at)
  values (p_user, p_work_start, p_work_end, p_employee_after_min, p_manager_after_min, auth.uid(), now())
  on conflict (user_id) do update set
    work_start = excluded.work_start, work_end = excluded.work_end,
    employee_after_min = excluded.employee_after_min, manager_after_min = excluded.manager_after_min,
    updated_by = excluded.updated_by, updated_at = now();
  update public.users set location_monitored = true where id = p_user;
  perform app.audit('location.monitor_rule', 'users', p_user, jsonb_build_object(
    'office', p_work_start::text || '-' || p_work_end::text, 'employee_after_min', p_employee_after_min, 'manager_after_min', p_manager_after_min));
end $function$;
grant execute on function public.admin_set_location_monitoring_rule(uuid, time, time, int, int) to authenticated;
revoke execute on function public.admin_set_location_monitoring_rule(uuid, time, time, int, int) from public, anon;

-- On/off switch: switching on needs the person's rules first
create or replace function public.admin_set_location_monitoring(p_users uuid[], p_on boolean)
 returns integer language plpgsql security definer set search_path to '' as $function$
declare v_n int;
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only the Boss or HR can change location monitoring' using errcode = '42501'; end if;
  if p_on and exists (select 1 from unnest(p_users) x(id) where not exists (select 1 from public.location_monitoring m where m.user_id = x.id)) then
    raise exception 'Set the office time and notification minutes first';
  end if;
  update public.users set location_monitored = p_on
   where id = any (p_users) and location_monitored is distinct from p_on;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform app.audit(case when p_on then 'location.monitor_on' else 'location.monitor_off' end, 'users', null,
                      jsonb_build_object('users', to_jsonb(p_users), 'changed', v_n));
  end if;
  return v_n;
end $function$;

-- Escalation goes to the person's manager + HR of their company
create or replace function app.location_alert_recipients(p_user uuid)
 returns setof uuid language sql stable security definer set search_path to '' as $function$
  with me as (select * from public.users where id = p_user)
  select distinct r.id from (
    select m.id from me join public.users m on m.id = me.manager_id
     where m.is_active and m.account_status = 'active'
    union all
    select h.id from me, public.users h
     where h.role = 'hr' and h.is_active and h.account_status = 'active'
       and (h.organization_id is null or me.organization_id is null or h.organization_id = me.organization_id)
  ) r
  where r.id <> p_user
$function$;

-- The employee's alert screen
create or replace function public.my_location_alert(p_alert uuid)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare a public.location_alerts; v_mgr int;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into a from public.location_alerts where id = p_alert and user_id = auth.uid();
  if not found then raise exception 'Alert not found'; end if;
  select manager_after_min into v_mgr from public.location_monitoring where user_id = a.user_id;
  return to_jsonb(a) || jsonb_build_object(
    'escalate_after_min', coalesce(v_mgr, 15),
    'pause_min', 30,
    'can_pause', a.resolved_at is null and a.escalated_at is null
                 and not exists (select 1 from public.location_alerts x
                                  where x.user_id = a.user_id and x.work_date = a.work_date and x.paused_until is not null));
end $function$;

create or replace function public.location_alert_reason(p_alert uuid, p_reason text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare a public.location_alerts; v_reason text := trim(coalesce(p_reason, '')); v_pause timestamptz; u public.users;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if char_length(v_reason) < 2 or char_length(v_reason) > 200 then raise exception 'Write a short reason (2-200 characters)'; end if;
  select * into a from public.location_alerts where id = p_alert and user_id = auth.uid() for update;
  if not found then raise exception 'Alert not found'; end if;
  if a.resolved_at is not null then raise exception 'This alert is already closed'; end if;
  select * into u from public.users where id = auth.uid();

  -- one 30-minute pause per day, only before the manager / HR were told
  if a.escalated_at is null
     and not exists (select 1 from public.location_alerts x where x.user_id = a.user_id and x.work_date = a.work_date and x.paused_until is not null) then
    v_pause := now() + interval '30 minutes';
  end if;

  update public.location_alerts
     set reason = v_reason, reason_at = now(), paused_until = coalesce(v_pause, paused_until)
   where id = a.id;

  if a.escalated_at is not null then
    perform app.location_alert_tell_team(a.user_id, u.full_name || ' replied', '"' || v_reason || '"');
  end if;
  perform app.audit('location.alert_reason', 'location_alerts', a.id, jsonb_build_object('reason', v_reason));
  return jsonb_build_object('paused_until', v_pause);
end $function$;

-- The check, every 2 minutes, with each person's own rules
create or replace function app.location_alert_tick()
 returns void language plpgsql security definer set search_path to '' as $function$
declare
  s public.app_settings;
  v_tz text := app.attendance_tz();
  v_today date := app.local_date();
  v_now timestamptz := now();
  v_local_time time := (now() at time zone app.attendance_tz())::time;
  p record;
  a public.location_alerts;
  v_working boolean;
  v_office_start timestamptz;
  v_kind text;
  v_since timestamptz;
  v_last timestamptz;
  v_escalate_at timestamptz;
  v_name text;
begin
  select * into s from public.app_settings where id = 1;

  for p in
    select u.id, u.full_name, u.organization_id, u.location_monitored, u.location_sharing_enabled,
           u.location_sharing_changed_at, u.location_device_status, u.location_status_at,
           m.work_start, m.work_end, m.employee_after_min, m.manager_after_min,
           r.clock_out_at, r.break_start_at, r.break_end_at, r.status
    from public.users u
    left join public.location_monitoring m on m.user_id = u.id
    left join public.attendance_records r on r.user_id = u.id and r.work_date = v_today
    where u.is_active and u.account_status = 'active'
      and (u.location_monitored or exists (select 1 from public.location_alerts x where x.user_id = u.id and x.resolved_at is null))
  loop
    -- Inside this person's office time on a working day, not on leave / a break, not clocked out?
    v_working := p.location_monitored and p.work_start is not null
      and v_local_time >= p.work_start and v_local_time < p.work_end
      and p.clock_out_at is null
      and coalesce(p.status::text, 'present') <> 'leave'
      and not (p.break_start_at is not null and (p.break_end_at is null or p.break_end_at < p.break_start_at))
      and extract(dow from v_today)::int <> s.attendance_weekly_off_dow
      and not exists (select 1 from public.holidays h where h.holiday_date = v_today
                        and (h.organization_id is null or h.organization_id = p.organization_id));

    v_kind := null;
    if v_working then
      v_office_start := (v_today + p.work_start) at time zone v_tz;
      select to_timestamp(0) + (ld.last_point ->> 0)::bigint * interval '1 millisecond' into v_last
        from public.location_days ld
       where ld.user_id = p.id and ld.last_point is not null
       order by ld.work_date desc limit 1;

      -- never count time before office start or before the end of a break
      if not p.location_sharing_enabled then
        v_kind := 'sharing_off';
        v_since := greatest(coalesce(p.location_sharing_changed_at, v_office_start), v_office_start, coalesce(p.break_end_at, v_office_start));
      elsif p.location_device_status in ('services_off', 'permission_denied') then
        v_kind := 'gps_off';
        v_since := greatest(coalesce(p.location_status_at, v_office_start), v_office_start, coalesce(p.break_end_at, v_office_start));
      else
        v_since := greatest(coalesce(v_last, v_office_start), v_office_start, coalesce(p.break_end_at, v_office_start));
        if v_since < v_now - interval '5 minutes' then v_kind := 'no_update'; end if;
      end if;
    end if;

    select * into a from public.location_alerts where user_id = p.id and resolved_at is null;

    -- Fixed, outside office time, on a break or leave, or no longer monitored: close it
    if v_kind is null then
      if a.id is not null then
        update public.location_alerts set resolved_at = v_now where id = a.id;
        if a.escalated_at is not null then
          perform app.location_alert_tell_team(p.id, p.full_name || ' is back online',
            'Location problem from ' || app.local_time_label(a.started_at) || ' is closed (' ||
            greatest(1, round(extract(epoch from v_now - a.started_at) / 60))::int || ' min).');
        end if;
      end if;
      continue;
    end if;

    if a.id is null then
      insert into public.location_alerts (user_id, work_date, kind, started_at)
      values (p.id, v_today, v_kind, v_since)
      returning * into a;
    elsif a.kind <> v_kind then
      update public.location_alerts set kind = v_kind where id = a.id returning * into a;
    end if;

    -- Until the employee is told, an alert never counts time before office start or a break's end
    if a.employee_notified_at is null
       and a.started_at < greatest(v_office_start, coalesce(p.break_end_at, v_office_start)) then
      update public.location_alerts set started_at = greatest(v_office_start, coalesce(p.break_end_at, v_office_start))
       where id = a.id returning * into a;
    end if;

    v_name := split_part(p.full_name, ' ', 1);

    -- Step 1: the employee, after their employee_after_min
    if a.employee_notified_at is null then
      if v_now >= a.started_at + make_interval(mins => p.employee_after_min) then
        perform app.notify(p.id, 'location_alert',
          case a.kind when 'sharing_off' then 'Location sharing is off'
                      when 'gps_off'     then 'Your GPS is off'
                      else 'SKFL can''t see your location' end,
          case a.kind when 'sharing_off' then 'It is office time. Turn it back on in SKFL: More → Location sharing.'
                      when 'gps_off'     then 'Turn on location / GPS so your location keeps updating.'
                      else 'Check GPS and internet, and open SKFL. Tap to tell your manager why.' end,
          'location_alerts', a.id);
        update public.location_alerts set employee_notified_at = v_now where id = a.id;
      end if;
      continue;
    end if;

    -- Step 2: manager + HR, manager_after_min later (or after the employee's 30-min pause)
    if a.escalated_at is null then
      v_escalate_at := greatest(a.employee_notified_at + make_interval(mins => p.manager_after_min),
                                coalesce(a.paused_until, a.employee_notified_at));
      if v_now >= v_escalate_at then
        perform app.location_alert_tell_team(p.id,
          p.full_name || ': location problem',
          initcap(left(app.location_alert_text(a.kind), 1)) || substr(app.location_alert_text(a.kind), 2) ||
          ' since ' || app.local_time_label(a.started_at) || '. ' || v_name || ' was notified at ' ||
          app.local_time_label(a.employee_notified_at) || ' and has not fixed it.' ||
          case when a.reason is not null then ' Reason given: "' || a.reason || '".' else '' end);
        update public.location_alerts set escalated_at = v_now where id = a.id;
      end if;
    end if;
  end loop;
end $function$;
revoke execute on function app.location_alert_tick() from public, anon, authenticated;
