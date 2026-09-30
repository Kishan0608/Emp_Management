-- =====================================================================
-- 018 PHONE PUSH PAYLOAD
-- Adds the notification kind (so tapping a push opens the right screen),
-- high priority (delivered immediately on Android, even in Doze) and the
-- app's Android channel.
-- =====================================================================
create or replace function app.push_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  select u.push_token into v_token from public.users u where u.id = new.user_id and u.is_active;
  if v_token like 'ExponentPushToken%' then
    perform net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      body    := jsonb_build_object('to', v_token, 'title', new.title, 'body', coalesce(new.body, ''),
                                    'sound', 'default', 'priority', 'high', 'channelId', 'default',
                                    'data', jsonb_build_object('id', new.id, 'kind', new.kind,
                                                               'ref_table', new.ref_table, 'ref_id', new.ref_id)),
      headers := '{"Content-Type":"application/json"}'::jsonb);
  end if;
  return new;
exception when others then
  return new;  -- a failed push must never block the business action
end $$;
