-- =====================================================================
-- 041 LOCATION ALERTS: employee first, then manager + HR
--
-- For people marked "Monitor location", while they are clocked in (not on a
-- break, not on leave, not a holiday or weekly off) a job every 2 minutes
-- checks their location:
--   sharing_off  location sharing switched off
--   gps_off      phone reports GPS off or location permission removed
--   no_update    no new point for 5+ minutes (phone off, no network, app killed)
--
-- Timeline (all minutes set in app_settings):
--   problem lasts  location_alert_employee_min  -> notify the EMPLOYEE
--   + location_alert_remind_min                 -> remind the employee (0 = off)
--   + location_alert_escalate_min               -> notify MANAGER / HR / Boss
--   + location_alert_repeat_min                 -> one repeat to them (0 = never)
-- The employee can give a reason once a day, pausing escalation for
-- location_alert_pause_min. "Fixed" means the location actually comes back.
-- One open alert per person; each step is sent once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Settings and the per-person switch
-- ---------------------------------------------------------------------
alter table public.app_settings
  add column if not exists location_alerts_enabled      boolean not null default true,
  add column if not exists location_alert_employee_min  int     not null default 10 check (location_alert_employee_min between 1 and 240),
  add column if not exists location_alert_remind_min    int     not null default 10 check (location_alert_remind_min between 0 and 240),
  add column if not exists location_alert_escalate_min  int     not null default 15 check (location_alert_escalate_min between 1 and 480),
  add column if not exists location_alert_pause_min     int     not null default 30 check (location_alert_pause_min between 0 and 240),
  add column if not exists location_alert_repeat_min    int     not null default 60 check (location_alert_repeat_min between 0 and 480),
  add column if not exists location_alert_notify_manager boolean not null default true,
  add column if not exists location_alert_notify_hr      boolean not null default true,
  add column if not exists location_alert_notify_boss    boolean not null default false;

alter table public.users add column if not exists location_monitored boolean not null default false;

-- ---------------------------------------------------------------------
-- 2. Alert log
-- ---------------------------------------------------------------------
create table if not exists public.location_alerts (
  id                   uuid primary key default extensions.gen_random_uuid(),
  user_id              uuid not null references public.users(id) on update cascade on delete cascade,
  work_date            date not null,
  kind                 text not null check (kind in ('sharing_off', 'gps_off', 'no_update')),
  started_at           timestamptz not null,
  employee_notified_at timestamptz,
  employee_reminded_at timestamptz,
  reason               text check (reason is null or char_length(reason) between 2 and 200),
  reason_at            timestamptz,
  paused_until         timestamptz,
  escalated_at         timestamptz,
  repeated_at          timestamptz,
  resolved_at          timestamptz,
  created_at           timestamptz not null default now()
);
create unique index if not exists location_alerts_one_open on public.location_alerts (user_id) where resolved_at is null;
create index if not exists location_alerts_day_idx on public.location_alerts (work_date desc, user_id);
alter table public.location_alerts enable row level security;   -- no policies: functions only
revoke all on public.location_alerts from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------
create or replace function app.location_alert_text(p_kind text)
 returns text language sql immutable set search_path to '' as $function$
  select case p_kind
    when 'sharing_off' then 'location sharing is switched off'
    when 'gps_off'     then 'GPS / location permission is off on their phone'
    else 'no location update (phone off, no network or app closed)'
  end
$function$;

create or replace function app.local_time_label(p_ts timestamptz)
 returns text language sql stable set search_path to '' as $function$
  select to_char(p_ts at time zone app.attendance_tz(), 'HH12:MI AM')
$function$;

-- Who hears about an escalated alert: the person's manager, HR of their company, the Boss (per settings)
create or replace function app.location_alert_recipients(p_user uuid)
 returns setof uuid language sql stable security definer set search_path to '' as $function$
  with s as (select * from public.app_settings where id = 1),
       me as (select * from public.users where id = p_user)
  select distinct r.id from (
    select m.id from me join public.users m on m.id = me.manager_id, s
     where s.location_alert_notify_manager and m.is_active and m.account_status = 'active'
    union all
    select h.id from me, public.users h, s
     where s.location_alert_notify_hr and h.role = 'hr' and h.is_active and h.account_status = 'active'
       and (h.organization_id is null or me.organization_id is null or h.organization_id = me.organization_id)
    union all
    select b.id from public.users b, s
     where s.location_alert_notify_boss and b.role = 'boss' and b.is_active and b.account_status = 'active'
  ) r
  where r.id <> p_user
