-- =====================================================================
-- 020 TASKS: three steps — Assigned -> Accepted -> Done
--
--  * The assignee accepts the task       (assigned -> accepted)
--  * The assignee marks it done           (accepted -> closed, shown as "Done")
--    with an optional note / link; files can be attached on the task.
--  * Whoever assigned it (and the reviewer, if different) is notified at
--    each step. There is no separate approval step any more.
--
-- The old enum values stay (history in task_events keeps its meaning), but
-- no task moves into them now. Existing tasks are mapped onto the new flow:
-- in progress / blocked / returned / submitted -> accepted, approved -> done.
-- "Done" is status 'closed' with approved_at set, which is what every report
-- already counts as completed.
-- =====================================================================

update public.tasks set status = 'accepted'
 where status in ('in_progress', 'blocked', 'returned', 'submitted');
update public.tasks set status = 'closed', approved_at = coalesce(approved_at, now())
 where status = 'approved';

create or replace function public.change_task_status(
  p_task uuid, p_to public.task_status, p_note text default null, p_proof_url text default null
) returns public.task_status
language plpgsql security definer set search_path = '' as $$
declare
  t public.tasks;
  me uuid := auth.uid();
  v_note text := nullif(trim(p_note), '');
  v_proof text := nullif(trim(p_proof_url), '');
  v_name text;
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
    -- whoever assigned it
    if t.created_by is distinct from me then
      perform app.notify(t.created_by,
        case when p_to = 'accepted' then 'task_accepted' else 'task_done' end,
        case when p_to = 'accepted' then 'Task accepted' else 'Task done' end,
        v_name || case when p_to = 'accepted' then ' accepted: ' else ' finished: ' end || t.title,
        'tasks', p_task);
    end if;
    -- the reviewer, if someone else
    if t.reviewer_id is not null and t.reviewer_id is distinct from me and t.reviewer_id is distinct from t.created_by then
      perform app.notify(t.reviewer_id,
        case when p_to = 'accepted' then 'task_accepted' else 'task_done' end,
        case when p_to = 'accepted' then 'Task accepted' else 'Task done' end,
        v_name || case when p_to = 'accepted' then ' accepted: ' else ' finished: ' end || t.title,
        'tasks', p_task);
    end if;
  end if;
  return p_to;
end $$;
revoke all on function public.change_task_status(uuid, public.task_status, text, text) from public, anon;
grant execute on function public.change_task_status(uuid, public.task_status, text, text) to authenticated;
