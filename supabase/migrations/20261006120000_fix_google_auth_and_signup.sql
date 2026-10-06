-- =====================================================================
-- 043 FIX GOOGLE AUTHENTICATION & SIGN-UP
-- Fixes "Account not found" error when continuing with Google.
-- 1. Updates app.handle_new_auth_user() to remove deprecated employee_details
--    table insert and safely handle on conflict (email).
-- 2. Updates public.my_context() to be self-healing: if an authenticated
--    OAuth/Google user is not yet in public.users, or has a different ID
--    from an earlier password account with the same email, it seamlessly
--    links or provisions them.
-- 3. Adds public.sync_google_user(p_org uuid default null) RPC so the app
--    can explicitly ensure the Google profile is provisioned and linked.
-- =====================================================================

-- 1. Fix auth user trigger to safely handle new users, Google logins, and email conflicts
create or replace function app.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_first boolean;
  v_org uuid;
  v_name text;
  v_is_google boolean;
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

  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(new.email, '@', 1)
  );

  v_is_google := (new.raw_app_meta_data ->> 'provider' = 'google')
    or exists (select 1 from auth.identities i where i.user_id = new.id and i.provider = 'google');

  insert into public.users (
    id, email, full_name, role, account_status, is_active,
    activated_at, approved_at, organization_id
  )
  values (
    new.id,
    lower(new.email),
    v_name,
    case when v_first then 'boss'::public.app_role else 'employee'::public.app_role end,
    case when v_first or v_is_google then 'active' else 'invited' end,
    true,
    case when v_first or v_is_google then now() end,
    case when v_first or v_is_google then now() end,
    v_org
  )
  on conflict (email) do update set
    id = excluded.id,
    full_name = coalesce(public.users.full_name, excluded.full_name),
    organization_id = coalesce(public.users.organization_id, excluded.organization_id),
    account_status = case when v_is_google then 'active' else public.users.account_status end,
    is_active = true;

  return new;
exception when others then
  -- Fail-safe: never block Supabase Auth user creation
  return new;
end $$;

-- 2. Self-healing my_context(): ensures Google / OAuth sign-ins never fail with 'Account not found'
create or replace function public.my_context()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
          -- If foreign key prevents updating id, keep u as is
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
          insert into public.users (
            id, email, full_name, role, account_status, is_active,
            activated_at, approved_at, organization_id
          ) values (
            auth.uid(),
            v_jwt_email,
            v_name,
            case when v_first then 'boss'::public.app_role else 'employee'::public.app_role end,
            'active',
            true,
            now(),
            now(),
            v_org
          ) returning * into u;
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
    'is_committee', exists (select 1 from public.committee_members c where c.user_id = u.id),
    'leads_team', exists (select 1 from public.users r where r.manager_id = u.id and r.is_active),
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
      'retention_audit_days', s.retention_audit_days,
      'location_retention_days', s.location_retention_days)
  );
end $function$;

-- 3. Dedicated sync_google_user RPC for explicit provisioning and organization assignment
create or replace function public.sync_google_user(p_org uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  u public.users;
  v_jwt_email text;
  v_name text;
  v_org uuid := p_org;
  v_first boolean;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  v_jwt_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_jwt_email = '' then
    raise exception 'No email address found in session' using errcode = '42501';
  end if;

  if v_org is null or not exists (select 1 from public.organizations where id = v_org) then
    select id into v_org from public.organizations where is_active order by created_at limit 1;
  end if;

  select * into u from public.users where id = auth.uid();
  if not found then
    select * into u from public.users where email = v_jwt_email;
    if found then
      update public.users
      set id = auth.uid(),
          is_active = true,
          account_status = 'active',
          organization_id = coalesce(u.organization_id, v_org)
      where email = v_jwt_email
      returning * into u;
    else
      select not exists (select 1 from public.users) into v_first;
      v_name := coalesce(
        nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
        nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
        split_part(v_jwt_email, '@', 1)
      );

      insert into public.users (
        id, email, full_name, role, account_status, is_active,
        activated_at, approved_at, organization_id
      ) values (
        auth.uid(),
        v_jwt_email,
        v_name,
        case when v_first then 'boss'::public.app_role else 'employee'::public.app_role end,
        'active',
        true,
        now(),
        now(),
        v_org
      ) returning * into u;
    end if;
  end if;

  return public.my_context();
end $$;

grant execute on function public.sync_google_user(uuid) to authenticated;
