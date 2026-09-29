-- =====================================================================
-- 011 SELF SIGN-UP ONBOARDING
--
--  sign up (email + password)            -> 'email_pending'   (6-digit code emailed)
--  email code ok                          -> 'email_verified'  (Boss notified: issue key / QR)
--  key or QR ok                           -> 'key_verified'
--  profile form (names, title, dept, reports-to, role)
--                                         -> 'approver_pending' (code emailed to reports-to person)
--  approver code ok                       -> 'active'
-- Until 'active', app.uid_role() returns NULL, so the person can do nothing except onboarding.
-- Admin-added people keep the old path: 'invited' -> activate with key -> 'awaiting_approval' -> Boss approves.
-- =====================================================================

alter table public.users drop constraint if exists users_account_status_check;
alter table public.users add constraint users_account_status_check check (account_status in
  ('invited', 'awaiting_approval', 'active', 'email_pending', 'email_verified', 'key_verified', 'approver_pending'));

alter table public.users
  add column first_name  text,
  add column middle_name text,
  add column last_name   text;

alter table public.app_settings
  add column email_test_mode boolean not null default false;  -- shows codes on screen while email (SMTP) is not set up
grant update (email_test_mode) on public.app_settings to authenticated;

-- One live code per person per purpose. Stored hashed; 10-minute expiry; 5 tries.
create table public.verification_codes (
  user_id    uuid not null references public.users(id) on delete cascade,
  purpose    text not null check (purpose in ('email', 'approver', 'reset')),
  code_hash  text not null,
  sent_to    text not null,
  expires_at timestamptz not null,
  attempts   int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, purpose)
);
alter table public.verification_codes enable row level security;
revoke all on public.verification_codes from anon, authenticated;

create or replace function app.code_hash(p_user uuid, p_code text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_user::text || ':' || coalesce(p_code, ''), 'sha256'), 'hex')
$$;

