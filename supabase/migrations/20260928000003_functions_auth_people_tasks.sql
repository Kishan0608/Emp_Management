-- =====================================================================
-- 003 FUNCTIONS: session, people, visibility, tasks
-- =====================================================================

-- ---------- session ----------
create or replace function public.my_context() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  u public.users;
  s public.app_settings;
begin
  select * into u from public.users where id = auth.uid();
  if not found then raise exception 'Account not found' using errcode = '42501'; end if;
  select * into s from public.app_settings where id = 1;
  return jsonb_build_object(
    'user', to_jsonb(u) - 'push_token',
    'department', (select d.name from public.departments d where d.id = u.department_id),
    'manager', (select m.full_name from public.users m where m.id = u.manager_id),
    'is_committee', exists (select 1 from public.committee_members c where c.user_id = u.id),
    'mfa_required', u.role in ('boss','hr') and s.require_mfa_admins,
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'settings', jsonb_build_object(
      'company_name', s.company_name,
      'session_timeout_minutes', s.session_timeout_minutes,
      'privacy_notice_version', s.privacy_notice_version,
      'monthly_complaint_quota', s.monthly_complaint_quota,
      'min_group_size', s.min_group_size,
      'yellow_threshold', s.yellow_threshold,
      'red_threshold', s.red_threshold,
      'window_days', s.window_days,
      'blocker_hr_hours', s.blocker_hr_hours,
      'blocker_boss_hours', s.blocker_boss_hours,
      'require_mfa_admins', s.require_mfa_admins,
      'retention_complaint_days', s.retention_complaint_days,
      'retention_audit_days', s.retention_audit_days)
  );
end $$;

create or replace function public.record_login() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_active_user() then
    raise exception 'This account is deactivated' using errcode = '42501';
  end if;
  perform app.audit('auth.login', 'users', auth.uid(), jsonb_build_object('aal', coalesce(auth.jwt() ->> 'aal', 'aal1')));
end $$;

create or replace function public.record_logout(p_all_devices boolean default false) returns void
language sql security definer set search_path = '' as $$
  select app.audit(case when p_all_devices then 'auth.logout_all' else 'auth.logout' end, 'users', auth.uid());
$$;

create or replace function public.accept_privacy_notice() returns void
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  select privacy_notice_version into v from public.app_settings where id = 1;
  update public.users set consent_version = v, consent_at = now() where id = auth.uid();
  perform app.audit('privacy.consent', 'users', auth.uid(), jsonb_build_object('version', v));
end $$;

create or replace function public.password_changed() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.users set must_change_password = false where id = auth.uid();
  perform app.audit('auth.password_changed', 'users', auth.uid());
end $$;

