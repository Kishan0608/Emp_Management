-- =====================================================================
-- 034 SCHEMA SLIM-DOWN (no data is lost)
--
--  1. Remove the unused complaints / disciplinary module: 7 tables, their
--     functions, cron jobs and enum types. No screen uses them. The migration
--     STOPS if any of those tables still holds a row.
--  2. Merge activation_keys + verification_codes into one table, auth_codes
--     (purpose = 'activation' | 'email' | 'approver' | 'reset'). Rows are copied.
--     Kept out of public.users on purpose: users is readable by every employee.
--  3. Merge feedback_replies into feedback_items.replies (jsonb), the same way
--     task_questions keeps its replies. Rows are copied, in the shape the app
--     already reads: { id, responder_id, body, created_at, responder: { full_name, role } }.
--  4. Drop users.middle_name (unused; no user has one; the migration checks).
--  5. Drop departments.organization_id: departments are shared by every company.
--     The functions that still filtered on it are rewritten first.
-- Table count: 25 -> 16.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Safety checks: never drop a table or column that still holds data
-- ---------------------------------------------------------------------
do $$
declare t text; n bigint;
begin
  foreach t in array array['complaints','complaint_counts','complaint_quota','disciplinary_cases','case_documents','committee_members','confidential_reports'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then raise exception 'Stopped: public.% still has % row(s). Nothing was changed.', t, n; end if;
    end if;
  end loop;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'middle_name') then
    execute 'select count(*) from public.users where coalesce(middle_name, '''') <> ''''' into n;
    if n > 0 then raise exception 'Stopped: % user(s) have a middle name. Nothing was changed.', n; end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Complaints / disciplinary module
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'complaint-alerts') then perform cron.unschedule('complaint-alerts'); end if;
  if exists (select 1 from cron.job where jobname = 'daily-flag-digest') then perform cron.unschedule('daily-flag-digest'); end if;
end $$;

-- functions that stay, rewritten without the module
create or replace function app.purge_expired() returns void
language plpgsql security definer set search_path = '' as $$
declare s public.app_settings;
begin
  select * into s from public.app_settings where id = 1;
  delete from public.notifications where is_read and created_at < now() - interval '180 days';
  delete from public.audit_logs where created_at < now() - make_interval(days => s.retention_audit_days);
end $$;

create or replace function public.get_employee_profile(p_target uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
    'organization_id', u.organization_id,
    'organization', (select o.name from public.organizations o where o.id = u.organization_id),
    'is_case_handler', u.is_case_handler,
    'department', (select x.name from public.departments x where x.id = u.department_id),
    'manager', (select m.full_name from public.users m where m.id = u.manager_id));

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
end;
$function$;

-- functions that only served the module
drop function if exists public.dashboard_stats();
drop function if exists public.submit_complaint_internal(uuid, uuid, public.complaint_category, text);
drop function if exists public.my_complaint_quota();
drop function if exists public.complaint_target_context(uuid);
drop function if exists public.hr_list_complaints(public.triage_status);
drop function if exists public.hr_triage_complaint(uuid, public.triage_status, text);
drop function if exists public.complaint_overview();
drop function if exists public.open_case(uuid, text);
drop function if exists public.advance_case(uuid, text, text, public.penalty_type);
drop function if exists public.submit_case_reply(uuid, text);
drop function if exists public.add_case_note(uuid, text, text);
drop function if exists public.terminate_employee(uuid, text);
drop function if exists public.admin_set_committee(uuid, boolean);
drop function if exists public.committee_list_reports();
drop function if exists public.committee_update_report(uuid, text);
drop function if exists public.my_confidential_reports();
drop function if exists public.submit_confidential_report(uuid, date, text);
drop function if exists app.complaint_alerts();
drop function if exists app.daily_flag_digest();
drop function if exists app.recompute_complaint_counts(uuid);

drop table if exists public.confidential_reports;
drop table if exists public.case_documents;
drop table if exists public.disciplinary_cases;
drop table if exists public.complaint_counts;
drop table if exists public.complaint_quota;
drop table if exists public.complaints;
drop table if exists public.committee_members;