-- Creates a fresh 6-digit code (60-second resend cool-down). Service role only.
create or replace function public.issue_code_internal(p_user uuid, p_purpose text, p_sent_to text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text; v_last timestamptz; b bytea := extensions.gen_random_bytes(3);
begin
  select created_at into v_last from public.verification_codes where user_id = p_user and purpose = p_purpose;
  if v_last is not null and v_last > now() - interval '60 seconds' then
    raise exception 'Please wait a minute before requesting another code';
  end if;
  v_code := lpad(((get_byte(b, 0) * 65536 + get_byte(b, 1) * 256 + get_byte(b, 2)) % 1000000)::text, 6, '0');
  insert into public.verification_codes (user_id, purpose, code_hash, sent_to, expires_at, attempts, created_at)
  values (p_user, p_purpose, app.code_hash(p_user, v_code), p_sent_to, now() + interval '10 minutes', 0, now())
  on conflict (user_id, purpose) do update set
    code_hash = excluded.code_hash, sent_to = excluded.sent_to, expires_at = excluded.expires_at, attempts = 0, created_at = now();
  return v_code;
end $$;

create or replace function app.check_code(p_user uuid, p_purpose text, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.verification_codes;
begin
  select * into c from public.verification_codes where user_id = p_user and purpose = p_purpose for update;
  if not found then raise exception 'No code was sent. Tap "Resend code".'; end if;
  if c.expires_at < now() then raise exception 'This code has expired. Tap "Resend code".'; end if;
  if c.attempts >= 5 then raise exception 'Too many wrong attempts. Tap "Resend code" for a new one.'; end if;
  if c.code_hash <> app.code_hash(p_user, trim(p_code)) then
    update public.verification_codes set attempts = attempts + 1 where user_id = p_user and purpose = p_purpose;
    raise exception 'That code is not correct (% tries left)', 4 - c.attempts;
  end if;
  delete from public.verification_codes where user_id = p_user and purpose = p_purpose;
end $$;

create or replace function public.check_code_internal(p_user uuid, p_purpose text, p_code text) returns void
language sql security definer set search_path = '' as $$ select app.check_code(p_user, p_purpose, p_code) $$;

revoke execute on function public.issue_code_internal(uuid, text, text), public.check_code_internal(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.issue_code_internal(uuid, text, text), public.check_code_internal(uuid, text, text) to service_role;
revoke all on function app.check_code(uuid, text, text) from public, anon, authenticated;

-- ---------- onboarding (called by the signed-in, not-yet-active person) ----------
create or replace function app.me_row() returns public.users
language sql stable security definer set search_path = '' as $$
  select * from public.users where id = auth.uid() and is_active
$$;

-- Where am I in onboarding? Also moves Google sign-ups (email already verified by Google) past the email step.
create or replace function public.onboarding_state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.users; v_google boolean; m public.users; v_code public.verification_codes;
begin
  select * into u from public.users where id = auth.uid();
  if not found then raise exception 'Not signed in' using errcode = '42501'; end if;
  select exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google') into v_google;
  if v_google and u.account_status in ('invited', 'email_pending') and not exists (select 1 from public.activation_keys k where k.user_id = u.id) then
    update public.users set account_status = 'email_verified' where id = u.id returning * into u;
    perform app.notify_role('boss', 'signup_verified', 'New sign-up: ' || u.email, 'Email verified with Google. Generate their key in the admin panel.', 'users', u.id);
  end if;
  select * into m from public.users where id = u.manager_id;
  select * into v_code from public.verification_codes where user_id = u.id and purpose = case when u.account_status = 'approver_pending' then 'approver' else 'email' end;
  return jsonb_build_object(
    'status', u.account_status, 'is_active', u.is_active, 'email', u.email, 'google', v_google,
    'first_name', u.first_name, 'middle_name', u.middle_name, 'last_name', u.last_name,
    'approver_name', m.full_name, 'approver_role', m.role,
    'code_sent_to', v_code.sent_to, 'code_expires_at', v_code.expires_at);
end $$;

create or replace function public.onboarding_verify_email(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare u public.users;
begin
  u := app.me_row();
  if u.id is null or u.account_status <> 'email_pending' then raise exception 'Email verification is not pending'; end if;
  perform app.check_code(u.id, 'email', p_code);
  update public.users set account_status = 'email_verified' where id = u.id;
  perform app.notify_role('boss', 'signup_verified', 'New sign-up: ' || u.email, 'Email verified. Generate their activation key or QR in the admin panel.', 'users', u.id);
  insert into public.audit_logs (actor_id, action, entity, entity_id) values (u.id, 'signup.email_verified', 'users', u.id);
end $$;

create or replace function public.onboarding_verify_key(p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare u public.users; k public.activation_keys;
begin
  u := app.me_row();
  if u.id is null or u.account_status not in ('email_verified', 'invited') then raise exception 'Key verification is not pending'; end if;
  select * into k from public.activation_keys where user_id = u.id for update;
  if not found then raise exception 'Your administrator has not issued your key yet. Please ask them.'; end if;
  if k.used_at is not null then raise exception 'This key was already used. Ask your administrator for a new one.'; end if;
  if k.expires_at < now() then raise exception 'This key has expired. Ask your administrator for a new one.'; end if;
  if k.failed_attempts >= 5 then raise exception 'Too many wrong attempts. Ask your administrator for a new key.'; end if;
  if k.key_hash <> app.hash_key(p_key) then
    update public.activation_keys set failed_attempts = failed_attempts + 1 where user_id = u.id;
    raise exception 'That key is not correct';
  end if;
  update public.activation_keys set used_at = now() where user_id = u.id;
  update public.users set account_status = 'key_verified', activated_at = now() where id = u.id;
  insert into public.audit_logs (actor_id, action, entity, entity_id) values (u.id, 'signup.key_verified', 'users', u.id);
end $$;

-- People a newcomer can report to, and departments (the newcomer has no directory access yet).
create or replace function public.onboarding_options() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u public.users;
begin
  u := app.me_row();
  if u.id is null or u.account_status not in ('key_verified', 'approver_pending') then raise exception 'Not available' using errcode = '42501'; end if;
  return jsonb_build_object(
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name) from public.departments d), '[]'::jsonb),
    'approvers', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'full_name', x.full_name, 'role', x.role, 'job_title', x.job_title,
                                                               'department', (select d.name from public.departments d where d.id = x.department_id))
                                             order by case x.role when 'boss' then 0 when 'hr' then 1 else 2 end, x.full_name)
                           from public.users x where x.is_active and x.account_status = 'active' and x.role in ('boss', 'hr', 'manager')), '[]'::jsonb));
end $$;

