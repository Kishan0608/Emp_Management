-- =====================================================================
-- 025 MULTI-ORGANIZATION SUPPORT
-- Support multiple companies/organizations across onboarding, sign-up,
-- admin settings, and boss-level organization filtering.
-- =====================================================================

insert into public.organizations (name, is_active)
values
  ('Karni Syntex Pvt Ltd', true),
  ('SKFL Logistics & Supply', true)
on conflict do nothing;

-- Ensure RLS on organizations
alter table public.organizations enable row level security;
drop policy if exists orgs_public_read on public.organizations;
drop policy if exists orgs_read_all on public.organizations;
create policy orgs_read_all on public.organizations for select using (is_active or app.is_boss());

drop policy if exists orgs_boss_insert on public.organizations;
create policy orgs_boss_insert on public.organizations for insert with check (app.is_boss());

drop policy if exists orgs_boss_update on public.organizations;
create policy orgs_boss_update on public.organizations for update using (app.is_boss());

grant select on public.organizations to anon, authenticated;
grant insert, update on public.organizations to authenticated;

-- Helper to create organization (Boss only)
create or replace function public.create_organization(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.is_boss() then raise exception 'Only the Boss can add organizations' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Organization name must be at least 2 characters'; end if;
  insert into public.organizations (name, is_active)
  values (trim(p_name), true)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.create_organization(text) to authenticated;

-- Update auth user trigger to capture organization_id from user_metadata
create or replace function app.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_first boolean;
  v_org uuid;
begin
  select not exists (select 1 from public.users) into v_first;
  begin
    v_org := nullif(new.raw_user_meta_data ->> 'organization_id', '')::uuid;
  exception when others then
    v_org := null;
  end;

  if v_org is null or not exists (select 1 from public.organizations where id = v_org) then
    select id into v_org from public.organizations where is_active order by created_at limit 1;
  end if;

  insert into public.users (id, email, full_name, role, account_status, activated_at, approved_at, organization_id)
  values (new.id, new.email,
          coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
          case when v_first then 'boss'::public.app_role else 'employee'::public.app_role end,
          case when v_first then 'active' else 'invited' end,
          case when v_first then now() end,
          case when v_first then now() end,
          v_org);
  insert into public.employee_details (user_id) values (new.id);
  return new;
end $$;

-- Update my_context() to include organization info
create or replace function public.my_context()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
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
    'organization', (select jsonb_build_object('id', o.id, 'name', o.name) from public.organizations o where o.id = u.organization_id),
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
end $function$;

-- Update dashboard_stats with optional organization filtering
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
          where (v_target_org is null or d.organization_id is null or d.organization_id = v_target_org)
          group by d.name) x));
  end if;
  return result;
end $$;
grant execute on function public.dashboard_stats(uuid) to authenticated;

-- Update onboarding_options
create or replace function public.onboarding_options() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u public.users;
begin
  u := app.me_row();
  if u.id is null or u.account_status not in ('key_verified', 'approver_pending') then raise exception 'Not available' using errcode = '42501'; end if;
  return jsonb_build_object(
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
                             from public.departments d where d.organization_id is null or d.organization_id = u.organization_id), '[]'::jsonb),
    'approvers', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'full_name', x.full_name, 'role', x.role, 'job_title', x.job_title,
                                                               'department', (select d.name from public.departments d where d.id = x.department_id))
                                             order by case x.role when 'boss' then 0 when 'hr' then 1 else 2 end, x.full_name)
                           from public.users x where x.is_active and x.account_status = 'active' and x.role in ('boss', 'hr', 'manager')
                           and (x.role = 'boss' or x.organization_id = u.organization_id)), '[]'::jsonb),
    'organization', (select jsonb_build_object('id', o.id, 'name', o.name) from public.organizations o where o.id = u.organization_id),
    'organizations', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) order by o.name) from public.organizations o where o.is_active), '[]'::jsonb));
end $$;
