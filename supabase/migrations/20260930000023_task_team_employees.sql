-- =====================================================================
-- 023 TASKS BY PEOPLE: employees never lead a team in this view.
-- At the Boss's top level, list every employee who is not under an active
-- manager or HR (no manager, reports to the Boss, or reports to another
-- employee), so nobody is hidden.
-- =====================================================================

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
                           or (u.role = 'employee' and not exists (
                                 select 1 from public.users m
                                  where m.id = u.manager_id and m.is_active and m.role in ('manager','hr')))
                else u.manager_id = v_leader
              end
        group by u.id) x), '[]'::jsonb));
end $$;
revoke all on function public.task_team(uuid) from public, anon;
grant execute on function public.task_team(uuid) to authenticated;
