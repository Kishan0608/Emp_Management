-- =====================================================================
-- 050 DAILY WORK LOG
--
-- One log per person per day: what they worked on (text), hours (optional)
-- and attachments (photos / documents in the private 'work-logs' bucket).
-- REQUIRED on a working day (not weekly off, holiday or approved leave) when
-- the person has no open work task assigned; optional otherwise.
-- A reminder goes out once, 1 hour before office end, if a required log is
-- missing. The Boss and HR see everyone; a manager sees their own team.
-- The employee can edit their log until it is reviewed.
-- =====================================================================

create table if not exists public.work_logs (
  id           uuid primary key default extensions.gen_random_uuid(),
  user_id      uuid not null references public.users(id) on update cascade on delete cascade,
  work_date    date not null,
  summary      text not null check (char_length(summary) between 10 and 4000),
  hours        numeric(4, 1) check (hours is null or hours between 0 and 24),
  attachments  jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  reviewed_by  uuid references public.users(id) on update cascade on delete set null,
  reviewed_at  timestamptz,
  review_note  text check (review_note is null or char_length(review_note) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, work_date)
);
create index if not exists work_logs_day_idx on public.work_logs (work_date desc);
create index if not exists work_logs_reviewed_by_idx on public.work_logs (reviewed_by);
alter table public.work_logs enable row level security;
revoke all on public.work_logs from anon, authenticated;
grant select on public.work_logs to authenticated;
create policy work_logs_read on public.work_logs for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_boss()) or (select app.is_hr()) or app.leads(user_id));

-- ---------------------------------------------------------------------
-- Is a log required for this person on this day, and why?
-- ---------------------------------------------------------------------
create or replace function app.work_log_status(p_user uuid, p_date date)
 returns jsonb language sql stable security definer set search_path to '' as $function$
  with u as (select * from public.users where id = p_user),
       s as (select * from public.app_settings where id = 1),
       a as (select * from public.attendance_records where user_id = p_user and work_date = p_date)
  select jsonb_build_object(
    'weekly_off', extract(dow from p_date)::int = (select attendance_weekly_off_dow from s),
    'holiday', (select h.name from public.holidays h, u where h.holiday_date = p_date
                 and (h.organization_id is null or h.organization_id = u.organization_id) limit 1),
    'on_leave', coalesce((select status::text = 'leave' from a), false),
    'open_tasks', (select count(*) from public.tasks t
                    where t.assignee_id = p_user and not t.is_personal and t.status not in ('approved', 'closed')),
    'clocked_in', coalesce((select clock_in_at is not null from a), false))
$function$;

create or replace function app.work_log_required(p_status jsonb)
 returns boolean language sql immutable set search_path to '' as $function$
  select not (p_status ->> 'weekly_off')::boolean
     and p_status ->> 'holiday' is null
     and not (p_status ->> 'on_leave')::boolean
     and (p_status ->> 'open_tasks')::int = 0
$function$;

-- ---------------------------------------------------------------------
-- The employee: my day, and saving my log
-- ---------------------------------------------------------------------
create or replace function public.my_work_day(p_date date default null)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare v_date date := coalesce(p_date, app.local_date()); v_status jsonb; l public.work_logs;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  v_status := app.work_log_status(auth.uid(), v_date);
  select * into l from public.work_logs where user_id = auth.uid() and work_date = v_date;
  return v_status || jsonb_build_object(
    'work_date', v_date,
    'today', app.local_date(),
    'required', app.work_log_required(v_status),
    'log', case when l.id is null then null else to_jsonb(l) || jsonb_build_object(
             'reviewer', (select r.full_name from public.users r where r.id = l.reviewed_by)) end);
end $function$;

create or replace function public.submit_work_log(p_date date, p_summary text, p_hours numeric, p_attachments jsonb)
 returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_today date := app.local_date(); v_summary text := trim(coalesce(p_summary, '')); v_id uuid; l public.work_logs;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_date is null or p_date > v_today or p_date < v_today - 2 then
    raise exception 'You can add a work log for today or the last 2 days only';
  end if;
  if char_length(v_summary) < 10 then raise exception 'Describe your work in at least a few words (10+ characters)'; end if;
  if char_length(v_summary) > 4000 then raise exception 'The description is too long (4000 characters max)'; end if;
  if p_hours is not null and (p_hours < 0 or p_hours > 24) then raise exception 'Hours must be between 0 and 24'; end if;
  if p_attachments is null or jsonb_typeof(p_attachments) <> 'array' then raise exception 'Invalid attachments'; end if;
  if jsonb_array_length(p_attachments) > 10 then raise exception 'Up to 10 attachments'; end if;
  -- attachments must be the person's own uploads
  if exists (select 1 from jsonb_array_elements(p_attachments) e
              where coalesce(e ->> 'path', '') not like auth.uid()::text || '/%') then
    raise exception 'Invalid attachment';
  end if;

  select * into l from public.work_logs where user_id = auth.uid() and work_date = p_date;
  if l.reviewed_at is not null then raise exception 'This log was already reviewed and can''t be changed'; end if;

  insert into public.work_logs (user_id, work_date, summary, hours, attachments)
  values (auth.uid(), p_date, v_summary, p_hours, p_attachments)
  on conflict (user_id, work_date) do update set
    summary = excluded.summary, hours = excluded.hours, attachments = excluded.attachments, updated_at = now()
  returning id into v_id;
  perform app.audit(case when l.id is null then 'work_log.submit' else 'work_log.update' end, 'work_logs', v_id,
                    jsonb_build_object('date', p_date));
  return v_id;
end $function$;

