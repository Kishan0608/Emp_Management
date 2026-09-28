-- =====================================================================
-- 008: HR editing records must not overwrite fields they are not allowed to see.
-- (e.g. HR with salary hidden would otherwise send an empty salary and wipe it.)
-- Each field is only written when the caller can see it.
-- =====================================================================
create or replace function public.admin_set_employee_details(
  p_user_id uuid, p_phone text, p_personal_email text, p_address text,
  p_salary numeric, p_attendance numeric, p_performance numeric, p_joined_on date
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c boolean := app.can_see_field(p_user_id, 'contact');
  s boolean := app.can_see_field(p_user_id, 'salary');
  a boolean := app.can_see_field(p_user_id, 'attendance');
  p boolean := app.can_see_field(p_user_id, 'performance');
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only Boss or HR can edit employee records' using errcode = '42501'; end if;
  if p_user_id = auth.uid() and not app.is_boss() then raise exception 'HR cannot edit their own record'; end if;
  if app.is_hr() and exists (select 1 from public.users where id = p_user_id and role = 'boss') then
    raise exception 'HR cannot edit the Boss''s record';
  end if;

  insert into public.employee_details (user_id) values (p_user_id) on conflict (user_id) do nothing;
  update public.employee_details d set
    phone              = case when c then p_phone else d.phone end,
    personal_email     = case when c then p_personal_email else d.personal_email end,
    address            = case when c then p_address else d.address end,
    joined_on          = case when c then p_joined_on else d.joined_on end,
    salary_monthly     = case when s then p_salary else d.salary_monthly end,
    attendance_pct     = case when a then p_attendance else d.attendance_pct end,
    performance_rating = case when p then p_performance else d.performance_rating end
  where d.user_id = p_user_id;

  perform app.audit('employee_details.update', 'employee_details', p_user_id,
    jsonb_build_object('fields', array_remove(array[
      case when c then 'contact' end, case when s then 'salary' end,
      case when a then 'attendance' end, case when p then 'performance' end], null)));
end $$;
