-- =====================================================================
-- 025 LOCATION TRACKING
-- Opt-in: each employee switches sharing on in their own settings.
-- While on, the phone sends GPS fixes in batches. Fixes are kept per local
-- work day and purged after location_retention_days.
-- Who can see it: Boss and HR see everyone who is sharing; a manager sees
-- their direct reports. Every trail view is written to the audit log.
-- Reads and writes go only through RPCs; clients never touch the table.
-- =====================================================================

-- ---------- opt-in flag, set only through set_my_location_sharing() ----------
alter table public.users
  add column location_sharing_enabled    boolean not null default false,
  add column location_sharing_changed_at timestamptz;

-- ---------- retention setting, same pattern as the attendance thresholds ----------
alter table public.app_settings
  add column location_retention_days int not null default 30 check (location_retention_days between 1 and 365);

grant update (location_retention_days) on public.app_settings to authenticated;
-- covered by the existing settings_boss_update policy.

-- ---------- points ----------
create table public.location_points (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.users(id) on delete cascade,
  work_date    date not null,                       -- local (attendance timezone) day the fix belongs to
  recorded_at  timestamptz not null,                -- when the phone got the fix
  latitude     double precision not null check (latitude between -90 and 90),
  longitude    double precision not null check (longitude between -180 and 180),
  accuracy_m   real check (accuracy_m is null or accuracy_m >= 0),
  speed_mps    real check (speed_mps is null or speed_mps >= 0),
  created_at   timestamptz not null default now(),
  unique (user_id, recorded_at)                     -- retries from a bad connection never double-count
);
create index location_points_day_idx on public.location_points (user_id, work_date, recorded_at);

-- RLS on with no policies: nobody reads or writes the table directly.
alter table public.location_points enable row level security;
revoke all on public.location_points from anon, authenticated;

