-- =====================================================================
-- 047 One reason per location alert: once the employee sends it, it cannot
-- be changed (the app then shows the sent reason instead of the menu).
-- =====================================================================
create or replace function public.location_alert_reason(p_alert uuid, p_reason text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare a public.location_alerts; v_reason text := trim(coalesce(p_reason, '')); v_pause timestamptz; u public.users;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if char_length(v_reason) < 2 or char_length(v_reason) > 200 then raise exception 'Write a short reason (2-200 characters)'; end if;
  select * into a from public.location_alerts where id = p_alert and user_id = auth.uid() for update;
  if not found then raise exception 'Alert not found'; end if;
  if a.resolved_at is not null then raise exception 'This alert is already closed'; end if;
  -- one reason per alert; it cannot be changed once sent
  if a.reason is not null then raise exception 'You have already sent a reason for this alert'; end if;
  select * into u from public.users where id = auth.uid();

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
