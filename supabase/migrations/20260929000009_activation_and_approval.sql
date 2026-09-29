-- =====================================================================
-- 009 ONE-TIME ACTIVATION + BOSS APPROVAL (replaces the per-login 2FA code)
--
-- Flow:  Boss adds a person (admin panel)  -> status 'invited' + activation key
--        Person enters email + key + new password in the app (once)
--                                            -> status 'awaiting_approval'
--        Boss approves in the admin panel    -> status 'active'
-- Only 'active' accounts can use anything: the role helper returns NULL otherwise.
-- A new key can be issued any time to recover a lost account.
-- =====================================================================

alter table public.users
  add column account_status text not null default 'invited'
    check (account_status in ('invited', 'awaiting_approval', 'active')),
  add column activated_at timestamptz,
  add column approved_at  timestamptz,
  add column approved_by  uuid references public.users(id) on delete set null;

-- Everyone who already exists (the demo accounts) is treated as active.
update public.users set account_status = 'active', activated_at = now(), approved_at = now();

-- Keys are stored hashed only. The plain key is shown once, to the Boss.
create table public.activation_keys (
  user_id         uuid primary key references public.users(id) on delete cascade,
  key_hash        text not null,
  issued_by       uuid references public.users(id) on delete set null,
  issued_at       timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days',
  failed_attempts int not null default 0,
  used_at         timestamptz
);
alter table public.activation_keys enable row level security;
revoke all on public.activation_keys from anon, authenticated;

-- Per-login 2FA is replaced by one-time activation + approval.
update public.app_settings set require_mfa_admins = false where id = 1;

-- Only ACTIVE (approved) accounts get a role. Everything else is denied.
create or replace function app.uid_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select u.role from public.users u
  where u.id = auth.uid() and u.is_active and u.account_status = 'active'
$$;

-- The first account ever (company bootstrap) is active immediately; all others start 'invited'.
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
  insert into public.employee_details (user_id) values (new.id);
  return new;
end $$;

-- ---------- key generation ----------
create or replace function app.hash_key(p_key text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(upper(regexp_replace(coalesce(p_key, ''), '\s', '', 'g')), 'sha256'), 'hex')
$$;

