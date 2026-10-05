-- =====================================================================
-- 024 APP LOCK SECURITY (PASSCODE, PATTERN, BIOMETRICS)
-- Allows users to secure the mobile / web app with App Lock:
-- 1. 4-digit Passcode (PIN)
-- 2. 3x3 Pattern Lock
-- 3. Biometrics (Fingerprint / Face ID)
-- When disabled, the user is standard Email and Password protected.
-- =====================================================================

alter table public.users
  add column if not exists app_lock_enabled boolean not null default false,
  add column if not exists app_lock_type text default 'passcode' check (app_lock_type in ('passcode', 'pattern', 'biometric')),
  add column if not exists app_lock_passcode_hash text,
  add column if not exists app_lock_passcode_salt text,
  add column if not exists app_lock_pattern_hash text,
  add column if not exists app_lock_pattern_salt text,
  add column if not exists app_lock_biometric_enabled boolean not null default false;

create or replace function public.get_my_app_lock() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u public.users;
begin
  select * into u from public.users where id = auth.uid();
  if not found then return null; end if;
  return jsonb_build_object(
    'enabled', coalesce(u.app_lock_enabled, false),
    'type', coalesce(u.app_lock_type, 'passcode'),
    'has_passcode', (u.app_lock_passcode_hash is not null),
    'has_pattern', (u.app_lock_pattern_hash is not null),
    'biometric_enabled', coalesce(u.app_lock_biometric_enabled, false)
  );
end $$;

create or replace function public.save_my_app_lock(
  p_enabled boolean,
  p_type text,
  p_passcode_hash text default null,
  p_passcode_salt text default null,
  p_pattern_hash text default null,
  p_pattern_salt text default null,
  p_biometric_enabled boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update public.users set
    app_lock_enabled = coalesce(p_enabled, false),
    app_lock_type = coalesce(p_type, app_lock_type, 'passcode'),
    app_lock_passcode_hash = coalesce(p_passcode_hash, app_lock_passcode_hash),
    app_lock_passcode_salt = coalesce(p_passcode_salt, app_lock_passcode_salt),
    app_lock_pattern_hash = coalesce(p_pattern_hash, app_lock_pattern_hash),
    app_lock_pattern_salt = coalesce(p_pattern_salt, app_lock_pattern_salt),
    app_lock_biometric_enabled = coalesce(p_biometric_enabled, app_lock_biometric_enabled, false)
  where id = auth.uid();

  return public.get_my_app_lock();
end $$;

create or replace function public.verify_my_app_lock(p_type text, p_secret text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  u public.users;
  v_hash text;
begin
  select * into u from public.users where id = auth.uid();
  if not found then return false; end if;
  if p_type = 'passcode' then
    if u.app_lock_passcode_hash is null or u.app_lock_passcode_salt is null then return false; end if;
    v_hash := encode(extensions.digest(u.app_lock_passcode_salt || ':' || p_secret, 'sha256'), 'hex');
    return v_hash = u.app_lock_passcode_hash;
  elsif p_type = 'pattern' then
    if u.app_lock_pattern_hash is null or u.app_lock_pattern_salt is null then return false; end if;
    v_hash := encode(extensions.digest(u.app_lock_pattern_salt || ':' || p_secret, 'sha256'), 'hex');
    return v_hash = u.app_lock_pattern_hash;
  end if;
  return false;
end $$;

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
    'user', to_jsonb(u) - 'push_token' - 'app_lock_passcode_hash' - 'app_lock_passcode_salt' - 'app_lock_pattern_hash' - 'app_lock_pattern_salt'
      || jsonb_build_object(
        'has_passcode', (u.app_lock_passcode_hash is not null),
        'has_pattern', (u.app_lock_pattern_hash is not null)
      ),
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

grant execute on function public.get_my_app_lock() to authenticated;
grant execute on function public.save_my_app_lock(boolean, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.verify_my_app_lock(text, text) to authenticated;
revoke execute on function public.get_my_app_lock() from public, anon;
revoke execute on function public.save_my_app_lock(boolean, text, text, text, text, text, boolean) from public, anon;
revoke execute on function public.verify_my_app_lock(text, text) from public, anon;
