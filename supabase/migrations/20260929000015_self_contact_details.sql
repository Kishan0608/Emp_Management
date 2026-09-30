-- =====================================================================
-- 015 SELF-SERVICE CONTACT DETAILS
--
-- Every employee can keep their own phone, personal email, address and
-- joining date up to date. Salary, attendance and performance stay
-- Boss/HR managed (admin_set_employee_details) — this function never
-- touches those three columns, regardless of what the caller sends.
-- =====================================================================
create or replace function public.update_my_contact_details(
  p_phone text, p_personal_email text, p_address text, p_joined_on date
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_personal_email is not null and p_personal_email <> '' and p_personal_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Enter a valid personal email';
  end if;
  insert into public.employee_details as d (user_id, phone, personal_email, address, joined_on)
  values (auth.uid(), nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_personal_email, '')), ''),
          nullif(trim(coalesce(p_address, '')), ''), p_joined_on)
  on conflict (user_id) do update set
    phone = excluded.phone, personal_email = excluded.personal_email,
    address = excluded.address, joined_on = excluded.joined_on;
  perform app.audit('employee_details.self_update', 'employee_details', auth.uid());
end $$;

grant execute on function public.update_my_contact_details(text, text, text, date) to authenticated;
revoke execute on function public.update_my_contact_details(text, text, text, date) from public, anon;