create or replace function public.onboarding_submit_profile(
  p_first text, p_middle text, p_last text, p_job_title text, p_department uuid, p_reports_to uuid, p_role public.app_role
) returns void
language plpgsql security definer set search_path = '' as $$
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
    first_name = trim(p_first), middle_name = nullif(trim(coalesce(p_middle, '')), ''), last_name = trim(p_last),
    full_name = trim(trim(p_first) || ' ' || coalesce(nullif(trim(coalesce(p_middle, '')), '') || ' ', '') || trim(p_last)),
    job_title = trim(p_job_title), department_id = p_department, manager_id = p_reports_to, role = p_role,
    account_status = 'approver_pending'
  where id = u.id;
end $$;

create or replace function public.onboarding_confirm_approver(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare u public.users;
begin
  u := app.me_row();
  if u.id is null or u.account_status <> 'approver_pending' then raise exception 'Approval code is not pending'; end if;
  perform app.check_code(u.id, 'approver', p_code);
  update public.users set account_status = 'active', approved_at = now(), approved_by = manager_id where id = u.id;
  perform app.notify(u.manager_id, 'signup_done', u.full_name || ' joined your team', 'Their account is now active.', 'users', u.id);
  perform app.notify(u.id, 'welcome', 'Welcome to SKFL', 'Your account is active.', 'users', u.id);
  insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
  values (u.id, 'signup.completed', 'users', u.id, jsonb_build_object('approved_by', u.manager_id));
end $$;

-- Service-role lookups used by the mail Edge Functions.
create or replace function public.onboarding_mail_target_internal(p_user uuid, p_purpose text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.users; m public.users;
begin
  select * into u from public.users where id = p_user;
  if not found then raise exception 'Account not found'; end if;
  if p_purpose = 'email' then
    if u.account_status <> 'email_pending' then raise exception 'Email verification is not pending'; end if;
    return jsonb_build_object('to', u.email, 'name', coalesce(u.first_name, split_part(u.email, '@', 1)), 'about', u.email);
  elsif p_purpose = 'approver' then
    if u.account_status <> 'approver_pending' then raise exception 'Approval is not pending'; end if;
    select * into m from public.users where id = u.manager_id;
    return jsonb_build_object('to', m.email, 'name', m.full_name, 'about', u.full_name,
      'details', jsonb_build_object('email', u.email, 'job_title', u.job_title, 'role', u.role,
        'department', (select d.name from public.departments d where d.id = u.department_id)));
  end if;
  raise exception 'Unknown purpose';
end $$;

-- Password reset lookup (only active accounts).
create or replace function public.reset_target_internal(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.users where lower(email) = lower(trim(p_email)) and is_active and account_status = 'active'
$$;

-- Newly created auth users from the sign-up function start at 'email_pending'.
create or replace function public.mark_email_pending_internal(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  update public.users set account_status = 'email_pending' where id = p_user and account_status in ('invited', 'email_pending')
$$;

revoke execute on function public.onboarding_mail_target_internal(uuid, text), public.reset_target_internal(text), public.mark_email_pending_internal(uuid)
  from public, anon, authenticated;
grant execute on function public.onboarding_mail_target_internal(uuid, text), public.reset_target_internal(text), public.mark_email_pending_internal(uuid)
  to service_role;

grant execute on function public.onboarding_state(), public.onboarding_verify_email(text), public.onboarding_verify_key(text),
  public.onboarding_options(), public.onboarding_submit_profile(text, text, text, text, uuid, uuid, public.app_role),
  public.onboarding_confirm_approver(text) to authenticated;
revoke execute on function public.onboarding_state(), public.onboarding_verify_email(text), public.onboarding_verify_key(text),
  public.onboarding_options(), public.onboarding_submit_profile(text, text, text, text, uuid, uuid, public.app_role),
  public.onboarding_confirm_approver(text) from public, anon;

-- Boss can issue a key for self-sign-ups as well (email verified). Keep existing status.
create or replace function public.admin_issue_activation_key(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if not app.is_boss() then raise exception 'Only the Boss can issue activation keys' using errcode = '42501'; end if;
  if not exists (select 1 from public.users where id = p_user) then raise exception 'Person not found'; end if;
  k := app.new_activation_key(p_user, auth.uid());
  perform app.audit('activation.key_issued', 'users', p_user);
  return k;
end $$;

-- Test mode is on for this demo project until SMTP (Gmail) is configured.
update public.app_settings set email_test_mode = true where id = 1;
