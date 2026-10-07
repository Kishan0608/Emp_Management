-- =====================================================================
-- 049 PAGED LISTS: tasks and feedback, 20 at a time from the server
--
-- The apps used to download up to 200 (app) / 1000 (admin) rows and filter,
-- search, sort and count them on the phone. These functions do that in the
-- database and return one page: { total, rows, counts }.
-- They are SECURITY INVOKER: row-level security still decides what the
-- signed-in person may see, exactly as the old direct queries did.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tasks
--   p_scope   mine | assigned | review | team | all (all = every task I may
--             see) | work (all, but no personal to-dos; the admin panel)
--   p_status  all | active (= open) | done | overdue | blocked | review
--   p_sort    smart  (not done first: overdue, due date, priority, latest)
--             updated (latest change first)
--   counts    for the scope + company only (not status / priority / search)
-- ---------------------------------------------------------------------
create or replace function public.tasks_page(
  p_scope    text default 'all',
  p_status   text default 'all',
  p_priority text default null,
  p_search   text default null,
  p_org      uuid default null,
  p_sort     text default 'smart',
  p_offset   int  default 0,
  p_limit    int  default 20
) returns jsonb
language plpgsql stable set search_path to '' as $function$
declare
  me uuid := auth.uid();
  -- today in the company time zone (app.local_date() is not callable by signed-in users)
  v_today date := (now() at time zone coalesce((select s.attendance_timezone from public.app_settings s where s.id = 1), 'Asia/Kolkata'))::date;
  v_term text := nullif(trim(coalesce(p_search, '')), '');
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  result jsonb;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;

  with base as (
    select t.*,
           a.full_name as a_name, a.organization_id as a_org, a.department_id as a_dept,
           c.full_name as c_name, r.full_name as r_name,
           (t.status in ('approved', 'closed')) as is_done,
           (t.status not in ('approved', 'closed') and t.due_date < v_today) as is_overdue
    from public.tasks t
    left join public.users a on a.id = t.assignee_id
    left join public.users c on c.id = t.created_by
    left join public.users r on r.id = t.reviewer_id
    where case p_scope
            when 'mine'     then t.assignee_id = me
            when 'assigned' then t.created_by = me and t.assignee_id <> me
            when 'review'   then t.reviewer_id = me and t.status = 'submitted' and t.assignee_id <> me
            when 'team'     then t.assignee_id <> me and not t.is_personal
            when 'work'     then not t.is_personal
            else true
          end
      and (p_org is null or a.organization_id is null or a.organization_id = p_org)
  ),
  filtered as (
    select * from base b
    where case coalesce(p_status, 'all')
            when 'active'  then not b.is_done
            when 'open'    then not b.is_done
            when 'done'    then b.is_done
            when 'overdue' then b.is_overdue
            when 'blocked' then b.status = 'blocked'
            when 'review'  then b.status = 'submitted'
            else true
          end
      and (p_priority is null or b.priority::text = p_priority)
      and (v_term is null
           or b.title ilike '%' || v_term || '%'
           or coalesce(b.description, '') ilike '%' || v_term || '%'
           or coalesce(b.a_name, '') ilike '%' || v_term || '%'
           or coalesce(b.c_name, '') ilike '%' || v_term || '%')
  ),
  page as (
    select f.* from filtered f
    order by
      case when p_sort = 'updated' then f.updated_at end desc nulls last,
      f.is_done,
      case when f.is_done then coalesce(f.approved_at, f.updated_at) end desc nulls last,
      f.is_overdue desc,
      f.due_date asc nulls last,
      case f.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
      f.updated_at desc
    offset v_offset limit v_limit
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((
      select jsonb_agg(
               (to_jsonb(p) - 'a_name' - 'a_org' - 'a_dept' - 'c_name' - 'r_name' - 'is_done' - 'is_overdue')
               || jsonb_build_object(
                    'assignee', case when p.assignee_id is null then null
                                     else jsonb_build_object('full_name', p.a_name, 'organization_id', p.a_org, 'department_id', p.a_dept) end,
                    'creator',  case when p.created_by is null then null else jsonb_build_object('full_name', p.c_name) end,
                    'reviewer', case when p.reviewer_id is null then null else jsonb_build_object('full_name', p.r_name) end)
               order by
                 case when p_sort = 'updated' then p.updated_at end desc nulls last,
                 p.is_done,
                 case when p.is_done then coalesce(p.approved_at, p.updated_at) end desc nulls last,
                 p.is_overdue desc,
                 p.due_date asc nulls last,
                 case p.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
                 p.updated_at desc)
      from page p), '[]'::jsonb),
    'counts', (select jsonb_build_object(
        'all',     count(*),
        'open',    count(*) filter (where not b.is_done),
        'done',    count(*) filter (where b.is_done),
        'overdue', count(*) filter (where b.is_overdue),
        'blocked', count(*) filter (where b.status = 'blocked'),
        'review',  count(*) filter (where b.status = 'submitted'),
        'done_30d',    count(*) filter (where b.is_done and b.approved_at > now() - interval '30 days'),
        'on_time_30d', count(*) filter (where b.is_done and b.approved_at > now() - interval '30 days'
                                          and (b.due_date is null or b.approved_at::date <= b.due_date)))
      from base b)
  ) into result;
  return result;
