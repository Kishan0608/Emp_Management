-- =====================================================================
-- 045 (optional clean-up) Remove the shared location-alert rules.
-- Rules are per employee since 044 (public.location_monitoring), and the
-- reminder / repeat steps were removed, so nothing reads these columns.
-- =====================================================================
alter table public.app_settings
  drop column if exists location_alerts_enabled,
  drop column if exists location_alert_employee_min,
  drop column if exists location_alert_remind_min,
  drop column if exists location_alert_escalate_min,
  drop column if exists location_alert_pause_min,
  drop column if exists location_alert_repeat_min,
  drop column if exists location_alert_notify_manager,
  drop column if exists location_alert_notify_hr,
  drop column if exists location_alert_notify_boss;

alter table public.location_alerts
  drop column if exists employee_reminded_at,
  drop column if exists repeated_at;
