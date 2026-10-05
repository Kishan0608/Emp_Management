-- =====================================================================
-- 022 SCHEMA CONSOLIDATION & PURGE
-- 1. Merged users + employee_details + activation_keys + verification_codes into public.users
-- 2. Merged task_events into public.tasks (events jsonb column)
-- 3. Merged feedback_replies into public.feedback_items (replies jsonb column)
-- 4. Purged unused tables: complaints, complaint_counts, complaint_quota,
--    disciplinary_cases, case_documents, committee_members, confidential_reports
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EXTEND public.users WITH EMPLOYEE DETAILS AND AUTH/VERIFICATION
-- ---------------------------------------------------------------------
alter table public.users
  add column if not exists phone text,
  add column if not exists personal_email text,
  add column if not exists address text,
  add column if not exists salary_monthly numeric(12,2),
  add column if not exists attendance_pct numeric(5,2),
  add column if not exists performance_rating numeric(3,1) check (performance_rating between 0 and 5),
  add column if not exists joined_on date,
  add column if not exists activation_key_hash text,
  add column if not exists activation_key_expires_at timestamptz,
  add column if not exists otp_code_hash text,
  add column if not exists otp_purpose text,
  add column if not exists otp_sent_to text,
  add column if not exists otp_expires_at timestamptz,
  add column if not exists otp_attempts int not null default 0;

-- Copy any existing employee_details data into users
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'employee_details') then
    update public.users u
    set
      phone              = coalesce(u.phone, d.phone),
      personal_email     = coalesce(u.personal_email, d.personal_email),
      address            = coalesce(u.address, d.address),
      salary_monthly     = coalesce(u.salary_monthly, d.salary_monthly),
      attendance_pct     = coalesce(u.attendance_pct, d.attendance_pct),
      performance_rating = coalesce(u.performance_rating, d.performance_rating),
      joined_on          = coalesce(u.joined_on, d.joined_on)
    from public.employee_details d
    where d.user_id = u.id;
  end if;
end $$;

-- Copy any existing activation_keys data into users
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'activation_keys') then
    update public.users u
    set
      activation_key_hash       = coalesce(u.activation_key_hash, k.key_hash),
      activation_key_expires_at = coalesce(u.activation_key_expires_at, k.expires_at)
    from public.activation_keys k
    where k.user_id = u.id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. EXTEND public.tasks WITH EMBEDDED events JSONB
-- ---------------------------------------------------------------------
alter table public.tasks
  add column if not exists events jsonb not null default '[]'::jsonb;

-- Migrate existing task_events into tasks.events
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'task_events') then
    update public.tasks t
    set events = coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'task_id', e.task_id,
            'actor_id', e.actor_id,
            'from_status', e.from_status,
            'to_status', e.to_status,
            'note', e.note,
            'proof_url', e.proof_url,
            'created_at', e.created_at,
            'actor', jsonb_build_object('full_name', (select u.full_name from public.users u where u.id = e.actor_id))
          ) order by e.created_at asc
        )
        from public.task_events e
        where e.task_id = t.id
      ),
      '[]'::jsonb
    );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. EXTEND public.feedback_items WITH EMBEDDED replies JSONB
-- ---------------------------------------------------------------------
alter table public.feedback_items
  add column if not exists replies jsonb not null default '[]'::jsonb;

-- Migrate existing feedback_replies into feedback_items.replies
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'feedback_replies') then
    update public.feedback_items f
    set replies = coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'feedback_id', r.feedback_id,
            'responder_id', r.responder_id,
            'body', r.body,
            'created_at', r.created_at,
            'responder', jsonb_build_object(
              'full_name', (select u.full_name from public.users u where u.id = r.responder_id),
              'role', (select u.role from public.users u where u.id = r.responder_id)
            )
          ) order by r.created_at asc
        )
        from public.feedback_replies r
        where r.feedback_id = f.id
      ),
      '[]'::jsonb
    );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. DROP MERGED AND UNWANTED TABLES SAFELY