$function$;

create or replace function app.location_alert_tell_team(p_user uuid, p_title text, p_body text)
 returns void language sql security definer set search_path to '' as $function$
  -- ref_table 'location_trail' + the person's id opens their live trail in the app
  select app.notify(r, 'location_alert_team', p_title, p_body, 'location_trail', p_user)
  from app.location_alert_recipients(p_user) r
$function$;

-- ---------------------------------------------------------------------
-- 4. The job (every 2 minutes)
-- ---------------------------------------------------------------------
create or replace function app.location_alert_tick()
 returns void language plpgsql security definer set search_path to '' as $function$
declare
  s public.app_settings;
  v_today date := app.local_date();
  v_now timestamptz := now();
  p record;
  a public.location_alerts;
  v_working boolean;
  v_kind text;
  v_since timestamptz;
  v_last timestamptz;
  v_escalate_at timestamptz;
  v_name text;
begin
  select * into s from public.app_settings where id = 1;

  if not s.location_alerts_enabled then
    update public.location_alerts set resolved_at = v_now where resolved_at is null;
    return;
  end if;

  for p in
    select u.id, u.full_name, u.organization_id, u.location_monitored, u.location_sharing_enabled,
           u.location_sharing_changed_at, u.location_device_status, u.location_status_at,
           r.clock_in_at, r.clock_out_at, r.break_start_at, r.break_end_at, r.status
    from public.users u
    left join public.attendance_records r on r.user_id = u.id and r.work_date = v_today
    where u.is_active and u.account_status = 'active'
      and (u.location_monitored or exists (select 1 from public.location_alerts x where x.user_id = u.id and x.resolved_at is null))
  loop
    -- Working right now? (clocked in, not out, not on a break, not leave, not a holiday / weekly off)
    v_working := p.location_monitored
      and p.clock_in_at is not null and p.clock_out_at is null
      and coalesce(p.status::text, 'present') <> 'leave'
      and not (p.break_start_at is not null and (p.break_end_at is null or p.break_end_at < p.break_start_at))
      and extract(dow from v_today)::int <> s.attendance_weekly_off_dow
      and not exists (select 1 from public.holidays h where h.holiday_date = v_today
                        and (h.organization_id is null or h.organization_id = p.organization_id));

    v_kind := null;
    if v_working then
      select to_timestamp(0) + (ld.last_point ->> 0)::bigint * interval '1 millisecond' into v_last
        from public.location_days ld
       where ld.user_id = p.id and ld.last_point is not null
       order by ld.work_date desc limit 1;

      if not p.location_sharing_enabled then
        v_kind := 'sharing_off';
        v_since := greatest(coalesce(p.location_sharing_changed_at, p.clock_in_at), p.clock_in_at, coalesce(p.break_end_at, p.clock_in_at));
      elsif p.location_device_status in ('services_off', 'permission_denied') then
        v_kind := 'gps_off';
        v_since := greatest(coalesce(p.location_status_at, p.clock_in_at), p.clock_in_at, coalesce(p.break_end_at, p.clock_in_at));
      else
        -- the time we last knew where they were (never before clock-in or the end of the break)
        v_since := greatest(coalesce(v_last, p.clock_in_at), p.clock_in_at, coalesce(p.break_end_at, p.clock_in_at));
        if v_since < v_now - interval '5 minutes' then v_kind := 'no_update'; end if;
      end if;
    end if;

    select * into a from public.location_alerts where user_id = p.id and resolved_at is null;

    -- Fixed, clocked out, on a break, or no longer monitored: close the open alert
    if v_kind is null then
      if a.id is not null then
        update public.location_alerts set resolved_at = v_now where id = a.id;
        if a.escalated_at is not null then
          perform app.location_alert_tell_team(p.id, p.full_name || ' is back online',
            'Location problem from ' || app.local_time_label(a.started_at) || ' is fixed (' ||
            greatest(1, round(extract(epoch from v_now - a.started_at) / 60))::int || ' min).');
        end if;
      end if;
      continue;
    end if;

    -- New problem: open an alert (nothing is sent yet)
    if a.id is null then
      insert into public.location_alerts (user_id, work_date, kind, started_at)
      values (p.id, v_today, v_kind, v_since)
      returning * into a;
    elsif a.kind <> v_kind then
      update public.location_alerts set kind = v_kind where id = a.id returning * into a;
    end if;

    v_name := split_part(p.full_name, ' ', 1);

    -- Step 1: the employee
    if a.employee_notified_at is null then
      if v_now >= a.started_at + make_interval(mins => s.location_alert_employee_min) then
        perform app.notify(p.id, 'location_alert',
          case a.kind when 'sharing_off' then 'Location sharing is off'
                      when 'gps_off'     then 'Your GPS is off'
                      else 'SKFL can''t see your location' end,
          case a.kind when 'sharing_off' then 'You are clocked in. Turn it back on in SKFL: More → Location sharing.'
                      when 'gps_off'     then 'Turn on location / GPS so your location keeps updating.'
                      else 'Check GPS and internet, and open SKFL. Tap to tell your manager why.' end,
          'location_alerts', a.id);
        update public.location_alerts set employee_notified_at = v_now where id = a.id;
      end if;
      continue;
    end if;

    -- Step 2: reminder, then manager / HR (unless the employee's reason paused it)
    if a.escalated_at is null then
      v_escalate_at := greatest(a.employee_notified_at + make_interval(mins => s.location_alert_escalate_min),
                                coalesce(a.paused_until, a.employee_notified_at));
      if v_now >= v_escalate_at then
        perform app.location_alert_tell_team(p.id,
          p.full_name || ': location problem',
          initcap(left(app.location_alert_text(a.kind), 1)) || substr(app.location_alert_text(a.kind), 2) ||
          ' since ' || app.local_time_label(a.started_at) || '. ' || v_name || ' was notified at ' ||
          app.local_time_label(a.employee_notified_at) || ' and has not fixed it.' ||
          case when a.reason is not null then ' Reason given: "' || a.reason || '".' else '' end);
        update public.location_alerts set escalated_at = v_now where id = a.id;
      elsif s.location_alert_remind_min > 0 and a.employee_reminded_at is null
            and (a.paused_until is null or v_now >= a.paused_until)
            and v_now >= a.employee_notified_at + make_interval(mins => s.location_alert_remind_min) then
        perform app.notify(p.id, 'location_alert', 'Reminder: your location is still off',
          'Your manager and HR will be told in ' ||
          greatest(1, ceil(extract(epoch from v_escalate_at - v_now) / 60))::int || ' min. Tap to give a reason.',
          'location_alerts', a.id);
        update public.location_alerts set employee_reminded_at = v_now where id = a.id;
      end if;
      continue;
    end if;

    -- Step 3: one repeat to manager / HR
    if s.location_alert_repeat_min > 0 and a.repeated_at is null
       and v_now >= a.escalated_at + make_interval(mins => s.location_alert_repeat_min) then
      perform app.location_alert_tell_team(p.id, p.full_name || ': location still off',
        'Still ' || app.location_alert_text(a.kind) || ', since ' || app.local_time_label(a.started_at) || ' (' ||
        round(extract(epoch from v_now - a.started_at) / 60)::int || ' min).');
      update public.location_alerts set repeated_at = v_now where id = a.id;
    end if;
  end loop;
end $function$;
revoke execute on function app.location_alert_tick() from public, anon, authenticated;

-- The every-2-minutes job is scheduled in 20261008090100_location_alerts_schedule.sql

-- Nightly clean-up of old alerts: 20261008090200_location_alerts_purge.sql

-- ---------------------------------------------------------------------
-- 5. The employee: see the alert and give a reason
-- ---------------------------------------------------------------------
create or replace function public.my_location_alert(p_alert uuid)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare a public.location_alerts; s public.app_settings;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into a from public.location_alerts where id = p_alert and user_id = auth.uid();
  if not found then raise exception 'Alert not found'; end if;
  select * into s from public.app_settings where id = 1;
  return to_jsonb(a) || jsonb_build_object(
    'escalate_after_min', s.location_alert_escalate_min,
    'pause_min', s.location_alert_pause_min,
    'can_pause', s.location_alert_pause_min > 0 and a.resolved_at is null and a.escalated_at is null
                 and not exists (select 1 from public.location_alerts x
                                  where x.user_id = a.user_id and x.work_date = a.work_date and x.paused_until is not null));
end $function$;

create or replace function public.location_alert_reason(p_alert uuid, p_reason text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare a public.location_alerts; s public.app_settings; v_reason text := trim(coalesce(p_reason, '')); v_pause timestamptz; u public.users;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if char_length(v_reason) < 2 or char_length(v_reason) > 200 then raise exception 'Write a short reason (2-200 characters)'; end if;
  select * into a from public.location_alerts where id = p_alert and user_id = auth.uid() for update;
  if not found then raise exception 'Alert not found'; end if;
  if a.resolved_at is not null then raise exception 'This alert is already closed'; end if;
  select * into s from public.app_settings where id = 1;
  select * into u from public.users where id = auth.uid();

  -- one pause per day, only before the manager / HR were told
  if s.location_alert_pause_min > 0 and a.escalated_at is null
     and not exists (select 1 from public.location_alerts x where x.user_id = a.user_id and x.work_date = a.work_date and x.paused_until is not null) then
    v_pause := now() + make_interval(mins => s.location_alert_pause_min);
  end if;

  update public.location_alerts
     set reason = v_reason, reason_at = now(), paused_until = coalesce(v_pause, paused_until)
   where id = a.id;

  if a.escalated_at is not null then
    -- they were already told: pass the reason on
    perform app.location_alert_tell_team(a.user_id, u.full_name || ' replied', '"' || v_reason || '"');
  end if;
  perform app.audit('location.alert_reason', 'location_alerts', a.id, jsonb_build_object('reason', v_reason));
  return jsonb_build_object('paused_until', v_pause);
end $function$;

-- ---------------------------------------------------------------------
-- 6. Admin: who is monitored, and the alert list
-- ---------------------------------------------------------------------
create or replace function public.admin_set_location_monitoring(p_users uuid[], p_on boolean)
 returns integer language plpgsql security definer set search_path to '' as $function$
declare v_n int;
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only the Boss or HR can change location monitoring' using errcode = '42501'; end if;
  update public.users set location_monitored = p_on
   where id = any (p_users) and location_monitored is distinct from p_on;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform app.audit(case when p_on then 'location.monitor_on' else 'location.monitor_off' end, 'users', null,
                      jsonb_build_object('users', to_jsonb(p_users), 'changed', v_n));
  end if;
  return v_n;
end $function$;

create or replace function public.location_alerts_list(p_from date default null, p_to date default null)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare v_from date := coalesce(p_from, app.local_date() - 6); v_to date := coalesce(p_to, app.local_date());
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not (app.is_boss() or app.is_hr() or exists (select 1 from public.users r where r.manager_id = auth.uid())) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(a) || jsonb_build_object(
             'full_name', u.full_name, 'job_title', u.job_title, 'organization_id', u.organization_id,
             'department', (select d.name from public.departments d where d.id = u.department_id),
             'manager', (select m.full_name from public.users m where m.id = u.manager_id))
           order by (a.resolved_at is null) desc, a.started_at desc)
    from public.location_alerts a join public.users u on u.id = a.user_id
    where a.work_date between v_from and v_to
      and (app.is_boss() or app.is_hr() or app.leads(a.user_id))
  ), '[]'::jsonb);
end $function$;

grant execute on function public.my_location_alert(uuid) to authenticated;
grant execute on function public.location_alert_reason(uuid, text) to authenticated;
grant execute on function public.admin_set_location_monitoring(uuid[], boolean) to authenticated;
grant execute on function public.location_alerts_list(date, date) to authenticated;
revoke execute on function public.my_location_alert(uuid) from public, anon;
revoke execute on function public.location_alert_reason(uuid, text) from public, anon;
revoke execute on function public.admin_set_location_monitoring(uuid[], boolean) from public, anon;
revoke execute on function public.location_alerts_list(date, date) from public, anon;
