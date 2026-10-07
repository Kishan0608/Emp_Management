-- =====================================================================
-- 038 LIVE LOCATIONS: sharing off = Offline, but history stays visible
--
-- Replaces 037. A person who switches sharing off shows as Offline, and the
-- Boss / HR / their manager can still see their last position and their
-- route (trail) from before. Nothing new is recorded while sharing is off
-- (record_location_points refuses it). Phone status (GPS off etc.) is only
-- reported while sharing is on, because it no longer matters after that.
-- =====================================================================

create or replace function public.location_live(p_log boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_log then
    begin
      perform app.audit('location.view_live', 'users', null, jsonb_build_object('viewer_role', app.uid_role()));
    exception when others then
      null;
    end;
  end if;

  return coalesce((
    select jsonb_agg(x order by x.sharing_enabled desc, x.full_name) from (
      select u.id as user_id, u.full_name, u.role, u.job_title, u.organization_id,
        (select d.name from public.departments d where d.id = u.department_id) as department,
        (select o.name from public.organizations o where o.id = u.organization_id) as organization,
        (select jsonb_build_object('recorded_at', p.recorded_at, 'latitude', p.latitude, 'longitude', p.longitude,
                                   'accuracy_m', p.accuracy_m, 'speed_mps', p.speed_mps)
           from public.location_points p where p.user_id = u.id
          order by p.recorded_at desc limit 1) as last_point,
        (select count(*) from public.location_points p where p.user_id = u.id and p.work_date = app.local_date())::int as points_today,
        u.location_sharing_enabled as sharing_enabled,
        case when u.location_sharing_enabled then u.location_device_status end as device_status,
        case when u.location_sharing_enabled then u.location_status_at end as status_at
      from public.users u
      where u.is_active and u.account_status = 'active'
        and (u.location_sharing_enabled or exists (select 1 from public.location_points p where p.user_id = u.id))
        and app.can_track_location(u.id)
    ) x), '[]'::jsonb);
end $function$;

create or replace function public.location_day(p_target uuid, p_date date default null, p_log boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_date date := coalesce(p_date, app.local_date());
  v_person record;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not app.can_track_location(p_target) then
    raise exception 'Not permitted to view location' using errcode = '42501';
  end if;

  select id, full_name, role, location_sharing_enabled as sharing_enabled
  into v_person from public.users where id = p_target;
  if not found then raise exception 'Person not found' using errcode = 'P0002'; end if;

  if p_log then
    begin
      perform app.audit('location.view_history', 'users', p_target,
        jsonb_build_object('date', v_date, 'viewer_role', app.uid_role()));
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'person', to_jsonb(v_person),
    'work_date', v_date,
    'points', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'recorded_at', p.recorded_at,
          'latitude', p.latitude,
          'longitude', p.longitude,
          'accuracy_m', p.accuracy_m,
          'speed_mps', p.speed_mps)
        order by p.recorded_at asc)
      from public.location_points p
      where p.user_id = p_target and p.work_date = v_date
    ), '[]'::jsonb)
  );
end $function$;
