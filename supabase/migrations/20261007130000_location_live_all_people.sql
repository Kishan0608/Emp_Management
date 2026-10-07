-- =====================================================================
-- 036 LIVE LOCATIONS: list everyone who has location data
--
-- location_live() listed only people whose sharing is on right now, so
-- someone who switched it off (e.g. the Boss this morning) vanished from the
-- board even though their points from today are stored and viewable in the
-- trail. Now the board lists everyone with sharing on OR any stored point
-- (points are kept for app_settings.location_retention_days), and says which
-- is which with sharing_enabled. Who may see whom (app.can_track_location)
-- is unchanged. No new points are recorded while sharing is off.
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
        u.location_device_status as device_status,
        u.location_status_at as status_at
      from public.users u
      where u.is_active and u.account_status = 'active'
        and (u.location_sharing_enabled or exists (select 1 from public.location_points p where p.user_id = u.id))
        and app.can_track_location(u.id)
    ) x), '[]'::jsonb);
end $function$;