-- trigger functions / helpers whose tables are gone
drop function if exists app.check_reply_window();
drop function if exists app.complaints_after_change();
drop function if exists app.is_committee();

drop type if exists public.complaint_category;
drop type if exists public.triage_status;
drop type if exists public.penalty_type;
drop type if exists public.case_stage;

-- ---------------------------------------------------------------------
-- 2. auth_codes  (activation_keys + verification_codes)
-- ---------------------------------------------------------------------
create table if not exists public.auth_codes (
  user_id    uuid not null references public.users(id) on update cascade on delete cascade,
  purpose    text not null check (purpose in ('activation', 'email', 'approver', 'reset')),
  code_hash  text not null,
  sent_to    text,
  issued_by  uuid references public.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),   -- when the key/code was issued or sent
  expires_at timestamptz not null,
  attempts   int not null default 0,
  used_at    timestamptz,
  primary key (user_id, purpose)
);
alter table public.auth_codes enable row level security;   -- no policies: functions only
revoke all on public.auth_codes from anon, authenticated;

insert into public.auth_codes (user_id, purpose, code_hash, sent_to, issued_by, created_at, expires_at, attempts, used_at)
select k.user_id, 'activation', k.key_hash, null, k.issued_by, k.issued_at, k.expires_at, k.failed_attempts, k.used_at
from public.activation_keys k
on conflict (user_id, purpose) do nothing;

insert into public.auth_codes (user_id, purpose, code_hash, sent_to, created_at, expires_at, attempts)
select v.user_id, v.purpose, v.code_hash, v.sent_to, v.created_at, v.expires_at, v.attempts
from public.verification_codes v
on conflict (user_id, purpose) do nothing;

do $$
declare a bigint; v bigint; c bigint;
begin
  select count(*) into a from public.activation_keys;
  select count(*) into v from public.verification_codes;
  select count(*) into c from public.auth_codes;
  if c < a + v then raise exception 'Stopped: only % of % sign-up codes were copied', c, a + v; end if;
end $$;

create or replace function app.new_activation_key(p_user uuid, p_by uuid)
 returns text language plpgsql security definer set search_path to '' as $function$
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
  insert into public.auth_codes (user_id, purpose, code_hash, issued_by, created_at, expires_at, attempts, used_at)
  values (p_user, 'activation', app.hash_key(k), p_by, now(), now() + interval '7 days', 0, null)
  on conflict (user_id, purpose) do update set
    code_hash = excluded.code_hash, issued_by = excluded.issued_by, created_at = now(),
    expires_at = now() + interval '7 days', attempts = 0, used_at = null;
  return k;
end $function$;

create or replace function public.activation_check(p_email text, p_key text)
 returns uuid language plpgsql security definer set search_path to '' as $function$
declare u public.users; k public.auth_codes;
begin
  select * into u from public.users where lower(email) = lower(trim(p_email));
  if not found then raise exception 'Email or activation key is not correct'; end if;
  select * into k from public.auth_codes where user_id = u.id and purpose = 'activation' for update;
  if not found or k.used_at is not null then raise exception 'This activation key was already used or not issued. Ask your administrator for a new one.'; end if;
  if not u.is_active then raise exception 'This account is deactivated. Contact your administrator.'; end if;
  if k.expires_at < now() then raise exception 'This activation key has expired. Ask your administrator for a new one.'; end if;
  if k.attempts >= 5 then raise exception 'Too many wrong attempts. Ask your administrator for a new key.'; end if;
  if k.code_hash <> app.hash_key(p_key) then
    update public.auth_codes set attempts = attempts + 1 where user_id = u.id and purpose = 'activation';
    raise exception 'Email or activation key is not correct';
  end if;
  return u.id;
end $function$;

create or replace function public.activation_complete(p_user uuid)
 returns text language plpgsql security definer set search_path to '' as $function$
