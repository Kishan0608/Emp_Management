-- =====================================================================
-- Restore departments.organization_id (it was missing from the schema, which
-- broke dashboard_stats() and onboarding_options() with
-- "column d.organization_id does not exist"). Departments can be assigned to
-- an organization, or left null for company-wide.
-- The functions below no longer filter on the column, so behaviour is unchanged.
-- =====================================================================

alter table public.departments
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

-- The earlier departments_universal check (organization_id must be null) is removed.
alter table public.departments drop constraint if exists departments_universal;

-- Dashboard stats with optional organization filtering
create or replace function public.dashboard_stats(p_org uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.app_role := app.uid_role();
  me uuid := auth.uid();
  my_user public.users;
  v_target_org uuid;
  result jsonb;
begin
  if v_role is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into my_user from public.users where id = me;

  if v_role = 'boss' then
    v_target_org := p_org;
  else
    v_target_org := my_user.organization_id;
  end if;

  result := jsonb_build_object(
    'my_tasks', (select jsonb_build_object(
        'open',      count(*) filter (where status not in ('approved','closed')),
        'due_today', count(*) filter (where status not in ('approved','closed') and due_date = current_date),
        'overdue',   count(*) filter (where status not in ('approved','closed') and due_date < current_date),
        'to_review', (select count(*) from public.tasks r where r.reviewer_id = me and r.status = 'submitted' and r.assignee_id <> me),
        'done_30d',  count(*) filter (where status in ('approved','closed') and approved_at > now() - interval '30 days'))
      from public.tasks where assignee_id = me),
    'unread_notifications', (select count(*) from public.notifications n where n.user_id = me and not n.is_read),
    'my_open_feedback', (select count(*) from public.feedback_items f where f.author_id = me and f.status <> 'resolved'));

  if v_role = 'manager' then
    result := result || jsonb_build_object('team', (select jsonb_build_object(
        'members',  (select count(*) from public.users u where u.manager_id = me and u.is_active),
        'open',     count(*) filter (where t.status not in ('approved','closed')),
        'blocked',  count(*) filter (where t.status = 'blocked'),
        'overdue',  count(*) filter (where t.status not in ('approved','closed') and t.due_date < current_date),
        'feedback_open', (select count(*) from public.feedback_items f where f.recipient_manager_id = me
                           and f.audience in ('manager','all') and f.status in ('open','acknowledged')))
      from public.tasks t join public.users u on u.id = t.assignee_id
      where u.manager_id = me and not t.is_personal));
  end if;

  if app.is_hr() or app.is_boss() then
    result := result || jsonb_build_object(
      'feedback_open',  (select count(*) from public.feedback_items f
                         join public.users u on u.id = f.author_id
                         where f.status in ('open','acknowledged')
                         and (v_target_org is null or u.organization_id = v_target_org)),
      'blockers_open',  (select count(*) from public.feedback_items f
                         join public.users u on u.id = f.author_id
                         where f.type = 'blocker' and f.status in ('open','acknowledged')
                         and (v_target_org is null or u.organization_id = v_target_org)));
  end if;

  if app.is_boss() then
    result := result || jsonb_build_object(
      'headcount', (select coalesce(jsonb_object_agg(role, n), '{}'::jsonb) from (
          select role, count(*) n from public.users
          where is_active and (v_target_org is null or organization_id = v_target_org)
          group by role) x),
      'tasks_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
          select t.status, count(*) n
          from public.tasks t
          join public.users u on u.id = t.assignee_id
          where not t.is_personal and (v_target_org is null or u.organization_id = v_target_org)
          group by t.status) x),
      'tasks_overdue', (select count(*) from public.tasks t
                        join public.users u on u.id = t.assignee_id
                        where not t.is_personal and t.status not in ('approved','closed') and t.due_date < current_date
                        and (v_target_org is null or u.organization_id = v_target_org)),
      'on_time_rate_30d', (select round(100.0 * count(*) filter (where t.due_date is null or t.approved_at::date <= t.due_date) / nullif(count(*), 0))
                           from public.tasks t
                           join public.users u on u.id = t.assignee_id
                           where not t.is_personal and t.approved_at > now() - interval '30 days'
                           and (v_target_org is null or u.organization_id = v_target_org)),
      'by_department', (select coalesce(jsonb_agg(x order by x.name), '[]'::jsonb) from (
          select d.name,
                 count(t.id) filter (where t.status not in ('approved','closed')) as open,
                 count(t.id) filter (where t.status in ('approved','closed')) as done,
                 count(t.id) filter (where t.status not in ('approved','closed') and t.due_date < current_date) as overdue
          from public.departments d
          left join public.users u on u.department_id = d.id and (v_target_org is null or u.organization_id = v_target_org)
          left join public.tasks t on t.assignee_id = u.id and not t.is_personal
          group by d.name) x));
  end if;
  return result;
end $$;
grant execute on function public.dashboard_stats(uuid) to authenticated;

-- Delete organization (Boss only). Departments have no organization link, so there is nothing to detach.
create or replace function public.delete_organization(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user_count int;
begin
  if not app.is_boss() then raise exception 'Only the Boss can delete organizations' using errcode = '42501'; end if;

  select count(*) into v_user_count
  from public.users
  where organization_id = p_id;

  if v_user_count > 0 then
    raise exception 'Cannot delete company: % employee(s) are currently assigned to it', v_user_count;
  end if;

  -- Soft delete / hard delete
  delete from public.organizations where id = p_id;
  if not found then
    update public.organizations set is_active = false where id = p_id;
  end if;

  return true;
end $$;
grant execute on function public.delete_organization(uuid) to authenticated;

-- Onboarding options (departments are company-wide)
create or replace function public.onboarding_options() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u public.users;
begin
  u := app.me_row();
  if u.id is null or u.account_status not in ('key_verified', 'approver_pending') then raise exception 'Not available' using errcode = '42501'; end if;
  return jsonb_build_object(
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
                             from public.departments d), '[]'::jsonb),
    'approvers', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'full_name', x.full_name, 'role', x.role, 'job_title', x.job_title,
                                                               'department', (select d.name from public.departments d where d.id = x.department_id))
                                             order by case x.role when 'boss' then 0 when 'hr' then 1 else 2 end, x.full_name)
                           from public.users x where x.is_active and x.account_status = 'active' and x.role in ('boss', 'hr', 'manager')
                           and (x.role = 'boss' or x.organization_id = u.organization_id)), '[]'::jsonb),
    'organization', (select jsonb_build_object('id', o.id, 'name', o.name) from public.organizations o where o.id = u.organization_id),
    'organizations', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) order by o.name) from public.organizations o where o.is_active), '[]'::jsonb));
end $$;