end $function$;
grant execute on function public.tasks_page(text, text, text, text, uuid, text, int, int) to authenticated;
revoke execute on function public.tasks_page(text, text, text, text, uuid, text, int, int) from public, anon;

-- ---------------------------------------------------------------------
-- Feedback
--   p_scope     inbox | mine | blockers | all
--   p_view      all | needs (open or acknowledged) | open | acknowledged | answered | resolved
--   p_category  app filter chips: all | leave | question | feedback | blocker
--   counts      for the scope + company only
-- ---------------------------------------------------------------------
create or replace function public.feedback_page(
  p_scope    text default 'all',
  p_view     text default 'all',
  p_category text default 'all',
  p_type     text default null,
  p_audience text default null,
  p_search   text default null,
  p_org      uuid default null,
  p_staff    boolean default false,
  p_offset   int  default 0,
  p_limit    int  default 20
) returns jsonb
language plpgsql stable set search_path to '' as $function$
declare
  me uuid := auth.uid();
  v_term text := nullif(trim(coalesce(p_search, '')), '');
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  result jsonb;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;

  with base as (
    select f.*, u.full_name as au_name, u.organization_id as au_org
    from public.feedback_items f
    left join public.users u on u.id = f.author_id
    where case p_scope
            when 'mine'     then f.author_id = me
            when 'blockers' then f.type = 'blocker' and f.status in ('open', 'acknowledged')
            when 'inbox'    then case when p_staff then (f.author_id is null or f.author_id <> me) else f.author_id = me end
            else true
          end
      and (p_org is null or u.organization_id is null or u.organization_id = p_org)
  ),
  filtered as (
    select * from base b
    where case coalesce(p_view, 'all')
            when 'needs' then b.status in ('open', 'acknowledged')
            when 'all'   then true
            else b.status::text = p_view
          end
      and case coalesce(p_category, 'all')
            when 'leave'            then b.title ilike '%leave%'
            when 'question'         then b.type = 'question' or b.title ilike '[general%'
            when 'general_question' then b.type = 'question' or b.title ilike '[general%'
            when 'feedback'         then b.type = 'feedback' and b.title not ilike '%leave%'
            when 'blocker'          then b.type = 'blocker'
            when 'blockers'         then b.type = 'blocker'
            else true
          end
      and (p_type is null or b.type::text = p_type)
      and (p_audience is null or b.audience::text = p_audience)
      and (v_term is null
           or b.title ilike '%' || v_term || '%'
           or b.body ilike '%' || v_term || '%'
           or (not b.is_anonymous and coalesce(b.au_name, '') ilike '%' || v_term || '%')
           or (b.is_anonymous and 'anonymous' ilike '%' || v_term || '%'))
  ),
  page as (
    select * from filtered order by created_at desc offset v_offset limit v_limit
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((
      select jsonb_agg((to_jsonb(p) - 'au_name' - 'au_org')
               || jsonb_build_object('author', case when p.author_id is null then null
                                                    else jsonb_build_object('full_name', p.au_name, 'organization_id', p.au_org) end)
               order by p.created_at desc)
      from page p), '[]'::jsonb),
    'counts', (select jsonb_build_object(
        'all',          count(*),
        'needs',        count(*) filter (where b.status in ('open', 'acknowledged')),
        'open',         count(*) filter (where b.status = 'open'),
        'acknowledged', count(*) filter (where b.status = 'acknowledged'),
        'answered',     count(*) filter (where b.status = 'answered'),
        'resolved',     count(*) filter (where b.status = 'resolved'),
        'blockers_open', count(*) filter (where b.type = 'blocker' and b.status in ('open', 'acknowledged')))
      from base b)
  ) into result;
  return result;
end $function$;
grant execute on function public.feedback_page(text, text, text, text, text, text, uuid, boolean, int, int) to authenticated;
revoke execute on function public.feedback_page(text, text, text, text, text, text, uuid, boolean, int, int) from public, anon;

-- Search speed for the paged lists
create index if not exists tasks_updated_idx on public.tasks (updated_at desc);
create index if not exists feedback_items_created_idx on public.feedback_items (created_at desc);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
