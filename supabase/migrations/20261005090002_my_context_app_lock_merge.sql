-- =====================================================================
-- 027 my_context: merge the App Lock and later versions
-- 024 (app lock) hid the PIN/pattern hashes and added has_passcode /
-- has_pattern; 080000 (organizations) and 090000/090001 (location) each
-- rewrote my_context from an older copy and dropped that. This is the
-- combined version: hashes never leave the server, and the app still gets
-- organization, leads_team and the location retention setting.
-- =====================================================================

create or replace function public.my_context()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
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
