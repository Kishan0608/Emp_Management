-- =====================================================================
-- 017 NOTIFICATIONS: real-time + who gets notified
--
--  * Task assigned      -> the assignee            (already in create_task)
--  * Feedback / question / blocker
--                       -> every Boss (always)
--                       -> the author's own manager (team member only), when
--                          the feedback is addressed to the manager or to all
--                          (HR-only feedback stays private from the manager)
--                       -> HR when addressed to HR / all (unchanged)
--  * Complaint          -> every Boss + the HR case handlers, in 15-minute
--                          batches. Never instantly: an instant alert would let
--                          someone guess the author from the moment it arrived.
--
-- Every row in public.notifications is pushed to the person's phone by the
-- existing notifications_push trigger (Expo push service -> FCM / APNs), and is
-- now also streamed live to the open app through Supabase Realtime.
-- =====================================================================

-- Live stream of the notifications table (RLS still applies: people only receive their own rows).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------- feedback: Boss always, manager for own team ----------
create or replace function app.create_feedback(
  p_author uuid, p_type public.feedback_type, p_audience public.feedback_audience, p_title text, p_body text,
  p_anonymous boolean, p_task uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  a public.users;
  v_id uuid;
  v_label text;
  v_title text;
begin
  select * into a from public.users where id = p_author;
  insert into public.feedback_items (type, audience, title, body, is_anonymous, author_id, recipient_manager_id, department_id, task_id,
                                     escalation_level)
  values (p_type, p_audience, trim(p_title), trim(p_body), p_anonymous,
          case when p_anonymous then null else p_author end,
          a.manager_id, a.department_id, p_task,
          case when p_type = 'blocker' and a.manager_id is null then 1 else 0 end)
  returning id into v_id;

  v_label := case when p_anonymous then 'Anonymous' else a.full_name end;
  v_title := case p_type when 'blocker' then 'Blocker' when 'question' then 'Question' else 'Feedback' end || ' from ' || v_label;

  -- Manager: only their own team member, and only when it is addressed to them (or all), or work is blocked.
  if (p_audience in ('manager', 'all') or p_type = 'blocker') and a.manager_id is distinct from p_author then
    perform app.notify(a.manager_id, 'feedback_' || p_type::text, v_title, trim(p_title), 'feedback_items', v_id);
  end if;

  -- HR: when addressed to HR / all, or a blocker with nobody above.
  if p_audience in ('hr', 'all') or (p_type = 'blocker' and a.manager_id is null) then
    perform app.notify_role('hr', 'feedback_' || p_type::text, v_title, trim(p_title), 'feedback_items', v_id, p_author);
  end if;

  -- Boss: every piece of feedback (they can read all of it).
  insert into public.notifications (user_id, kind, title, body, ref_table, ref_id)
  select u.id, 'feedback_' || p_type::text, v_title, trim(p_title), 'feedback_items', v_id
  from public.users u
  where u.role = 'boss' and u.is_active and u.account_status = 'active'
    and u.id is distinct from p_author
    and u.id is distinct from a.manager_id; -- already notified above as their manager
  return v_id;
end $$;
revoke all on function app.create_feedback(uuid, public.feedback_type, public.feedback_audience, text, text, boolean, uuid) from public, anon, authenticated;

-- ---------- complaints: batched alert to Boss + case handlers ----------
alter table public.complaints add column if not exists boss_notified boolean not null default false;
update public.complaints set boss_notified = true where boss_notified = false;

create or replace function app.complaint_alerts() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    with fresh as (
      update public.complaints c set boss_notified = true
       where c.boss_notified = false
      returning c.target_id
    )
    select f.target_id, count(*) as n, (select u.full_name from public.users u where u.id = f.target_id) as name
    from fresh f group by f.target_id
  loop
    -- Boss: numbers and the person concerned only (never the text, never the author).
    insert into public.notifications (user_id, kind, title, body, ref_table, ref_id)
    select u.id, 'complaint_new',
           case when r.n = 1 then 'New complaint received' else r.n || ' new complaints received' end,
           'About ' || r.name || '. Open Integrity to see the counts.', 'users', r.target_id
    from public.users u
    where u.role = 'boss' and u.is_active and u.account_status = 'active' and u.id <> r.target_id;

    -- HR case handlers: something to triage (never about themselves).
    insert into public.notifications (user_id, kind, title, body, ref_table, ref_id)
    select u.id, 'complaint_new', 'Complaint waiting for triage', 'Open the triage inbox.', 'users', r.target_id
    from public.users u
    where u.role = 'hr' and u.is_case_handler and u.is_active and u.id <> r.target_id;
  end loop;
end $$;
revoke all on function app.complaint_alerts() from public, anon, authenticated;

select cron.schedule('complaint-alerts', '*/15 * * * *', $$select app.complaint_alerts()$$);
