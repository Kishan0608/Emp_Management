-- =====================================================================
-- 042 Run the location-alert check every 2 minutes (see 041).
-- =====================================================================
do $$
begin
  if exists (select 1 from cron.job where jobname = 'location-alerts') then perform cron.unschedule('location-alerts'); end if;
  perform cron.schedule('location-alerts', '*/2 * * * *', 'select app.location_alert_tick()');
end $$;