declare v_status text; v_name text;
begin
  update public.auth_codes set used_at = now() where user_id = p_user and purpose = 'activation';
  update public.users set
    account_status = case when account_status = 'active' then 'active' else 'awaiting_approval' end,
    activated_at = now(),
    must_change_password = false
  where id = p_user
  returning account_status, full_name into v_status, v_name;
  if v_status = 'awaiting_approval' then
    perform app.notify_role('boss', 'account_activated', 'Approval needed: ' || v_name, 'Approve this account in the admin panel.', 'users', p_user);
  end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id) values (p_user, 'activation.completed', 'users', p_user);
  return v_status;
end $function$;

create or replace function public.onboarding_verify_key(p_key text)
 returns void language plpgsql security definer set search_path to '' as $function$
declare u public.users; k public.auth_codes;
begin
  u := app.me_row();
  if u.id is null or u.account_status not in ('email_verified', 'invited') then raise exception 'Key verification is not pending'; end if;
  select * into k from public.auth_codes where user_id = u.id and purpose = 'activation' for update;
  if not found then raise exception 'Your administrator has not issued your key yet. Please ask them.'; end if;
  if k.used_at is not null then raise exception 'This key was already used. Ask your administrator for a new one.'; end if;
  if k.expires_at < now() then raise exception 'This key has expired. Ask your administrator for a new one.'; end if;
  if k.attempts >= 5 then raise exception 'Too many wrong attempts. Ask your administrator for a new key.'; end if;
  if k.code_hash <> app.hash_key(p_key) then
    update public.auth_codes set attempts = attempts + 1 where user_id = u.id and purpose = 'activation';
    raise exception 'That key is not correct';
  end if;
  update public.auth_codes set used_at = now() where user_id = u.id and purpose = 'activation';
  update public.users set account_status = 'key_verified', activated_at = now() where id = u.id;
  insert into public.audit_logs (actor_id, action, entity, entity_id) values (u.id, 'signup.key_verified', 'users', u.id);
end $function$;

create or replace function public.admin_approve_user(p_user uuid, p_approve boolean)
 returns void language plpgsql security definer set search_path to '' as $function$
declare u public.users;
begin
  if not app.is_boss() then raise exception 'Only the Boss can approve accounts' using errcode = '42501'; end if;
  select * into u from public.users where id = p_user for update;
  if not found then raise exception 'Person not found'; end if;
  if p_user = auth.uid() then raise exception 'You cannot approve your own account'; end if;
  if p_approve then
    update public.users set account_status = 'active', approved_at = now(), approved_by = auth.uid(), is_active = true where id = p_user;
    perform app.notify(p_user, 'account_approved', 'Your account is approved', 'Welcome to SKFL. You can now sign in.', 'users', p_user);
  else
    update public.users set account_status = 'invited', is_active = false where id = p_user;
    delete from public.auth_codes where user_id = p_user and purpose = 'activation';
  end if;
  perform app.audit(case when p_approve then 'account.approved' else 'account.rejected' end, 'users', p_user);
end $function$;

create or replace function public.admin_people()
 returns table(id uuid, full_name text, email text, role public.app_role, job_title text, department text, department_id uuid, manager text, manager_id uuid,
               is_active boolean, account_status text, created_at timestamp with time zone, activated_at timestamp with time zone,
               approved_at timestamp with time zone, key_issued_at timestamp with time zone, key_expires_at timestamp with time zone,
               key_used_at timestamp with time zone, key_failed_attempts integer)
 language plpgsql stable security definer set search_path to '' as $function$
begin
  if not app.is_boss() then raise exception 'Only the Boss can open the admin panel' using errcode = '42501'; end if;
  return query
  select u.id, u.full_name, u.email, u.role, u.job_title, d.name, u.department_id, m.full_name, u.manager_id,
         u.is_active, u.account_status, u.created_at,
         u.activated_at, u.approved_at, k.created_at, k.expires_at, k.used_at, k.attempts
  from public.users u
  left join public.departments d on d.id = u.department_id
  left join public.users m on m.id = u.manager_id
  left join public.auth_codes k on k.user_id = u.id and k.purpose = 'activation'
  order by case u.account_status when 'awaiting_approval' then 0 when 'invited' then 1 else 2 end, u.full_name;
