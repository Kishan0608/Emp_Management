-- =====================================================================
-- 022 TASKS BY PEOPLE: Boss -> managers & HR -> their team -> tasks
--
-- task_team(p_leader)
--   * Boss, no leader (or self): every manager and HR first, then anyone who
--     reports straight to the Boss or to nobody (so no one is left out).
--   * Any leader: the people who report to them.
--   Each person carries their own task counts (total / pending / done /
--   overdue) and, if they lead people, their team size and team pending.
--   Personal to-dos are never counted.
--
-- app.leads(x): x reports to me, or to someone who reports to me. Used so a
-- manager can open tasks two levels down (the task read policy now uses it).
-- =====================================================================

create or replace function app.leads(p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u
    where u.id = p_target
      and (u.manager_id = auth.uid()
           or exists (select 1 from public.users m where m.id = u.manager_id and m.manager_id = auth.uid()))
  )
$$;
revoke all on function app.leads(uuid) from public, anon;
grant execute on function app.leads(uuid) to authenticated;

drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated using (
  app.is_active_user() and (
    assignee_id = auth.uid()
    or (not is_personal and (
         created_by = auth.uid()
      or reviewer_id = auth.uid()
      or app.is_boss()
      or app.leads(assignee_id)
      or visibility = 'company'
      or (visibility = 'team' and app.same_department(assignee_id))
      or app.can_see_field(assignee_id, 'task_history')
    ))
  )
);

create or replace function public.task_team(p_leader uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_leader uuid := coalesce(p_leader, auth.uid());
  top boolean;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not (app.is_boss() or v_leader = me or app.leads(v_leader)) then
    raise exception 'You can only see tasks for your own team' using errcode = '42501';
  end if;
  top := app.is_boss() and v_leader = me;

  return jsonb_build_object(
    'is_top', top,
    'leader', (
      select jsonb_build_object('id', u.id, 'full_name', u.full_name, 'role', u.role, 'job_title', u.job_title,
        'total',   count(t.id),
        'pending', count(t.id) filter (where t.status not in ('approved','closed')),
        'done',    count(t.id) filter (where t.status in ('approved','closed')),
        'overdue', count(t.id) filter (where t.status not in ('approved','closed') and t.due_date < current_date))
      from public.users u
      left join public.tasks t on t.assignee_id = u.id and not t.is_personal
      where u.id = v_leader
      group by u.id),
    'members', coalesce((
      select jsonb_agg(x order by x.rank, x.full_name) from (
        select u.id, u.full_name, u.role, u.job_title,
               case u.role when 'manager' then 1 when 'hr' then 2 else 3 end as rank,
               count(t.id) as total,
               count(t.id) filter (where t.status not in ('approved','closed')) as pending,
               count(t.id) filter (where t.status in ('approved','closed')) as done,
               count(t.id) filter (where t.status not in ('approved','closed') and t.due_date < current_date) as overdue,
               (select count(*) from public.users r
                 where r.manager_id = u.id and r.id <> u.id and r.is_active and r.account_status = 'active') as team_size,
               (select count(*) from public.tasks tt join public.users r on r.id = tt.assignee_id
                 where r.manager_id = u.id and r.id <> u.id and not tt.is_personal
                   and tt.status not in ('approved','closed')) as team_pending
        from public.users u
        left join public.tasks t on t.assignee_id = u.id and not t.is_personal
        where u.is_active and u.account_status = 'active' and u.id <> me and u.id <> v_leader
          and case
                when top then u.role in ('manager','hr')
                           or (u.role = 'employee' and (u.manager_id is null or u.manager_id = me
                               or not exists (select 1 from public.users m where m.id = u.manager_id and m.is_active)))
                else u.manager_id = v_leader
              end
        group by u.id) x), '[]'::jsonb));
end $$;
revoke all on function public.task_team(uuid) from public, anon;
grant execute on function public.task_team(uuid) to authenticated;