-- ---------------------------------------------------------------------
-- Boss / HR / manager: everyone's day, and reviewing a log
-- ---------------------------------------------------------------------
create or replace function public.work_log_day(p_date date default null, p_org uuid default null)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare v_date date := coalesce(p_date, app.local_date());
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not (app.is_boss() or app.is_hr() or exists (select 1 from public.users r where r.manager_id = auth.uid())) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x.sort_key, x.full_name) from (
      select u.id as user_id, u.full_name, u.role, u.job_title, u.organization_id,
             (select d.name from public.departments d where d.id = u.department_id) as department,
             (select m.full_name from public.users m where m.id = u.manager_id) as manager,
             st as day,
             case when l.id is not null then 'submitted'
                  when (st ->> 'weekly_off')::boolean then 'weekly_off'
                  when st ->> 'holiday' is not null then 'holiday'
                  when (st ->> 'on_leave')::boolean then 'leave'
                  when (st ->> 'open_tasks')::int > 0 then 'not_required'
                  else 'missing' end as state,
             case when l.id is not null then 1
                  when (st ->> 'weekly_off')::boolean or st ->> 'holiday' is not null or (st ->> 'on_leave')::boolean then 3
                  when (st ->> 'open_tasks')::int > 0 then 2
                  else 0 end as sort_key,
             case when l.id is null then null else to_jsonb(l) || jsonb_build_object(
               'reviewer', (select r.full_name from public.users r where r.id = l.reviewed_by)) end as log
      from public.users u
      cross join lateral (select app.work_log_status(u.id, v_date) as st) s
      left join public.work_logs l on l.user_id = u.id and l.work_date = v_date
      where u.is_active and u.account_status = 'active' and u.role <> 'boss'
        and (p_org is null or u.organization_id is null or u.organization_id = p_org)
        and (app.is_boss() or app.is_hr() or app.leads(u.id))
    ) x), '[]'::jsonb);
end $function$;

create or replace function public.review_work_log(p_id uuid, p_note text default null)
 returns void language plpgsql security definer set search_path to '' as $function$
declare l public.work_logs; me public.users;
begin
  select * into l from public.work_logs where id = p_id for update;
  if not found then raise exception 'Work log not found'; end if;
  if not (app.is_boss() or app.is_hr() or app.leads(l.user_id)) then raise exception 'Not permitted' using errcode = '42501'; end if;
  if l.user_id = auth.uid() then raise exception 'You cannot review your own log'; end if;
  select * into me from public.users where id = auth.uid();
  update public.work_logs set reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
  perform app.notify(l.user_id, 'work_log_reviewed', 'Your work log was reviewed',
    me.full_name || case when nullif(trim(coalesce(p_note, '')), '') is null then ' reviewed your log for ' || to_char(l.work_date, 'DD Mon') || '.'
                         else ': "' || trim(p_note) || '"' end,
    'work_logs', l.id);
  perform app.audit('work_log.review', 'work_logs', l.id, jsonb_build_object('note', p_note));
end $function$;

grant execute on function public.my_work_day(date) to authenticated;
grant execute on function public.submit_work_log(date, text, numeric, jsonb) to authenticated;
grant execute on function public.work_log_day(date, uuid) to authenticated;
grant execute on function public.review_work_log(uuid, text) to authenticated;
revoke execute on function public.my_work_day(date) from public, anon;
revoke execute on function public.submit_work_log(date, text, numeric, jsonb) from public, anon;
revoke execute on function public.work_log_day(date, uuid) from public, anon;
revoke execute on function public.review_work_log(uuid, text) from public, anon;
revoke execute on function app.work_log_status(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Reminder: once, 1 hour before office end, if a required log is missing
-- ---------------------------------------------------------------------
create or replace function app.work_log_reminder_tick()
 returns void language plpgsql security definer set search_path to '' as $function$
declare v_today date := app.local_date(); v_now time := (now() at time zone app.attendance_tz())::time; s public.app_settings; u record;
begin
  select * into s from public.app_settings where id = 1;
  if v_now < s.attendance_work_end - interval '1 hour' or v_now >= s.attendance_work_end then return; end if;
  for u in
    select x.id from public.users x
    where x.is_active and x.account_status = 'active' and x.role <> 'boss'
      and not exists (select 1 from public.work_logs l where l.user_id = x.id and l.work_date = v_today)
      and not exists (select 1 from public.notifications n where n.user_id = x.id and n.kind = 'work_log_reminder'
                        and n.created_at >= (v_today::timestamp at time zone app.attendance_tz()))
      and app.work_log_required(app.work_log_status(x.id, v_today))
  loop
    perform app.notify(u.id, 'work_log_reminder', 'Add today''s work log',
      'You have no open tasks today. Write what you worked on before the day ends.', 'work_logs', null);
  end loop;
end $function$;
revoke execute on function app.work_log_reminder_tick() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Attachments: private bucket, files under <user id>/<date>/...
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('work-logs', 'work-logs', false, 10485760)
on conflict (id) do nothing;

create policy "work logs: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'work-logs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "work logs: remove own" on storage.objects for delete to authenticated
  using (bucket_id = 'work-logs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "work logs: read own, boss, hr, manager" on storage.objects for select to authenticated
  using (bucket_id = 'work-logs' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select app.is_boss()) or (select app.is_hr())
    or app.leads(((storage.foldername(name))[1])::uuid)));

-- Reminder check every 15 minutes (it only sends in the last hour before office end)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'work-log-reminder') then perform cron.unschedule('work-log-reminder'); end if;
  perform cron.schedule('work-log-reminder', '*/15 * * * *', 'select app.work_log_reminder_tick()');
end $$;
