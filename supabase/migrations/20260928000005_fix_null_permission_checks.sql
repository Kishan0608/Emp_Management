-- =====================================================================
-- 005 FIXES FOUND BY THE ROLE TESTS
-- 1. NULL-safe permission checks. "not (x = NULL)" is NULL, and IF NULL does not
--    raise, so a manager could assign work to someone with no manager (e.g. HR),
--    and anyone could reply to / resolve anonymous feedback (author_id is NULL).
-- 2. get_employee_profile: text[] || 'literal' was parsed as array || array.
-- 3. Role helpers returned NULL (not false) for deactivated users, so
--    "if not app.is_boss() then raise" would not raise for them. Now always boolean.
-- =====================================================================

create or replace function app.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case
    when app.uid_role() in ('boss','hr')
         and (select s.require_mfa_admins from public.app_settings s where s.id = 1)
      then coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    else true
  end, false)
$$;

create or replace function app.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.uid_role() is not null
$$;

create or replace function app.is_boss() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.uid_role() = 'boss', false) and app.mfa_ok()
$$;

create or replace function app.is_hr() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.uid_role() = 'hr', false) and app.mfa_ok()
$$;

create or replace function public.create_task(
  p_title text, p_description text, p_assignee uuid, p_reviewer uuid,
  p_priority public.task_priority, p_due date, p_visibility public.task_visibility, p_checklist jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.app_role := app.uid_role();
  a public.users;
  v_reviewer uuid := coalesce(p_reviewer, auth.uid());
  v_personal boolean;
  v_allowed boolean;
  v_id uuid;
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
    perform app.notify(p_assignee, 'task_assigned', 'New task assigned', trim(p_title), 'tasks', v_id);
  end if;
  return v_id;
end $$;

create or replace function app.can_respond_feedback(f public.feedback_items) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    app.is_boss() or app.is_hr()
    or (app.uid_role() = 'manager' and f.recipient_manager_id = auth.uid() and f.audience in ('manager','all')),
    false)
$$;

create or replace function public.reply_feedback(p_id uuid, p_body text, p_publish boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.feedback_items; v_responder boolean; v_is_author boolean; v_name text;
begin
  select * into f from public.feedback_items where id = p_id for update;
  if not found then raise exception 'Item not found'; end if;
  v_responder := app.can_respond_feedback(f);
  v_is_author := f.author_id is not null and f.author_id = auth.uid();
  if not (v_responder or v_is_author) then raise exception 'You cannot reply to this item' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 2 then raise exception 'Reply is empty'; end if;

  insert into public.feedback_replies (feedback_id, responder_id, body) values (p_id, auth.uid(), trim(p_body));

  if v_responder and not v_is_author then
    update public.feedback_items set
      status = case when status = 'resolved' then status else 'answered' end,
      answered_at = coalesce(answered_at, now()),
      acknowledged_at = coalesce(acknowledged_at, now()),
      is_published = case when p_publish and type = 'question' then true else is_published end
    where id = p_id;
    select full_name into v_name from public.users where id = auth.uid();
    perform app.notify(f.author_id, 'feedback_reply', v_name || ' replied', f.title, 'feedback_items', p_id);
  else
    perform app.notify(f.recipient_manager_id, 'feedback_reply', 'New follow-up', f.title, 'feedback_items', p_id);
  end if;
end $$;

create or replace function public.set_feedback_status(p_id uuid, p_status public.feedback_status) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.feedback_items; v_is_author boolean;
begin
  select * into f from public.feedback_items where id = p_id for update;
  if not found then raise exception 'Item not found'; end if;
  v_is_author := f.author_id is not null and f.author_id = auth.uid();
  if not (app.can_respond_feedback(f) or (v_is_author and p_status = 'resolved')) then
    raise exception 'You cannot change this item' using errcode = '42501';
  end if;
  update public.feedback_items set
    status = p_status,
    acknowledged_at = case when p_status <> 'open' then coalesce(acknowledged_at, now()) else acknowledged_at end,
    resolved_at = case when p_status = 'resolved' then now() else null end
  where id = p_id;
  perform app.notify(f.author_id, 'feedback_status', 'Status: ' || p_status::text, f.title, 'feedback_items', p_id);
end $$;

create or replace function public.get_employee_profile(p_target uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u public.users;
  d public.employee_details;
  result jsonb;
  allowed text[] := '{}';
  stats jsonb;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into u from public.users where id = p_target;
  if not found then raise exception 'Employee not found'; end if;
  select * into d from public.employee_details where user_id = p_target;

  result := jsonb_build_object(
    'id', u.id, 'full_name', u.full_name, 'email', u.email, 'role', u.role, 'job_title', u.job_title,
    'is_active', u.is_active, 'created_at', u.created_at, 'manager_id', u.manager_id, 'department_id', u.department_id,
    'is_case_handler', u.is_case_handler,
    'department', (select x.name from public.departments x where x.id = u.department_id),
    'manager', (select m.full_name from public.users m where m.id = u.manager_id),
    'is_committee', exists (select 1 from public.committee_members c where c.user_id = u.id));

  if app.can_see_field(p_target, 'contact') then
    allowed := array_append(allowed, 'contact');
    result := result || jsonb_build_object('phone', d.phone, 'personal_email', d.personal_email, 'address', d.address, 'joined_on', d.joined_on);
  end if;
  if app.can_see_field(p_target, 'salary') then
    allowed := array_append(allowed, 'salary');
    result := result || jsonb_build_object('salary_monthly', d.salary_monthly);
  end if;
  if app.can_see_field(p_target, 'attendance') then
    allowed := array_append(allowed, 'attendance');
    result := result || jsonb_build_object('attendance_pct', d.attendance_pct);
  end if;
  if app.can_see_field(p_target, 'performance') then
    allowed := array_append(allowed, 'performance');
    result := result || jsonb_build_object('performance_rating', d.performance_rating);
  end if;
  if app.can_see_field(p_target, 'task_history') then
    allowed := array_append(allowed, 'task_history');
    select jsonb_build_object(
      'total',     count(*),
      'completed', count(*) filter (where t.status in ('approved','closed')),
      'on_time',   count(*) filter (where t.status in ('approved','closed') and (t.due_date is null or t.approved_at::date <= t.due_date)),
      'overdue',   count(*) filter (where t.status not in ('approved','closed') and t.due_date < current_date),
      'open',      count(*) filter (where t.status not in ('approved','closed')),
      'returned',  (select count(*) from public.task_events e join public.tasks t2 on t2.id = e.task_id
                    where t2.assignee_id = p_target and e.to_status = 'returned' and not t2.is_personal))
    into stats
    from public.tasks t where t.assignee_id = p_target and not t.is_personal;

    result := result || jsonb_build_object('task_stats', stats, 'timeline', coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select e.created_at, e.to_status, e.note, t.title, t.id as task_id
        from public.task_events e join public.tasks t on t.id = e.task_id
        where t.assignee_id = p_target and not t.is_personal
        order by e.created_at desc limit 25) x), '[]'::jsonb));
  end if;

  if p_target <> auth.uid() and (allowed && array['contact','salary','attendance','performance']) then
    perform app.audit('profile.view', 'users', p_target, jsonb_build_object('fields', allowed));
  end if;
  return result || jsonb_build_object('visible_fields', to_jsonb(allowed));
end $$;

grant execute on function public.create_task(text, text, uuid, uuid, public.task_priority, date, public.task_visibility, jsonb) to authenticated;
revoke execute on function public.create_task(text, text, uuid, uuid, public.task_priority, date, public.task_visibility, jsonb) from public, anon;
