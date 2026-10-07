-- =====================================================================
-- 043 Nightly clean-up also removes closed location alerts older than
-- 90 days (or the location retention, if longer). Runs in the existing
-- purge-location-points job (03:15 India time).
-- =====================================================================
create or replace function app.purge_location_points()
 returns void language sql security definer set search_path to '' as $function$
  delete from public.location_days d
  where d.work_date < app.local_date() - (select s.location_retention_days from public.app_settings s where s.id = 1);
  delete from public.location_alerts a
  where a.resolved_at is not null
    and a.work_date < app.local_date() - greatest(90, (select s.location_retention_days from public.app_settings s where s.id = 1));
$function$;