end $function$;

create or replace function app.check_code(p_user uuid, p_purpose text, p_code text)
 returns void language plpgsql security definer set search_path to '' as $function$
declare c public.auth_codes;
begin
  select * into c from public.auth_codes where user_id = p_user and purpose = p_purpose for update;
  if not found then raise exception 'No code was sent. Tap "Resend code".'; end if;
  if c.expires_at < now() then raise exception 'This code has expired. Tap "Resend code".'; end if;
  if c.attempts >= 5 then raise exception 'Too many wrong attempts. Tap "Resend code" for a new one.'; end if;
  if c.code_hash <> app.code_hash(p_user, trim(p_code)) then
    update public.auth_codes set attempts = attempts + 1 where user_id = p_user and purpose = p_purpose;
    raise exception 'That code is not correct (% tries left)', 4 - c.attempts;
  end if;
  delete from public.auth_codes where user_id = p_user and purpose = p_purpose;
end $function$;

create or replace function public.issue_code_internal(p_user uuid, p_purpose text, p_sent_to text)
 returns text language plpgsql security definer set search_path to '' as $function$
declare v_code text; v_last timestamptz; b bytea := extensions.gen_random_bytes(3);
begin
  if p_purpose not in ('email', 'approver', 'reset') then raise exception 'Unknown code purpose'; end if;
  select created_at into v_last from public.auth_codes where user_id = p_user and purpose = p_purpose;
  if v_last is not null and v_last > now() - interval '60 seconds' then
    raise exception 'Please wait a minute before requesting another code';
  end if;
  v_code := lpad(((get_byte(b, 0) * 65536 + get_byte(b, 1) * 256 + get_byte(b, 2)) % 1000000)::text, 6, '0');
  insert into public.auth_codes (user_id, purpose, code_hash, sent_to, expires_at, attempts, created_at)
  values (p_user, p_purpose, app.code_hash(p_user, v_code), p_sent_to, now() + interval '10 minutes', 0, now())
  on conflict (user_id, purpose) do update set
    code_hash = excluded.code_hash, sent_to = excluded.sent_to, expires_at = excluded.expires_at, attempts = 0, created_at = now(), used_at = null;
  return v_code;
end $function$;

-- ---------------------------------------------------------------------
-- 4. users.middle_name   (onboarding_state also moves to auth_codes here)
-- ---------------------------------------------------------------------
create or replace function public.onboarding_state()
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare u public.users; v_google boolean; m public.users; v_code public.auth_codes;
begin
  select * into u from public.users where id = auth.uid();
  if not found then raise exception 'Not signed in' using errcode = '42501'; end if;
  select exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google') into v_google;
  if v_google and u.account_status in ('invited', 'email_pending')
     and not exists (select 1 from public.auth_codes k where k.user_id = u.id and k.purpose = 'activation') then
    update public.users set account_status = 'email_verified' where id = u.id returning * into u;
    perform app.notify_role('boss', 'signup_verified', 'New sign-up: ' || u.email, 'Email verified with Google. Generate their key in the admin panel.', 'users', u.id);
  end if;
  select * into m from public.users where id = u.manager_id;
  select * into v_code from public.auth_codes
   where user_id = u.id and purpose = case when u.account_status = 'approver_pending' then 'approver' else 'email' end;
  return jsonb_build_object(
    'status', u.account_status, 'is_active', u.is_active, 'email', u.email, 'google', v_google,
    'first_name', u.first_name, 'last_name', u.last_name,
    'approver_name', m.full_name, 'approver_role', m.role,
    'code_sent_to', v_code.sent_to, 'code_expires_at', v_code.expires_at);
end $function$;

