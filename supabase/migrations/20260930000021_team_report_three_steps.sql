-- =====================================================================
-- 021 TEAM REPORT for the three-step task flow (Assigned -> Accepted -> Done):
-- 'not_started' = Assigned (not accepted yet), 'in_progress' = Accepted.
-- =====================================================================

create or replace function public.team_member_report(p_target uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u public.users;
  d public.employee_details;
  me uuid := auth.uid();
  result jsonb;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not (app.manages(p_target) or app.is_boss() or app.is_hr()) then
    raise exception 'You can only view reports for people in your team' using errcode = '42501';
  end if;
  select * into u from public.users where id = p_target;
  if not found then raise exception 'Person not found'; end if;
  select * into d from public.employee_details where user_id = p_target;

  result := jsonb_build_object(
    'person', jsonb_build_object(
      'id', u.id, 'full_name', u.full_name, 'email', u.email, 'role', u.role, 'job_title', u.job_title,
      'department', (select x.name from public.departments x where x.id = u.department_id),
      'manager', (select m.full_name from public.users m where m.id = u.manager_id),
      'is_active', u.is_active, 'member_since', coalesce(u.activated_at, u.created_at),
      'joined_on', case when app.can_see_field(p_target, 'contact') then d.joined_on end),
    'attendance_pct', case when app.can_see_field(p_target, 'attendance') then d.attendance_pct end,
    'performance_rating', case when app.can_see_field(p_target, 'performance') then d.performance_rating end);

  -- Task counts, quality and speed
  result := result || (
    select jsonb_build_object(
      'tasks', jsonb_build_object(
        'total',           count(*),
        'done',            count(*) filter (where t.status in ('approved','closed')),
        'open',            count(*) filter (where t.status not in ('approved','closed')),
        'not_started',     count(*) filter (where t.status = 'assigned'),
        'in_progress',     count(*) filter (where t.status in ('accepted','in_progress','blocked','submitted','returned')),
        'blocked',         count(*) filter (where t.status = 'blocked'),
        'awaiting_review', count(*) filter (where t.status = 'submitted'),
        'returned',        count(*) filter (where t.status = 'returned'),
        'overdue',         count(*) filter (where t.status not in ('approved','closed') and t.due_date < current_date),
        'due_7d',          count(*) filter (where t.status not in ('approved','closed') and t.due_date between current_date and current_date + 7),
        'done_30d',        count(*) filter (where t.status in ('approved','closed') and t.approved_at >= now() - interval '30 days')),
      'priority_open', jsonb_build_object(
        'urgent', count(*) filter (where t.priority = 'urgent' and t.status not in ('approved','closed')),
        'high',   count(*) filter (where t.priority = 'high'   and t.status not in ('approved','closed')),
        'medium', count(*) filter (where t.priority = 'medium' and t.status not in ('approved','closed')),
        'low',    count(*) filter (where t.priority = 'low'    and t.status not in ('approved','closed'))),
      'quality', jsonb_build_object(
        'on_time',  count(*) filter (where t.status in ('approved','closed') and (t.due_date is null or t.approved_at::date <= t.due_date)),
        'late',     count(*) filter (where t.status in ('approved','closed') and t.due_date is not null and t.approved_at::date > t.due_date),
        'reworked', count(*) filter (where exists (select 1 from public.task_events e where e.task_id = t.id and e.to_status = 'returned')),
        'avg_days_to_complete', round((avg(extract(epoch from (t.approved_at - t.created_at)) / 86400)
                                   filter (where t.approved_at is not null))::numeric, 1)))
    from public.tasks t where t.assignee_id = p_target and not t.is_personal);

  -- Work habits (from their own actions on tasks)
  result := result || jsonb_build_object('habits', jsonb_build_object(
    'avg_hours_to_accept', (
      select round((avg(extract(epoch from (a.first_accept - t.created_at)) / 3600))::numeric, 1)
      from public.tasks t
      join lateral (select min(e.created_at) as first_accept from public.task_events e where e.task_id = t.id and e.to_status = 'accepted') a on true
      where t.assignee_id = p_target and not t.is_personal and a.first_accept is not null),
    'updates_30d',     (select count(*) from public.task_events e where e.actor_id = p_target and e.created_at >= now() - interval '30 days'),
    'active_days_30d', (select count(distinct e.created_at::date) from public.task_events e where e.actor_id = p_target and e.created_at >= now() - interval '30 days'),
    'last_active',     (select max(e.created_at) from public.task_events e where e.actor_id = p_target),
    'blocked_times',   (select count(*) from public.task_events e join public.tasks t on t.id = e.task_id
                        where t.assignee_id = p_target and not t.is_personal and e.to_status = 'blocked'),
    -- Only feedback the viewer can already read: addressed to them, not anonymous.
    'feedback_to_me',  (select count(*) from public.feedback_items f where f.author_id = p_target and not f.is_anonymous
                        and (app.is_boss() or app.is_hr() or (f.recipient_manager_id = me and f.audience in ('manager','all')))),
    'blockers_to_me',  (select count(*) from public.feedback_items f where f.author_id = p_target and not f.is_anonymous and f.type = 'blocker'
                        and (app.is_boss() or app.is_hr() or (f.recipient_manager_id = me and f.audience in ('manager','all'))))));

  -- Completed per month, last 6 months (oldest first)
  result := result || jsonb_build_object('monthly', (
    select jsonb_agg(jsonb_build_object('month', to_char(m, 'Mon'), 'done', coalesce(c.n, 0)) order by m)
    from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
    left join (select date_trunc('month', t.approved_at) as mo, count(*) as n from public.tasks t
               where t.assignee_id = p_target and not t.is_personal and t.approved_at is not null group by 1) c on c.mo = m));

  result := result || jsonb_build_object(
    'recent_tasks', coalesce((
      select jsonb_agg(x order by x.sort_key desc) from (
        select t.id, t.title, t.status, t.priority, t.due_date, t.updated_at as sort_key,
               (t.status not in ('approved','closed') and t.due_date < current_date) as overdue
        from public.tasks t where t.assignee_id = p_target and not t.is_personal
        order by t.updated_at desc limit 15) x), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select e.created_at, e.to_status, e.note, t.title, t.id as task_id,
               (select a.full_name from public.users a where a.id = e.actor_id) as actor
        from public.task_events e join public.tasks t on t.id = e.task_id
        where t.assignee_id = p_target and not t.is_personal
        order by e.created_at desc limit 20) x), '[]'::jsonb));

  if p_target <> me then perform app.audit('team.member_report', 'users', p_target, '{}'::jsonb); end if;
  return result;
end $$;