-- ---------- people (Boss) ----------
create or replace function public.admin_update_user(
  p_user_id uuid,
  p_role public.app_role,
  p_department_id uuid,
  p_manager_id uuid,
  p_job_title text,
  p_is_active boolean,
  p_is_case_handler boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare old_row public.users;
begin
  if not app.is_boss() then raise exception 'Only the Boss can change accounts' using errcode = '42501'; end if;
  select * into old_row from public.users where id = p_user_id for update;
  if not found then raise exception 'User not found'; end if;
  if p_user_id = auth.uid() and (p_role <> 'boss' or not p_is_active) then
    raise exception 'You cannot demote or deactivate your own account';
  end if;
  if p_manager_id = p_user_id then raise exception 'A person cannot be their own manager'; end if;
  if p_is_case_handler and p_role <> 'hr' then raise exception 'Only HR can be a complaint case handler'; end if;

  update public.users set
    role = p_role, department_id = p_department_id, manager_id = p_manager_id,
    job_title = nullif(trim(p_job_title), ''), is_active = p_is_active, is_case_handler = p_is_case_handler
  where id = p_user_id;

  perform app.audit('user.update', 'users', p_user_id, jsonb_build_object(
    'old', jsonb_build_object('role', old_row.role, 'department_id', old_row.department_id, 'manager_id', old_row.manager_id,
                              'is_active', old_row.is_active, 'is_case_handler', old_row.is_case_handler),
    'new', jsonb_build_object('role', p_role, 'department_id', p_department_id, 'manager_id', p_manager_id,
                              'is_active', p_is_active, 'is_case_handler', p_is_case_handler)));
  if old_row.role <> p_role then
    perform app.notify(p_user_id, 'role', 'Your role changed', 'You are now ' || p_role::text || '. Sign in again to refresh access.', 'users', p_user_id);
  end if;
end $$;

create or replace function public.admin_set_employee_details(
  p_user_id uuid, p_phone text, p_personal_email text, p_address text,
  p_salary numeric, p_attendance numeric, p_performance numeric, p_joined_on date
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only Boss or HR can edit employee records' using errcode = '42501'; end if;
  if app.is_hr() and p_user_id = auth.uid() then raise exception 'HR cannot edit their own record'; end if;
  insert into public.employee_details as d (user_id, phone, personal_email, address, salary_monthly, attendance_pct, performance_rating, joined_on)
  values (p_user_id, p_phone, p_personal_email, p_address, p_salary, p_attendance, p_performance, p_joined_on)
  on conflict (user_id) do update set
    phone = excluded.phone, personal_email = excluded.personal_email, address = excluded.address,
    salary_monthly = excluded.salary_monthly, attendance_pct = excluded.attendance_pct,
    performance_rating = excluded.performance_rating, joined_on = excluded.joined_on;
  perform app.audit('employee_details.update', 'employee_details', p_user_id);
end $$;

create or replace function public.admin_set_visibility(
  p_viewer_id uuid, p_viewer_role public.app_role, p_field public.visibility_field, p_allowed boolean
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_boss() then raise exception 'Only the Boss can change visibility' using errcode = '42501'; end if;
  if (p_viewer_id is null) = (p_viewer_role is null) then raise exception 'Choose either a person or a role'; end if;
  insert into public.visibility_rules (viewer_id, viewer_role, field_name, allowed, set_by, updated_at)
  values (p_viewer_id, p_viewer_role, p_field, p_allowed, auth.uid(), now())
  on conflict on constraint visibility_unique
  do update set allowed = excluded.allowed, set_by = excluded.set_by, updated_at = now();
end $$;

create or replace function public.admin_clear_person_visibility(p_viewer_id uuid, p_field public.visibility_field) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_boss() then raise exception 'Only the Boss can change visibility' using errcode = '42501'; end if;
  delete from public.visibility_rules where viewer_id = p_viewer_id and field_name = p_field;
end $$;

create or replace function public.admin_set_committee(p_user_id uuid, p_member boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_boss() then raise exception 'Only the Boss can change the committee' using errcode = '42501'; end if;
  if p_member then
    insert into public.committee_members (user_id, added_by) values (p_user_id, auth.uid()) on conflict do nothing;
  else
    delete from public.committee_members where user_id = p_user_id;
  end if;
  perform app.audit(case when p_member then 'committee.add' else 'committee.remove' end, 'committee_members', p_user_id);
end $$;

-- Employee profile, filtered field by field by the Boss's visibility rules.
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
    allowed := allowed || 'contact';
    result := result || jsonb_build_object('phone', d.phone, 'personal_email', d.personal_email, 'address', d.address, 'joined_on', d.joined_on);
  end if;
  if app.can_see_field(p_target, 'salary') then
    allowed := allowed || 'salary';
    result := result || jsonb_build_object('salary_monthly', d.salary_monthly);
  end if;
  if app.can_see_field(p_target, 'attendance') then
    allowed := allowed || 'attendance';
    result := result || jsonb_build_object('attendance_pct', d.attendance_pct);
  end if;
  if app.can_see_field(p_target, 'performance') then
    allowed := allowed || 'performance';
    result := result || jsonb_build_object('performance_rating', d.performance_rating);
  end if;
  if app.can_see_field(p_target, 'task_history') then
    allowed := allowed || 'task_history';
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

-- ---------- tasks ----------
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
  v_id uuid;
begin
  if v_role is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not app.mfa_ok() then raise exception 'Two-factor verification required' using errcode = '42501'; end if;
  select * into a from public.users where id = p_assignee and is_active;
  if not found then raise exception 'Assignee not found or inactive'; end if;

  if not (
       p_assignee = auth.uid()
    or v_role = 'boss'
    or (v_role = 'hr' and a.role in ('employee','hr'))
    or (v_role = 'manager' and a.manager_id = auth.uid())
  ) then
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

create or replace function app.create_feedback(
  p_author uuid, p_type public.feedback_type, p_audience public.feedback_audience, p_title text, p_body text,
  p_anonymous boolean, p_task uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  a public.users;
  v_id uuid;
  v_label text;
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
  if p_audience in ('manager','all') or p_type = 'blocker' then
    perform app.notify(a.manager_id, 'feedback_' || p_type::text, initcap(p_type::text) || ' from ' || v_label, trim(p_title), 'feedback_items', v_id);
  end if;
  if p_audience in ('hr','all') or (p_type = 'blocker' and a.manager_id is null) then
    perform app.notify_role('hr', 'feedback_' || p_type::text, initcap(p_type::text) || ' from ' || v_label, trim(p_title), 'feedback_items', v_id, p_author);
  end if;
  if p_audience = 'boss' then
    perform app.notify_role('boss', 'feedback_' || p_type::text, initcap(p_type::text) || ' from ' || v_label, trim(p_title), 'feedback_items', v_id, p_author);
  end if;
  return v_id;
end $$;
revoke all on function app.create_feedback(uuid, public.feedback_type, public.feedback_audience, text, text, boolean, uuid) from public, anon, authenticated;

create or replace function public.change_task_status(
  p_task uuid, p_to public.task_status, p_note text default null, p_proof_url text default null
) returns public.task_status
language plpgsql security definer set search_path = '' as $$
declare
  t public.tasks;
  me uuid := auth.uid();
  is_assignee boolean;
  is_reviewer boolean;
  ok boolean := false;
  v_note text := nullif(trim(p_note), '');
  v_proof text := nullif(trim(p_proof_url), '');
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not app.mfa_ok() then raise exception 'Two-factor verification required' using errcode = '42501'; end if;
  select * into t from public.tasks where id = p_task for update;
  if not found then raise exception 'Task not found'; end if;

  is_assignee := t.assignee_id = me;
  is_reviewer := t.reviewer_id = me or t.created_by = me or app.is_boss();

  ok := case
    when p_to = 'accepted'    and t.status = 'assigned' and is_assignee then true
    when p_to = 'in_progress' and t.status in ('assigned','accepted','blocked','returned') and is_assignee then true
    when p_to = 'blocked'     and t.status in ('accepted','in_progress') and is_assignee then true
    when p_to = 'submitted'   and t.status in ('accepted','in_progress') and is_assignee then true
    when p_to = 'approved'    and t.status = 'submitted' and is_reviewer then true
    when p_to = 'returned'    and t.status = 'submitted' and is_reviewer then true
    when p_to = 'closed'      and t.status = 'approved'  and is_reviewer then true
    when p_to = 'closed'      and t.is_personal and is_assignee and t.status <> 'closed' then true
    else false
  end;
  if not ok then
    raise exception 'You cannot move this task from % to %', t.status, p_to using errcode = '42501';
  end if;

  if p_to = 'submitted' and v_note is null and v_proof is null then
    raise exception 'Add proof of work: a comment, file or link';
  end if;
  if p_to in ('returned','blocked') and v_note is null then
    raise exception 'A reason is required';
  end if;

  update public.tasks set
    status = p_to,
    submitted_at = case when p_to = 'submitted' then now() else submitted_at end,
    approved_at  = case when p_to = 'approved' then now()
                        when p_to = 'closed' and t.is_personal then coalesce(approved_at, now())
                        else approved_at end
  where id = p_task;

  insert into public.task_events (task_id, actor_id, from_status, to_status, note, proof_url)
  values (p_task, me, t.status, p_to, v_note, v_proof);

  if p_to = 'submitted' and t.reviewer_id <> me then
    perform app.notify(t.reviewer_id, 'task_review', 'Review needed', t.title, 'tasks', p_task);
  elsif p_to in ('approved','returned') and t.assignee_id <> me then
    perform app.notify(t.assignee_id, 'task_' || p_to::text,
      case when p_to = 'approved' then 'Task approved' else 'Task returned' end,
      t.title || coalesce(': ' || v_note, ''), 'tasks', p_task);
  elsif p_to = 'blocked' then
    perform app.create_feedback(me, 'blocker', 'manager', 'Blocked: ' || left(t.title, 140), v_note, false, p_task);
    if t.reviewer_id <> me then
      perform app.notify(t.reviewer_id, 'task_blocked', 'Task blocked', t.title, 'tasks', p_task);
    end if;
  end if;
  return p_to;
end $$;

create or replace function public.update_task_checklist(p_task uuid, p_checklist jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(p_checklist) <> 'array' then raise exception 'Checklist must be a list'; end if;
  update public.tasks set checklist = p_checklist
   where id = p_task and (assignee_id = auth.uid() or created_by = auth.uid()) and status not in ('approved','closed');
  if not found then raise exception 'You cannot edit this checklist' using errcode = '42501'; end if;
end $$;

create or replace function public.add_task_attachment(p_task uuid, p_path text, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if split_part(p_path, '/', 1) <> p_task::text then raise exception 'Invalid file path'; end if;
  update public.tasks set attachments = attachments || jsonb_build_array(jsonb_build_object(
      'path', p_path, 'name', p_name, 'by', auth.uid(), 'at', now()))
   where id = p_task and (assignee_id = auth.uid() or created_by = auth.uid() or reviewer_id = auth.uid());
  if not found then raise exception 'You cannot attach files to this task' using errcode = '42501'; end if;
end $$;

-- ---------- storage for task proof files ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-files', 'task-files', false, 10485760)
on conflict (id) do nothing;

create policy "task files: upload by task participants" on storage.objects for insert to authenticated
with check (
  bucket_id = 'task-files' and exists (
    select 1 from public.tasks t
    where t.id::text = (storage.foldername(name))[1]
      and (t.assignee_id = auth.uid() or t.created_by = auth.uid() or t.reviewer_id = auth.uid())
  )
);
create policy "task files: read if task visible" on storage.objects for select to authenticated
using (
  bucket_id = 'task-files' and exists (
    select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1]
  )
);
