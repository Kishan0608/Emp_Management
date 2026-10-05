-- =====================================================================
-- 026 LOCATION TRACKING: fixes after end-to-end testing
-- * Managers see their whole team two levels down (app.leads), the same
--   rule the task screens use. Before, a manager whose salespeople report to
--   a team lead could not see them.
-- * The phone reports its own state (GPS off, permission removed, only
--   "while using"), so the live board can say WHY someone is not updating.
-- * my_context tells the app whether the user leads anyone, so team leads
--   who are not in the Manager role still get the Live locations screen.
-- =====================================================================

create or replace function app.can_track_location(p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_boss() or app.is_hr() or app.leads(p_target)
$$;
revoke execute on function app.can_track_location(uuid) from public, anon, authenticated;

-- ---------- phone state ----------
alter table public.users
  add column location_device_status text
    check (location_device_status in ('ok', 'foreground_only', 'permission_denied', 'services_off')),
  add column location_status_at timestamptz;

create or replace function public.report_location_status(p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_status not in ('ok', 'foreground_only', 'permission_denied', 'services_off') then
    raise exception 'Unknown location status';
  end if;
  update public.users set location_device_status = p_status, location_status_at = now() where id = auth.uid();
end $$;

-- Turning sharing off clears the phone state, so an old "GPS off" never shows later.
create or replace function public.set_my_location_sharing(p_enabled boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;

  update public.users
     set location_sharing_enabled = p_enabled, location_sharing_changed_at = now(),
         location_device_status = case when p_enabled then location_device_status end,
         location_status_at     = case when p_enabled then location_status_at end
   where id = auth.uid() and location_sharing_enabled is distinct from p_enabled;
  if found then
    perform app.audit('location.sharing_' || case when p_enabled then 'on' else 'off' end, 'users', auth.uid());
  end if;
  return p_enabled;
end $$;

-- ---------- live board: now carries the phone state ----------
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
        (select count(*) from public.location_points p where p.user_id = u.id and p.work_date = app.local_date())::int as points_today,
        u.location_device_status as device_status,
        u.location_status_at as status_at
      from public.users u
      where u.is_active and u.account_status = 'active' and u.location_sharing_enabled
        and app.can_track_location(u.id)
    ) x), '[]'::jsonb);
end $$;

-- ---------- my_context: adds leads_team ----------
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
    'leads_team', exists (select 1 from public.users r where r.manager_id = u.id and r.is_active),
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

grant execute on function public.report_location_status(text) to authenticated;
revoke execute on function public.report_location_status(text) from public, anon;