-- ---------------------------------------------------------------------
drop table if exists public.employee_details cascade;
drop table if exists public.activation_keys cascade;
drop table if exists public.verification_codes cascade;
drop table if exists public.task_events cascade;
drop table if exists public.feedback_replies cascade;
drop table if exists public.complaints cascade;
drop table if exists public.complaint_counts cascade;
drop table if exists public.complaint_quota cascade;
drop table if exists public.disciplinary_cases cascade;
drop table if exists public.case_documents cascade;
drop table if exists public.committee_members cascade;
drop table if exists public.confidential_reports cascade;

-- ---------------------------------------------------------------------
-- 5. UPDATE CORE FUNCTIONS & RPCS TO USE CONSOLIDATED TABLES
-- ---------------------------------------------------------------------

-- New auth user trigger: insert directly into public.users only
create or replace function app.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_first boolean;
begin
  select not exists (select 1 from public.users) into v_first;
  if not v_first and coalesce(new.raw_app_meta_data ->> 'invited', 'false') <> 'true' then
    raise exception 'Sign-up is invite-only. Ask your administrator for an invitation.';
  end if;
  insert into public.users (id, email, full_name, role, account_status, activated_at, approved_at)
  values (new.id, new.email,
          coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
          case when v_first then 'boss'::public.app_role else 'employee'::public.app_role end,
          case when v_first then 'active' else 'invited' end,
          case when v_first then now() end,
          case when v_first then now() end);
  return new;
end $$;

-- Task status changer: appends event JSON directly into tasks.events
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
  v_new_event jsonb;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
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
  end if;

  select full_name into v_name from public.users where id = me;

  v_new_event := jsonb_build_object(
    'id', extensions.gen_random_uuid(),
    'task_id', p_task,
    'actor_id', me,
    'from_status', t.status,
    'to_status', p_to,
    'note', v_note,
    'proof_url', v_proof,
    'created_at', now(),
    'actor', jsonb_build_object('full_name', coalesce(v_name, 'System'))
  );

  update public.tasks set
    status       = p_to,
    submitted_at = case when p_to = 'closed' then coalesce(submitted_at, now()) else submitted_at end,
    approved_at  = case when p_to = 'closed' then now() else approved_at end,
    updated_at   = now(),
    events       = coalesce(events, '[]'::jsonb) || jsonb_build_array(v_new_event)
  where id = p_task;

  if not t.is_personal then
    if t.created_by is distinct from me then
      perform app.notify(t.created_by,
        case when p_to = 'accepted' then 'task_accepted' else 'task_done' end,
        case when p_to = 'accepted' then 'Task accepted' else 'Task done' end,
        v_name || case when p_to = 'accepted' then ' accepted: ' else ' finished: ' end || t.title,
        'tasks', p_task);
    end if;
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

