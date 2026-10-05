-- =====================================================================
-- 028 TASK PUSH NOTIFICATIONS
-- Every row in public.notifications is pushed to the person's phone by the
-- notifications_push trigger. The task flow notifies:
--   * task assigned          -> the assigned person         (create_task)
--   * task accepted / done   -> the sender (and reviewer)   (change_task_status)
--   * question asked         -> the other side of the task  (ask_task_question, unchanged)
--   * question answered      -> the person who asked        (reply_task_question, unchanged)
-- This migration:
--   * names the person and the task in each message ("Rahul accepted your task")
--   * set_my_push_token: one phone belongs to one account at a time. Saving a
--     token removes it from any other account, so after someone signs out and a
--     colleague signs in on the same phone, the first person's task
--     notifications stop going to that phone.
--   * send_task_notification could send any text to anyone; it is now limited
--     to people on the task, sending to someone else on the same task.
-- =====================================================================

-- ---------- push token ownership ----------
create or replace function public.set_my_push_token(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_token text := nullif(trim(p_token), '');
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if v_token is not null then
    update public.users set push_token = null where push_token = v_token and id <> auth.uid();
  end if;
  update public.users set push_token = v_token where id = auth.uid();
end $$;

grant execute on function public.set_my_push_token(text) to authenticated;
revoke execute on function public.set_my_push_token(text) from public, anon;

-- ---------- task assigned: say who sent it and when it is due ----------
create or replace function public.create_task(p_title text, p_description text, p_assignee uuid, p_reviewer uuid, p_priority public.task_priority, p_due date, p_visibility public.task_visibility, p_checklist jsonb DEFAULT '[]'::jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_role public.app_role := app.uid_role();
  a public.users;
  v_reviewer uuid := coalesce(p_reviewer, auth.uid());
  v_personal boolean;
  v_allowed boolean;
  v_id uuid;
  v_sender text;
begin
  if v_role is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not app.mfa_ok() then raise exception 'Two-factor verification required' using errcode = '42501'; end if;
  select * into a from public.users where id = p_assignee and is_active;
  if not found then raise exception 'Assignee not found or inactive'; end if;

  v_allowed := coalesce(
       p_assignee = auth.uid()
    or v_role = 'boss'
    or (v_role = 'hr' and a.role in ('employee','hr'))
    or (v_role = 'manager' and a.manager_id is not distinct from auth.uid() and a.manager_id is not null),
    false);
  if not v_allowed then
    raise exception 'You are not allowed to assign tasks to this person' using errcode = '42501';
  end if;

  if not exists (select 1 from public.users r where r.id = v_reviewer and r.is_active) then
    raise exception 'Reviewer not found or inactive';
  end if;

  v_personal := (p_assignee = auth.uid() and v_reviewer = auth.uid());

  insert into public.tasks (title, description, priority, due_date, visibility, checklist, created_by, assignee_id, reviewer_id, is_personal)
  values (trim(p_title), nullif(trim(p_description), ''), p_priority, p_due,
          case when v_personal then 'private' else p_visibility end,
          coalesce(p_checklist, '[]'::jsonb), auth.uid(), p_assignee, v_reviewer, v_personal)
  returning id into v_id;

  insert into public.task_events (task_id, actor_id, from_status, to_status, note)
  values (v_id, auth.uid(), null, 'assigned', 'Task created');

  if p_assignee <> auth.uid() then
    select full_name into v_sender from public.users where id = auth.uid();
    perform app.notify(p_assignee, 'task_assigned',
      'New task from ' || coalesce(v_sender, 'your manager'),
      trim(p_title)
        || case when p_due is not null then ' · due ' || to_char(p_due, 'DD Mon') else '' end
        || case when p_priority in ('high', 'urgent') then ' · ' || initcap(p_priority::text) || ' priority' else '' end,
      'tasks', v_id);
  end if;
  return v_id;
end $function$;

-- ---------- task accepted / completed: tell the sender (and reviewer) who did it ----------
create or replace function public.change_task_status(p_task uuid, p_to public.task_status, p_note text DEFAULT NULL::text, p_proof_url text DEFAULT NULL::text)
 returns public.task_status
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  t public.tasks;
  me uuid := auth.uid();
  v_note text := nullif(trim(p_note), '');
  v_proof text := nullif(trim(p_proof_url), '');
  v_name text;
  v_kind text;
  v_title text;
  v_body text;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not app.mfa_ok() then raise exception 'Two-factor verification required' using errcode = '42501'; end if;
  select * into t from public.tasks where id = p_task for update;
  if not found then raise exception 'Task not found'; end if;

  if t.assignee_id is distinct from me then
    raise exception 'Only the person the task is assigned to can update it' using errcode = '42501';
  end if;

  if p_to = 'accepted' then
    if t.status <> 'assigned' then raise exception 'This task is already accepted'; end if;
  elsif p_to = 'closed' then
    if t.status = 'closed' then raise exception 'This task is already done'; end if;
    if t.status = 'assigned' and not t.is_personal then raise exception 'Accept the task first'; end if;
  else
    raise exception 'Tasks go Assigned, then Accepted, then Done' using errcode = '42501';
  end if;

  update public.tasks set
    status = p_to,
    submitted_at = case when p_to = 'closed' then coalesce(submitted_at, now()) else submitted_at end,
    approved_at  = case when p_to = 'closed' then now() else approved_at end
  where id = p_task;

  insert into public.task_events (task_id, actor_id, from_status, to_status, note, proof_url)
  values (p_task, me, t.status, p_to, v_note, v_proof);

  if not t.is_personal then
    select full_name into v_name from public.users where id = me;
    v_name := coalesce(v_name, 'Someone');
    v_kind  := case when p_to = 'accepted' then 'task_accepted' else 'task_done' end;
    v_title := v_name || case when p_to = 'accepted' then ' accepted your task' else ' completed your task' end;
    v_body  := t.title || case when p_to = 'closed' and v_note is not null then ' · "' || left(v_note, 80) || '"' else '' end;

    if t.created_by is distinct from me then
      perform app.notify(t.created_by, v_kind, v_title, v_body, 'tasks', p_task);
    end if;
    if t.reviewer_id is not null and t.reviewer_id is distinct from me and t.reviewer_id is distinct from t.created_by then
      perform app.notify(t.reviewer_id, v_kind, v_title, v_body, 'tasks', p_task);
    end if;
  end if;
  return p_to;
end $function$;

-- ---------- send_task_notification: only between people on the same task ----------
create or replace function public.send_task_notification(p_recipient uuid, p_title text, p_body text, p_task uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare t public.tasks;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_recipient is null or p_recipient = auth.uid() then return; end if;

  select * into t from public.tasks where id = p_task;
  if not found then raise exception 'Task not found'; end if;
  if not (auth.uid() in (t.created_by, t.assignee_id, t.reviewer_id)
          and p_recipient in (t.created_by, t.assignee_id, t.reviewer_id)) then
    raise exception 'You can only notify people on this task' using errcode = '42501';
  end if;

  insert into public.notifications (user_id, kind, title, body, ref_table, ref_id)
  values (p_recipient, 'task_question', left(trim(p_title), 120), left(trim(p_body), 300), 'tasks', p_task);
end $function$;