create or replace function app.new_activation_key(p_user uuid, p_by uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I
  b bytea := extensions.gen_random_bytes(8);
  k text := '';
  i int;
begin
  for i in 0..7 loop
    k := k || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  k := 'SKFL-' || substr(k, 1, 4) || '-' || substr(k, 5, 4);
  insert into public.activation_keys (user_id, key_hash, issued_by, issued_at, expires_at, failed_attempts, used_at)
  values (p_user, app.hash_key(k), p_by, now(), now() + interval '7 days', 0, null)
  on conflict (user_id) do update set
    key_hash = excluded.key_hash, issued_by = excluded.issued_by, issued_at = now(),
    expires_at = now() + interval '7 days', failed_attempts = 0, used_at = null;
  return k;
end $$;
revoke all on function app.new_activation_key(uuid, uuid) from public, anon, authenticated;

-- Boss (admin panel or app): issue / reissue a key. Returns the plain key ONCE.
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

-- Used by the invite-user Edge Function (service role) right after creating the account.
create or replace function public.issue_activation_key_internal(p_user uuid, p_by uuid) returns text
language sql security definer set search_path = '' as $$
  select app.new_activation_key(p_user, p_by)
$$;
revoke execute on function public.issue_activation_key_internal(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.issue_activation_key_internal(uuid, uuid) to service_role;

-- ---------- activation (called by the activate-account Edge Function) ----------
-- Step 1: check email + key. Wrong keys count toward a 5-attempt lock.
create or replace function public.activation_check(p_email text, p_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u public.users; k public.activation_keys;
begin
  select * into u from public.users where lower(email) = lower(trim(p_email));
  if not found then raise exception 'Email or activation key is not correct'; end if;
  select * into k from public.activation_keys where user_id = u.id for update;
  if not found or k.used_at is not null then raise exception 'This activation key was already used or not issued. Ask your administrator for a new one.'; end if;
  if not u.is_active then raise exception 'This account is deactivated. Contact your administrator.'; end if;
  if k.expires_at < now() then raise exception 'This activation key has expired. Ask your administrator for a new one.'; end if;
  if k.failed_attempts >= 5 then raise exception 'Too many wrong attempts. Ask your administrator for a new key.'; end if;
  if k.key_hash <> app.hash_key(p_key) then
    update public.activation_keys set failed_attempts = failed_attempts + 1 where user_id = u.id;
    raise exception 'Email or activation key is not correct';
  end if;
  return u.id;
end $$;

-- Step 2 (after the password is set): mark the key used and move to approval.
create or replace function public.activation_complete(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_status text; v_name text;
begin
  update public.activation_keys set used_at = now() where user_id = p_user;
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
end $$;

revoke execute on function public.activation_check(text, text), public.activation_complete(uuid) from public, anon, authenticated;
grant  execute on function public.activation_check(text, text), public.activation_complete(uuid) to service_role;

-- ---------- approval ----------
create or replace function public.admin_approve_user(p_user uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
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
    delete from public.activation_keys where user_id = p_user;
  end if;
  perform app.audit(case when p_approve then 'account.approved' else 'account.rejected' end, 'users', p_user);
end $$;

create or replace function public.admin_set_active(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_boss() then raise exception 'Only the Boss can change accounts' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You cannot deactivate your own account'; end if;
  update public.users set is_active = p_active where id = p_user;
  if not found then raise exception 'Person not found'; end if;
  if not p_active then delete from auth.sessions where user_id = p_user; end if;
  perform app.audit(case when p_active then 'user.reactivate' else 'user.deactivate' end, 'users', p_user);
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role public.app_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_boss() then raise exception 'Only the Boss can change roles' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own role'; end if;
  update public.users set role = p_role, is_case_handler = case when p_role = 'hr' then is_case_handler else false end where id = p_user;
  if not found then raise exception 'Person not found'; end if;
  perform app.notify(p_user, 'role', 'Your role changed', 'You are now ' || p_role::text || '. Sign in again to refresh access.', 'users', p_user);
  perform app.audit('user.role', 'users', p_user, jsonb_build_object('role', p_role));
end $$;

grant execute on function public.admin_set_active(uuid, boolean), public.admin_set_role(uuid, public.app_role) to authenticated;
revoke execute on function public.admin_set_active(uuid, boolean), public.admin_set_role(uuid, public.app_role) from public, anon;

-- ---------- admin panel people list ----------
create or replace function public.admin_people()
returns table (id uuid, full_name text, email text, role public.app_role, job_title text, department text,
               manager text, is_active boolean, account_status text, created_at timestamptz,
               activated_at timestamptz, approved_at timestamptz,
               key_issued_at timestamptz, key_expires_at timestamptz, key_used_at timestamptz, key_failed_attempts int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_boss() then raise exception 'Only the Boss can open the admin panel' using errcode = '42501'; end if;
  return query
  select u.id, u.full_name, u.email, u.role, u.job_title, d.name, m.full_name, u.is_active, u.account_status, u.created_at,
         u.activated_at, u.approved_at, k.issued_at, k.expires_at, k.used_at, k.failed_attempts
  from public.users u
  left join public.departments d on d.id = u.department_id
  left join public.users m on m.id = u.manager_id
  left join public.activation_keys k on k.user_id = u.id
  order by case u.account_status when 'awaiting_approval' then 0 when 'invited' then 1 else 2 end, u.full_name;
end $$;

-- my_context: expose the account status so the app can explain "awaiting approval".
create or replace function public.my_context() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
end $$;

grant execute on function public.admin_issue_activation_key(uuid), public.admin_approve_user(uuid, boolean), public.admin_people() to authenticated;
revoke execute on function public.admin_issue_activation_key(uuid), public.admin_approve_user(uuid, boolean), public.admin_people() from public, anon;