-- Feedback reply: appends reply JSON directly into feedback_items.replies
create or replace function public.reply_feedback(p_feedback uuid, p_body text, p_publish boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  f public.feedback_items;
  u public.users;
  me uuid := auth.uid();
  v_new_reply jsonb;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into f from public.feedback_items where id = p_feedback;
  if not found then raise exception 'Feedback not found'; end if;
  select * into u from public.users where id = me;

  v_new_reply := jsonb_build_object(
    'id', extensions.gen_random_uuid(),
    'feedback_id', p_feedback,
    'responder_id', me,
    'body', trim(p_body),
    'created_at', now(),
    'responder', jsonb_build_object('full_name', u.full_name, 'role', u.role)
  );

  update public.feedback_items set
    status       = case when status = 'open' then 'answered' else status end,
    answered_at  = coalesce(answered_at, now()),
    is_published = case when p_publish and (app.is_boss() or app.is_hr()) then true else is_published end,
    updated_at   = now(),
    replies      = coalesce(replies, '[]'::jsonb) || jsonb_build_array(v_new_reply)
  where id = p_feedback;

  if f.author_id is not null and f.author_id <> me then
    perform app.notify(f.author_id, 'feedback_reply', 'New reply on your ' || f.type,
      left(trim(p_body), 120), 'feedback_items', p_feedback);
  end if;
end $$;

-- Set employee details: updates public.users directly
create or replace function public.admin_set_employee_details(
  p_user_id     uuid,
  p_phone       text default null,
  p_personal_email text default null,
  p_address     text default null,
  p_salary      numeric default null,
  p_attendance  numeric default null,
  p_performance numeric default null,
  p_joined_on   date default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (app.is_boss() or app.is_hr()) then
    raise exception 'Only the Boss or HR can manage employee details' using errcode = '42501';
  end if;

  update public.users set
    phone              = p_phone,
    personal_email     = p_personal_email,
    address            = p_address,
    salary_monthly     = case when app.is_boss() then p_salary else salary_monthly end,
    attendance_pct     = p_attendance,
    performance_rating = p_performance,
    joined_on          = p_joined_on,
    updated_at         = now()
  where id = p_user_id;

  perform app.audit('employee_details.update', 'users', p_user_id);
end $$;

-- Self-service update contact details: updates public.users directly
create or replace function public.update_my_contact_details(
  p_phone          text default null,
  p_personal_email text default null,
  p_address        text default null,
  p_joined_on      date default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;

  update public.users set
    phone          = p_phone,
    personal_email = p_personal_email,
    address        = p_address,
    joined_on      = coalesce(p_joined_on, joined_on),
    updated_at     = now()
  where id = me;
end $$;

-- Activation key generation: writes key hash and expiry directly into public.users
create or replace function app.new_activation_key(p_user uuid, p_by uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(8);
  k text := '';
  i int;
begin
  for i in 0..7 loop
    k := k || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  k := 'SKFL-' || substr(k, 1, 4) || '-' || substr(k, 5, 4);

  update public.users set
    activation_key_hash       = encode(extensions.digest(upper(regexp_replace(k, '\s', '', 'g')), 'sha256'), 'hex'),
    activation_key_expires_at = now() + interval '7 days'
  where id = p_user;

  return k;
end $$;

-- Issue OTP verification code: stores directly on public.users
create or replace function public.issue_code_internal(p_user uuid, p_purpose text, p_sent_to text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  b bytea := extensions.gen_random_bytes(3);
begin
  v_code := lpad(((get_byte(b, 0) * 65536 + get_byte(b, 1) * 256 + get_byte(b, 2)) % 1000000)::text, 6, '0');

  update public.users set
    otp_code_hash   = encode(extensions.digest(p_user::text || ':' || coalesce(v_code, ''), 'sha256'), 'hex'),
    otp_purpose     = p_purpose,
    otp_sent_to     = p_sent_to,
    otp_expires_at  = now() + interval '10 minutes',
    otp_attempts    = 0
  where id = p_user;

  return v_code;
end $$;

-- Verify OTP code: verifies directly on public.users
create or replace function app.check_code(p_user uuid, p_purpose text, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare u public.users;
begin
  select * into u from public.users where id = p_user for update;
  if not found or u.otp_code_hash is null then raise exception 'No code was sent. Tap "Resend code".'; end if;
  if u.otp_purpose is distinct from p_purpose then raise exception 'Invalid verification code context.'; end if;
  if u.otp_expires_at < now() then raise exception 'This code has expired. Tap "Resend code".'; end if;
  if u.otp_attempts >= 5 then raise exception 'Too many wrong attempts. Tap "Resend code" for a new one.'; end if;

  if u.otp_code_hash <> encode(extensions.digest(p_user::text || ':' || coalesce(trim(p_code), ''), 'sha256'), 'hex') then
    update public.users set otp_attempts = otp_attempts + 1 where id = p_user;
    raise exception 'That code is not correct (% tries left)', 4 - u.otp_attempts;
  end if;

  update public.users set
    otp_code_hash  = null,
    otp_purpose    = null,
    otp_sent_to    = null,
    otp_expires_at = null,
    otp_attempts   = 0
  where id = p_user;
end $$;

-- Get employee profile: reads directly from public.users
create or replace function public.get_employee_profile(p_target uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u public.users;
  me uuid := auth.uid();
  is_self boolean := p_target = me;
  is_boss boolean := app.is_boss();
  can_mgr boolean := app.manages(p_target);
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into u from public.users where id = p_target;
  if not found then raise exception 'Person not found'; end if;

  return jsonb_build_object(
    'user', jsonb_build_object(
      'id', u.id, 'full_name', u.full_name, 'email', u.email, 'role', u.role,
      'department_id', u.department_id, 'manager_id', u.manager_id, 'job_title', u.job_title,
      'is_active', u.is_active, 'is_case_handler', u.is_case_handler,
      'must_change_password', u.must_change_password, 'created_at', u.created_at,
      'phone', case when is_self or is_boss or can_mgr or app.can_see_field(p_target, 'contact') then u.phone end,
      'personal_email', case when is_self or is_boss or can_mgr or app.can_see_field(p_target, 'contact') then u.personal_email end,
      'address', case when is_self or is_boss or can_mgr or app.can_see_field(p_target, 'contact') then u.address end,
      'joined_on', case when is_self or is_boss or can_mgr or app.can_see_field(p_target, 'contact') then u.joined_on end,
      'salary_monthly', case when is_self or is_boss or app.can_see_field(p_target, 'salary') then u.salary_monthly end,
      'attendance_pct', case when is_self or is_boss or can_mgr or app.can_see_field(p_target, 'attendance') then u.attendance_pct end,
      'performance_rating', case when is_self or is_boss or can_mgr or app.can_see_field(p_target, 'performance') then u.performance_rating end
    ),
    'department', (select d.name from public.departments d where d.id = u.department_id),
    'manager',    (select m.full_name from public.users m where m.id = u.manager_id)
  );
end $$;

-- Team member report: reads details directly from public.users
create or replace function public.team_member_report(p_target uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u public.users;
  me uuid := auth.uid();
  result jsonb;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not (app.manages(p_target) or app.is_boss() or app.is_hr()) then
    raise exception 'You can only view reports for people in your team' using errcode = '42501';
  end if;
  select * into u from public.users where id = p_target;
  if not found then raise exception 'Person not found'; end if;

  result := jsonb_build_object(
    'person', jsonb_build_object(
      'id', u.id, 'full_name', u.full_name, 'email', u.email, 'role', u.role, 'job_title', u.job_title,
      'department', (select x.name from public.departments x where x.id = u.department_id),
      'manager', (select m.full_name from public.users m where m.id = u.manager_id),
      'is_active', u.is_active, 'member_since', coalesce(u.activated_at, u.created_at),
      'joined_on', case when app.can_see_field(p_target, 'contact') then u.joined_on end),
    'attendance_pct', case when app.can_see_field(p_target, 'attendance') then u.attendance_pct end,
    'performance_rating', case when app.can_see_field(p_target, 'performance') then u.performance_rating end);

  -- Task metrics
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
        'reworked', count(*) filter (where jsonb_path_exists(t.events, '$[*] ? (@.to_status == "returned")')),
        'avg_days_to_complete', round((avg(extract(epoch from (t.approved_at - t.created_at)) / 86400)
                                   filter (where t.approved_at is not null))::numeric, 1)))
    from public.tasks t where t.assignee_id = p_target and not t.is_personal);

  return result;
end $$;

-- Get task assignees: reads phone directly from public.users
create or replace function public.get_task_assignees()
returns table (
  id uuid,
  full_name text,
  email text,
  role public.app_role,
  job_title text,
  department_id uuid,
  department text,
  manager_id uuid,
  phone text,
  is_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_uid uuid := auth.uid();
begin
  if not app.is_active_user() then
    return;
  end if;

  select u.role into v_role from public.users u where u.id = v_uid;

  if v_role = 'employee' then
    return;
  end if;

  return query
  select
    u.id,
    u.full_name,
    u.email,
    u.role,
    u.job_title,
    u.department_id,
    d.name as department,
    u.manager_id,
    u.phone,
    u.is_active
  from public.users u
  left join public.departments d on d.id = u.department_id
  where u.is_active = true
    and (
      v_role = 'boss'
      or (v_role = 'hr' and u.role in ('employee', 'hr'))
      or (v_role = 'manager' and u.manager_id = v_uid)
    )
  order by u.full_name asc;
end;
$$;
