-- =====================================================================
-- Tasks go back to four steps: Assigned -> Accepted -> Submitted -> Done.
--   * The assignee accepts OR rejects the task (assigned -> accepted / returned).
--     Rejecting requires a reason. 'returned' is reused as "Rejected" rather
--     than adding a new enum value.
--   * The assignee submits their work        (accepted -> submitted), with an
--     optional note / link; files can be attached on the task. From here the
--     assignee can no longer change the task.
--   * Whoever assigned the task reviews the submission and marks it done,
--     giving a 1-5 star rating               (submitted -> approved). Only
--     the person who assigned the task (created_by) can do this.
--   * A rejected task (returned) can only be reassigned, by the person who
--     assigned it, to someone other than whoever just rejected it. The task
--     keeps its id and history (task_events); assignee/title/description/
--     priority/due/checklist can all be changed. It goes back to 'assigned'
--     and the same accept/reject/submit/approve cycle runs again.
-- The rating is kept on the task (history) and written onto the assignee's
-- public.users.performance_rating (the field the People/Team pages read).
-- Personal to-dos are unaffected: assigned -> closed, no review, no rating.
-- =====================================================================

alter table public.tasks
  add column if not exists rating smallint check (rating between 1 and 5);

create or replace function public.change_task_status(
  p_task uuid, p_to public.task_status, p_note text default null, p_proof_url text default null, p_rating numeric default null
) returns public.task_status
language plpgsql security definer set search_path = '' as $$
declare
  t public.tasks;
  me uuid := auth.uid();
  v_note text := nullif(trim(p_note), '');
  v_proof text := nullif(trim(p_proof_url), '');
  v_name text;
  v_rating smallint;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not app.mfa_ok() then raise exception 'Two-factor verification required' using errcode = '42501'; end if;
  select * into t from public.tasks where id = p_task for update;
  if not found then raise exception 'Task not found'; end if;
  select full_name into v_name from public.users where id = me;
  v_name := coalesce(v_name, 'Someone');

  if t.is_personal then
    if t.assignee_id is distinct from me then raise exception 'Only you can update your own to-do' using errcode = '42501'; end if;
    if p_to <> 'closed' or t.status = 'closed' then raise exception 'This to-do is already done'; end if;

    update public.tasks set status = 'closed', approved_at = now() where id = p_task;
    insert into public.task_events (task_id, actor_id, from_status, to_status, note, proof_url)
    values (p_task, me, t.status, 'closed', v_note, v_proof);
    return 'closed';
  end if;

  if p_to = 'accepted' then
    if t.assignee_id is distinct from me then raise exception 'Only the assigned person can accept this task' using errcode = '42501'; end if;
    if t.status <> 'assigned' then raise exception 'This task is already accepted'; end if;

    update public.tasks set status = 'accepted' where id = p_task;
    insert into public.task_events (task_id, actor_id, from_status, to_status, note, proof_url)
    values (p_task, me, t.status, 'accepted', v_note, v_proof);

    if t.created_by is distinct from me then
      perform app.notify(t.created_by, 'task_accepted', v_name || ' accepted your task', t.title, 'tasks', p_task);
    end if;
    if t.reviewer_id is not null and t.reviewer_id is distinct from me and t.reviewer_id is distinct from t.created_by then
      perform app.notify(t.reviewer_id, 'task_accepted', v_name || ' accepted a task', t.title, 'tasks', p_task);
    end if;
    return 'accepted';

  elsif p_to = 'returned' then
    if t.assignee_id is distinct from me then raise exception 'Only the assigned person can reject this task' using errcode = '42501'; end if;
    if t.status <> 'assigned' then raise exception 'This task cannot be rejected now'; end if;
    if v_note is null then raise exception 'Give a reason for rejecting this task'; end if;

    update public.tasks set status = 'returned' where id = p_task;
    insert into public.task_events (task_id, actor_id, from_status, to_status, note, proof_url)
    values (p_task, me, t.status, 'returned', v_note, v_proof);

    if t.created_by is distinct from me then
      perform app.notify(t.created_by, 'task_rejected', v_name || ' rejected a task',
        t.title || ' · "' || left(v_note, 80) || '"', 'tasks', p_task);
    end if;
    if t.reviewer_id is not null and t.reviewer_id is distinct from me and t.reviewer_id is distinct from t.created_by then
      perform app.notify(t.reviewer_id, 'task_rejected', v_name || ' rejected a task',
        t.title || ' · "' || left(v_note, 80) || '"', 'tasks', p_task);
    end if;
    return 'returned';

  elsif p_to = 'submitted' then
    if t.assignee_id is distinct from me then raise exception 'Only the assigned person can submit this task' using errcode = '42501'; end if;
    if t.status <> 'accepted' then raise exception 'Accept the task before submitting it'; end if;

    update public.tasks set status = 'submitted', submitted_at = coalesce(submitted_at, now()) where id = p_task;
    insert into public.task_events (task_id, actor_id, from_status, to_status, note, proof_url)
    values (p_task, me, t.status, 'submitted', v_note, v_proof);

    if t.created_by is distinct from me then
      perform app.notify(t.created_by, 'task_submitted', v_name || ' submitted a task for review',
        t.title || case when v_note is not null then ' · "' || left(v_note, 80) || '"' else '' end, 'tasks', p_task);
    end if;
    if t.reviewer_id is not null and t.reviewer_id is distinct from me and t.reviewer_id is distinct from t.created_by then
      perform app.notify(t.reviewer_id, 'task_submitted', v_name || ' submitted a task for review',
        t.title || case when v_note is not null then ' · "' || left(v_note, 80) || '"' else '' end, 'tasks', p_task);
    end if;
    return 'submitted';

  elsif p_to = 'approved' then
    if t.created_by is distinct from me then raise exception 'Only the person who assigned this task can mark it done' using errcode = '42501'; end if;
    if t.status <> 'submitted' then raise exception 'The task must be submitted before it can be marked done'; end if;
    if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Give a rating from 1 to 5 stars'; end if;
    v_rating := round(p_rating)::smallint;

    update public.tasks set status = 'approved', approved_at = now(), rating = v_rating where id = p_task;
    insert into public.task_events (task_id, actor_id, from_status, to_status, note, proof_url)
    values (p_task, me, t.status, 'approved', v_note, v_proof);

    update public.users set performance_rating = v_rating, updated_at = now() where id = t.assignee_id;

    if t.assignee_id is distinct from me then
      perform app.notify(t.assignee_id, 'task_done', v_name || ' marked your task as done',
        t.title || ' · rated ' || v_rating || '/5', 'tasks', p_task);
    end if;
    if t.reviewer_id is not null and t.reviewer_id is distinct from me and t.reviewer_id is distinct from t.assignee_id then
      perform app.notify(t.reviewer_id, 'task_done', t.title || ' marked done', v_name || ' rated it ' || v_rating || '/5', 'tasks', p_task);
    end if;
    return 'approved';

  else
    raise exception 'Tasks go Assigned, Accepted (or Rejected), Submitted, then Done' using errcode = '42501';
  end if;