drop function if exists public.onboarding_submit_profile(text, text, text, text, uuid, uuid, public.app_role);
create or replace function public.onboarding_submit_profile(
  p_first text, p_last text, p_job_title text, p_department uuid, p_reports_to uuid, p_role public.app_role
) returns void language plpgsql security definer set search_path to '' as $function$
declare u public.users; a public.users;
begin
  u := app.me_row();
  if u.id is null or u.account_status not in ('key_verified', 'approver_pending') then raise exception 'Profile step is not open'; end if;
  if char_length(trim(coalesce(p_first, ''))) < 2 or char_length(trim(coalesce(p_last, ''))) < 1 then raise exception 'Enter your first and last name'; end if;
  if char_length(trim(coalesce(p_job_title, ''))) < 2 then raise exception 'Enter your job title as written in your offer letter'; end if;
  if p_department is null or not exists (select 1 from public.departments where id = p_department) then raise exception 'Choose your department'; end if;
  select * into a from public.users where id = p_reports_to and is_active and account_status = 'active' and role in ('boss', 'hr', 'manager');
  if not found then raise exception 'Choose who you report to'; end if;
  if p_role = 'boss' then raise exception 'The Boss role cannot be chosen here'; end if;
  if p_role in ('manager', 'hr') and a.role not in ('hr', 'boss') then
    raise exception 'A Manager or HR account must report to HR or the Boss';
  end if;
  update public.users set
    first_name = trim(p_first), last_name = trim(p_last),
    full_name = trim(p_first) || ' ' || trim(p_last),
    job_title = trim(p_job_title), department_id = p_department, manager_id = p_reports_to, role = p_role,
    account_status = 'approver_pending'
  where id = u.id;
end $function$;
grant execute on function public.onboarding_submit_profile(text, text, text, uuid, uuid, public.app_role) to authenticated;
revoke execute on function public.onboarding_submit_profile(text, text, text, uuid, uuid, public.app_role) from public, anon;

alter table public.users drop column if exists middle_name;

-- my_context: no committee flag any more (the module is gone)
create or replace function public.my_context()
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  u public.users;
  s public.app_settings;
  v_jwt_email text;
  v_name text;
  v_org uuid;
  v_first boolean;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into u from public.users where id = auth.uid();

  if not found then
    v_jwt_email := lower(coalesce(auth.jwt() ->> 'email', ''));
    if v_jwt_email <> '' then
      -- 1. Try finding existing profile by email (e.g. invited user or earlier password account)
      select * into u from public.users where email = v_jwt_email;
      if found then
        begin
          update public.users
          set id = auth.uid(), is_active = true, account_status = 'active'
          where email = v_jwt_email
          returning * into u;
        exception when others then
          null;
        end;
      else
        -- 2. First-time sign in with Google / OAuth: auto-provision profile
        select not exists (select 1 from public.users) into v_first;
        select id into v_org from public.organizations where is_active order by created_at limit 1;
        v_name := coalesce(
          nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
          nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
          split_part(v_jwt_email, '@', 1)
        );
        begin
          insert into public.users (id, email, full_name, role, account_status, is_active, activated_at, approved_at, organization_id)
          values (auth.uid(), v_jwt_email, v_name,
                  case when v_first then 'boss'::public.app_role else 'employee'::public.app_role end,
                  'active', true, now(), now(), v_org)
          returning * into u;
        exception when others then
          select * into u from public.users where email = v_jwt_email;
        end;
      end if;
    end if;
  end if;

  if u.id is null then
    raise exception 'Account not found' using errcode = '42501';
  end if;

  select * into s from public.app_settings where id = 1;
  return jsonb_build_object(
    'user', to_jsonb(u) - 'push_token' - 'app_lock_passcode_hash' - 'app_lock_passcode_salt' - 'app_lock_pattern_hash' - 'app_lock_pattern_salt'
      || jsonb_build_object(
        'has_passcode', (u.app_lock_passcode_hash is not null),
        'has_pattern', (u.app_lock_pattern_hash is not null)
      ),
    'department', (select d.name from public.departments d where d.id = u.department_id),
    'manager', (select m.full_name from public.users m where m.id = u.manager_id),
    'organization', (select jsonb_build_object('id', o.id, 'name', o.name) from public.organizations o where o.id = u.organization_id),
    'leads_team', exists (select 1 from public.users r where r.manager_id = u.id and r.is_active),
    'mfa_required', u.role in ('boss','hr') and s.require_mfa_admins,
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'settings', jsonb_build_object(
      'company_name', s.company_name,
      'session_timeout_minutes', s.session_timeout_minutes,
      'privacy_notice_version', s.privacy_notice_version,
      'min_group_size', s.min_group_size,
      'blocker_hr_hours', s.blocker_hr_hours,
      'blocker_boss_hours', s.blocker_boss_hours,
      'require_mfa_admins', s.require_mfa_admins,
      'retention_audit_days', s.retention_audit_days,
      'location_retention_days', s.location_retention_days)
  );
