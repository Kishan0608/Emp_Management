-- =====================================================================
-- 048 LOCATION ALERTS: a reason no longer pauses anything
-- The manager + HR are told exactly manager_after_min after the employee
-- notice. If the employee sent a reason, it is included in their message
-- ("Reason given: ..."), otherwise "No reason given." One reason per alert.
-- location_alerts.paused_until is no longer used (cleared here).
-- =====================================================================
create or replace function public.location_alert_reason(p_alert uuid, p_reason text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare a public.location_alerts; v_reason text := trim(coalesce(p_reason, '')); u public.users;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if char_length(v_reason) < 2 or char_length(v_reason) > 200 then raise exception 'Write a short reason (2-200 characters)'; end if;
  select * into a from public.location_alerts where id = p_alert and user_id = auth.uid() for update;
  if not found then raise exception 'Alert not found'; end if;
  if a.resolved_at is not null then raise exception 'This alert is already closed'; end if;
  if a.reason is not null then raise exception 'You have already sent a reason for this alert'; end if;
  select * into u from public.users where id = auth.uid();

  -- The reason does not delay anything: it is added to the manager / HR alert
  update public.location_alerts set reason = v_reason, reason_at = now() where id = a.id;

  if a.escalated_at is not null then
    -- they were already told: pass the reason on
    perform app.location_alert_tell_team(a.user_id, u.full_name || ' replied', '"' || v_reason || '"');
  end if;
  perform app.audit('location.alert_reason', 'location_alerts', a.id, jsonb_build_object('reason', v_reason));
  return jsonb_build_object('paused_until', null);
end $function$;

create or replace function public.my_location_alert(p_alert uuid)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare a public.location_alerts; v_mgr int;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into a from public.location_alerts where id = p_alert and user_id = auth.uid();
  if not found then raise exception 'Alert not found'; end if;
  select manager_after_min into v_mgr from public.location_monitoring where user_id = a.user_id;
  return (to_jsonb(a) - 'paused_until') || jsonb_build_object(
    'paused_until', null,
    'escalate_after_min', coalesce(v_mgr, 15),
    'pause_min', 0,
    'can_pause', false);
end $function$;

-- Pauses from before this change no longer delay anything
update public.location_alerts set paused_until = null where paused_until is not null;

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

    -- Step 2: manager + HR exactly manager_after_min after the employee was told; the reason (if any) is included
    if a.escalated_at is null and v_now >= a.employee_notified_at + make_interval(mins => p.manager_after_min) then
      perform app.location_alert_tell_team(p.id,
        p.full_name || ': location problem',
        initcap(left(app.location_alert_text(a.kind), 1)) || substr(app.location_alert_text(a.kind), 2) ||
        ' since ' || app.local_time_label(a.started_at) || '. ' || v_name || ' was notified at ' ||
        app.local_time_label(a.employee_notified_at) || ' and has not fixed it.' ||
        case when a.reason is not null then ' Reason given: "' || a.reason || '".' else ' No reason given.' end);
      update public.location_alerts set escalated_at = v_now where id = a.id;
    end if;
  end loop;
end $function$;
revoke execute on function app.location_alert_tick() from public, anon, authenticated;