end $$;

revoke all on function public.change_task_status(uuid, public.task_status, text, text, numeric) from public, anon;
grant execute on function public.change_task_status(uuid, public.task_status, text, text, numeric) to authenticated;

-- The old 4-arg signature no longer exists once this replaces it; drop it so
-- stale PostgREST schema cache entries do not route to a function that is gone.
drop function if exists public.change_task_status(uuid, public.task_status, text, text);

-- ---------- reassign a rejected task ----------
-- Only the person who assigned the task can call this, only while it is
-- 'returned' (rejected), and only to someone other than whoever just
-- rejected it. Title/description/priority/due/checklist may all be changed;
-- anything left null/omitted keeps its current value. The task keeps its id
-- and its full task_events history; it goes back to 'assigned' and the same
-- accept/reject/submit/approve cycle runs again for the new person.
create or replace function public.reassign_task(
  p_task uuid,
  p_new_assignee uuid,
  p_title text default null,
  p_description text default null,
  p_priority public.task_priority default null,
  p_due date default null,
  p_checklist jsonb default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t public.tasks;
  me uuid := auth.uid();
  v_role public.app_role := app.uid_role();
  v_new public.users;
  v_me_name text;
  v_note text := nullif(trim(p_note), '');
  v_allowed boolean;
begin
  if v_role is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not app.mfa_ok() then raise exception 'Two-factor verification required' using errcode = '42501'; end if;

  select * into t from public.tasks where id = p_task for update;
  if not found then raise exception 'Task not found'; end if;
  if t.created_by is distinct from me then raise exception 'Only the person who assigned this task can reassign it' using errcode = '42501'; end if;
  if t.status <> 'returned' then raise exception 'Only a rejected task can be reassigned'; end if;
  if p_new_assignee = t.assignee_id then raise exception 'Choose someone other than the person who rejected it'; end if;

  select * into v_new from public.users where id = p_new_assignee and is_active;
  if not found then raise exception 'New assignee not found or inactive'; end if;

  v_allowed := coalesce(
       p_new_assignee = me
    or v_role = 'boss'
    or (v_role = 'hr' and v_new.role in ('employee','hr'))
    or (v_role = 'manager' and v_new.manager_id is not distinct from me and v_new.manager_id is not null),
    false);
  if not v_allowed then raise exception 'You are not allowed to assign tasks to this person' using errcode = '42501'; end if;

  update public.tasks set
    assignee_id  = p_new_assignee,
    status       = 'assigned',
    title        = coalesce(nullif(trim(p_title), ''), title),
    description  = case when p_description is not null then nullif(trim(p_description), '') else description end,
    priority     = coalesce(p_priority, priority),
    due_date     = coalesce(p_due, due_date),
    checklist    = coalesce(p_checklist, checklist),
    submitted_at = null,
    approved_at  = null,
    rating       = null
  where id = p_task;

  select full_name into v_me_name from public.users where id = me;
  insert into public.task_events (task_id, actor_id, from_status, to_status, note)
  values (p_task, me, 'returned', 'assigned', coalesce(v_note, 'Reassigned to ' || v_new.full_name));

  if p_new_assignee <> me then
    perform app.notify(p_new_assignee, 'task_assigned',
      'New task from ' || coalesce(v_me_name, 'your manager'),
      coalesce(nullif(trim(p_title), ''), t.title)
        || case when coalesce(p_due, t.due_date) is not null then ' · due ' || to_char(coalesce(p_due, t.due_date), 'DD Mon') else '' end,
      'tasks', p_task);
  end if;

  return p_task;
end $$;

revoke all on function public.reassign_task(uuid, uuid, text, text, public.task_priority, date, jsonb, text) from public, anon;
grant execute on function public.reassign_task(uuid, uuid, text, text, public.task_priority, date, jsonb, text) to authenticated;