end $function$;

-- ---------------------------------------------------------------------
-- 3. feedback_replies -> feedback_items.replies
-- ---------------------------------------------------------------------
alter table public.feedback_items add column if not exists replies jsonb not null default '[]'::jsonb;

update public.feedback_items f set replies = coalesce((
  select jsonb_agg(jsonb_build_object(
           'id', r.id, 'responder_id', r.responder_id, 'body', r.body, 'created_at', r.created_at,
           'responder', case when u.id is null then null else jsonb_build_object('full_name', u.full_name, 'role', u.role) end)
         order by r.created_at)
  from public.feedback_replies r left join public.users u on u.id = r.responder_id
  where r.feedback_id = f.id), '[]'::jsonb)
where exists (select 1 from public.feedback_replies r where r.feedback_id = f.id);

do $$
declare src bigint; dst bigint;
begin
  select count(*) into src from public.feedback_replies;
  select coalesce(sum(jsonb_array_length(replies)), 0) into dst from public.feedback_items;
  if dst < src then raise exception 'Stopped: only % of % feedback replies were copied', dst, src; end if;
end $$;

create or replace function public.reply_feedback(p_id uuid, p_body text, p_publish boolean default false)
 returns void language plpgsql security definer set search_path to '' as $function$
declare f public.feedback_items; v_responder boolean; v_is_author boolean; u public.users;
begin
  select * into f from public.feedback_items where id = p_id for update;
  if not found then raise exception 'Item not found'; end if;
  v_responder := app.can_respond_feedback(f);
  v_is_author := f.author_id is not null and f.author_id = auth.uid();
  if not (v_responder or v_is_author) then raise exception 'You cannot reply to this item' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 2 then raise exception 'Reply is empty'; end if;

  select * into u from public.users where id = auth.uid();
  update public.feedback_items
     set replies = coalesce(replies, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'id', extensions.gen_random_uuid(), 'responder_id', auth.uid(), 'body', trim(p_body), 'created_at', now(),
           'responder', jsonb_build_object('full_name', u.full_name, 'role', u.role)))
   where id = p_id;

  if v_responder and not v_is_author then
    update public.feedback_items set
      status = case when status = 'resolved' then status else 'answered' end,
      answered_at = coalesce(answered_at, now()),
      acknowledged_at = coalesce(acknowledged_at, now()),
      is_published = case when p_publish and type = 'question' then true else is_published end
    where id = p_id;
    perform app.notify(f.author_id, 'feedback_reply', u.full_name || ' replied', f.title, 'feedback_items', p_id);
  else
    perform app.notify(f.recipient_manager_id, 'feedback_reply', 'New follow-up', f.title, 'feedback_items', p_id);
  end if;
end $function$;

-- ---------------------------------------------------------------------
-- 5. departments.organization_id (rewrite the two readers first)
-- ---------------------------------------------------------------------
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
      -- departments are shared by every company; the company filter applies to the people in them
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

alter table public.departments drop constraint if exists departments_universal;
alter table public.departments drop column if exists organization_id;

-- ---------------------------------------------------------------------
-- 6. Old tables, now empty copies of the merged data
-- ---------------------------------------------------------------------
drop table public.feedback_replies;
drop table public.activation_keys;
drop table public.verification_codes;
