-- =====================================================================
-- 013 REMOVE MIDDLE NAME
--
-- Remove middle_name column entirely from users table and functions.
-- =====================================================================

-- Drop column from users
alter table public.users drop column if exists middle_name cascade;

-- Update onboarding_state() to omit middle_name
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
    'first_name', u.first_name, 'last_name', u.last_name,
    'approver_name', m.full_name, 'approver_role', m.role,
    'code_sent_to', v_code.sent_to, 'code_expires_at', v_code.expires_at);
end $$;

-- Update onboarding_submit_profile (6 arguments: first, last, job_title, department, reports_to, role)
create or replace function public.onboarding_submit_profile(
  p_first text, p_last text, p_job_title text, p_department uuid, p_reports_to uuid, p_role public.app_role
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
    first_name = trim(p_first), last_name = trim(p_last),
    full_name = trim(trim(p_first) || ' ' || trim(p_last)),
    job_title = trim(p_job_title), department_id = p_department, manager_id = p_reports_to, role = p_role,
    account_status = 'approver_pending'
  where id = u.id;
end $$;

-- Backward compatibility overload: 7 arguments (ignores p_middle and calls 6-arg version)
create or replace function public.onboarding_submit_profile(
  p_first text, p_middle text, p_last text, p_job_title text, p_department uuid, p_reports_to uuid, p_role public.app_role
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.onboarding_submit_profile(p_first, p_last, p_job_title, p_department, p_reports_to, p_role);
end $$;