-- ---------- helpers ----------
create or replace function app.can_track_location(p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_boss() or app.is_hr() or app.manages(p_target)
$$;

-- ---------- opt-in / opt-out (self-service) ----------
create or replace function public.set_my_location_sharing(p_enabled boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;

  update public.users
     set location_sharing_enabled = p_enabled, location_sharing_changed_at = now()
   where id = auth.uid() and location_sharing_enabled is distinct from p_enabled;
  if found then
    perform app.audit('location.sharing_' || case when p_enabled then 'on' else 'off' end, 'users', auth.uid());
  end if;
  return p_enabled;
end $$;

-- ---------- phone uploads a batch of fixes ----------
create or replace function public.record_location_points(p_points jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare v_inserted int;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.users u where u.id = auth.uid() and u.location_sharing_enabled) then
    raise exception 'Location sharing is off' using errcode = '42501';
  end if;
  if jsonb_typeof(p_points) <> 'array' then raise exception 'Expected a list of location points'; end if;
  if jsonb_array_length(p_points) > 500 then raise exception 'Too many points in one batch (max 500)'; end if;

  with incoming as (
    select (p ->> 'recorded_at')::timestamptz      as recorded_at,
           (p ->> 'latitude')::double precision    as latitude,
           (p ->> 'longitude')::double precision   as longitude,
           nullif(p ->> 'accuracy_m', '')::real    as accuracy_m,
           nullif(p ->> 'speed_mps', '')::real     as speed_mps
    from jsonb_array_elements(p_points) p
  ),
  valid as (
    -- drop fixes that are far off in time or out of range instead of failing the whole batch
    select * from incoming
    where recorded_at between now() - interval '2 days' and now() + interval '5 minutes'
      and latitude between -90 and 90
      and longitude between -180 and 180
  ),
  ins as (
    insert into public.location_points (user_id, work_date, recorded_at, latitude, longitude, accuracy_m, speed_mps)
    select auth.uid(), app.local_date(recorded_at), recorded_at, latitude, longitude, accuracy_m, speed_mps from valid
    on conflict (user_id, recorded_at) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;
  return v_inserted;
end $$;

-- ---------- live list: latest fix per person Boss/HR/manager can track ----------
-- p_log = true only for a deliberate screen open; background refreshes pass false so the audit log is not flooded.
create or replace function public.location_live(p_log boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_log then
    perform app.audit('location.view_live', 'users', null, jsonb_build_object('viewer_role', app.uid_role()));
  end if;

  return coalesce((
    select jsonb_agg(x order by x.full_name) from (
      select u.id as user_id, u.full_name, u.role, u.job_title, u.organization_id,
        (select d.name from public.departments d where d.id = u.department_id) as department,
        (select o.name from public.organizations o where o.id = u.organization_id) as organization,
        (select jsonb_build_object('recorded_at', p.recorded_at, 'latitude', p.latitude, 'longitude', p.longitude,
                                   'accuracy_m', p.accuracy_m, 'speed_mps', p.speed_mps)
           from public.location_points p where p.user_id = u.id
          order by p.recorded_at desc limit 1) as last_point,
        (select count(*) from public.location_points p where p.user_id = u.id and p.work_date = app.local_date())::int as points_today
      from public.users u
      where u.is_active and u.account_status = 'active' and u.location_sharing_enabled
        and app.can_track_location(u.id)
    ) x), '[]'::jsonb);
end $$;

-- ---------- one person's trail for one local day ----------
create or replace function public.location_day(p_target uuid, p_date date, p_log boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.users;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not app.can_track_location(p_target) then
    raise exception 'You can only view location for people in your team' using errcode = '42501';
  end if;
  select * into u from public.users where id = p_target;
  if not found then raise exception 'Person not found'; end if;

  if p_log then
    perform app.audit('location.view_day', 'users', p_target, jsonb_build_object('work_date', p_date));
  end if;

  return jsonb_build_object(
    'person', jsonb_build_object('id', u.id, 'full_name', u.full_name, 'role', u.role,
                                 'sharing_enabled', u.location_sharing_enabled),
    'work_date', p_date,
    'points', coalesce((
      select jsonb_agg(jsonb_build_object('recorded_at', p.recorded_at, 'latitude', p.latitude, 'longitude', p.longitude,
                                          'accuracy_m', p.accuracy_m, 'speed_mps', p.speed_mps) order by p.recorded_at)
      from public.location_points p where p.user_id = p_target and p.work_date = p_date), '[]'::jsonb));
end $$;

-- ---------- retention: runs nightly, after the attendance close-out ----------
create or replace function app.purge_location_points() returns void
language sql security definer set search_path = '' as $$
  delete from public.location_points p
  where p.work_date < app.local_date() - (select s.location_retention_days from public.app_settings s where s.id = 1)
$$;

select cron.schedule('purge-location-points', '45 21 * * *', $$select app.purge_location_points()$$);  -- 03:15 IST

-- ---------- my_context: expose the retention setting to the app ----------
create or replace function public.my_context()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  u public.users;
  s public.app_settings;
begin
  select * into u from public.users where id = auth.uid();
  if not found then raise exception 'Account not found' using errcode = '42501'; end if;
  select * into s from public.app_settings where id = 1;
  return jsonb_build_object(
    'user', to_jsonb(u) - 'push_token',
    'department', (select d.name from public.departments d where d.id = u.department_id),
    'manager', (select m.full_name from public.users m where m.id = u.manager_id),
    'organization', (select jsonb_build_object('id', o.id, 'name', o.name) from public.organizations o where o.id = u.organization_id),
    'is_committee', exists (select 1 from public.committee_members c where c.user_id = u.id),
    'mfa_required', u.role in ('boss','hr') and s.require_mfa_admins,
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'settings', jsonb_build_object(
      'company_name', s.company_name,
      'session_timeout_minutes', s.session_timeout_minutes,
      'privacy_notice_version', s.privacy_notice_version,
      'monthly_complaint_quota', s.monthly_complaint_quota,
      'min_group_size', s.min_group_size,
      'yellow_threshold', s.yellow_threshold,
      'red_threshold', s.red_threshold,
      'window_days', s.window_days,
      'blocker_hr_hours', s.blocker_hr_hours,
      'blocker_boss_hours', s.blocker_boss_hours,
      'require_mfa_admins', s.require_mfa_admins,
      'retention_complaint_days', s.retention_complaint_days,
      'retention_audit_days', s.retention_audit_days,
      'location_retention_days', s.location_retention_days)
  );
end $function$;

-- ---------- grants: explicit, as in the attendance migration ----------
grant execute on function
  public.set_my_location_sharing(boolean), public.record_location_points(jsonb),
  public.location_live(boolean), public.location_day(uuid, date, boolean)
  to authenticated;
revoke execute on function
  public.set_my_location_sharing(boolean), public.record_location_points(jsonb),
  public.location_live(boolean), public.location_day(uuid, date, boolean)
  from public, anon;

revoke execute on function app.can_track_location(uuid), app.purge_location_points()
  from public, anon, authenticated;
