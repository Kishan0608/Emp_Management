-- =====================================================================
-- 014 TASK ASSIGNEES WITH PHONE AND DEPARTMENT
--
-- Secure function to retrieve assignable team members with phone numbers
-- for Manager, HR, and Boss task assignment.
-- =====================================================================

create or replace function public.get_task_assignees() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.app_role := app.uid_role();
begin
  if v_role is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  return coalesce(
    (select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'full_name', u.full_name,
      'email', u.email,
      'role', u.role,
      'job_title', u.job_title,
      'department_id', u.department_id,
      'department', dep.name,
      'manager_id', u.manager_id,
      'phone', d.phone,
      'is_active', u.is_active,
      'is_case_handler', u.is_case_handler
    ) order by u.full_name)
    from public.users u
    left join public.departments dep on dep.id = u.department_id
    left join public.employee_details d on d.user_id = u.id
    where u.is_active
      and (
        v_role = 'boss'
        or (v_role = 'hr' and u.role in ('employee', 'hr'))
        or (v_role = 'manager' and u.manager_id = auth.uid())
      )
    ), '[]'::jsonb);
end $$;

grant execute on function public.get_task_assignees() to authenticated;
revoke execute on function public.get_task_assignees() from public, anon;
