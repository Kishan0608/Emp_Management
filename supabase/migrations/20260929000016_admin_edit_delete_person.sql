-- =====================================================================
-- 016 ADMIN PANEL: edit person details, delete a person
-- =====================================================================

-- admin_people needs department_id / manager_id (not just the display names)
-- so the admin panel's edit form can preselect the right option.
drop function if exists public.admin_people();

create function public.admin_people()
returns table (id uuid, full_name text, email text, role public.app_role, job_title text,
               department text, department_id uuid, manager text, manager_id uuid,
               is_active boolean, account_status text, created_at timestamptz,
               activated_at timestamptz, approved_at timestamptz,
               key_issued_at timestamptz, key_expires_at timestamptz, key_used_at timestamptz, key_failed_attempts int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_boss() then raise exception 'Only the Boss can open the admin panel' using errcode = '42501'; end if;
  return query
  select u.id, u.full_name, u.email, u.role, u.job_title, d.name, u.department_id, m.full_name, u.manager_id,
         u.is_active, u.account_status, u.created_at,
         u.activated_at, u.approved_at, k.issued_at, k.expires_at, k.used_at, k.failed_attempts
  from public.users u
  left join public.departments d on d.id = u.department_id
  left join public.users m on m.id = u.manager_id
  left join public.activation_keys k on k.user_id = u.id
  order by case u.account_status when 'awaiting_approval' then 0 when 'invited' then 1 else 2 end, u.full_name;
end $$;

grant execute on function public.admin_people() to authenticated;
revoke execute on function public.admin_people() from public, anon;

-- ---------- edit a person's details (Boss) ----------
create or replace function public.admin_update_person(
  p_user uuid, p_full_name text, p_job_title text, p_department_id uuid, p_manager_id uuid, p_role public.app_role
) returns void
language plpgsql security definer set search_path = '' as $$
declare old_row public.users;
begin
  if not app.is_boss() then raise exception 'Only the Boss can edit people' using errcode = '42501'; end if;
  select * into old_row from public.users where id = p_user for update;
  if not found then raise exception 'Person not found'; end if;
  if p_manager_id = p_user then raise exception 'A person cannot be their own manager'; end if;
  if trim(coalesce(p_full_name, '')) = '' then raise exception 'Enter a full name'; end if;
  if p_user = auth.uid() and p_role <> 'boss' then raise exception 'You cannot change your own role'; end if;

  update public.users set
    full_name = trim(p_full_name),
    job_title = nullif(trim(coalesce(p_job_title, '')), ''),
    department_id = p_department_id,
    manager_id = p_manager_id,
    role = p_role,
    is_case_handler = case when p_role = 'hr' then old_row.is_case_handler else false end
  where id = p_user;

  perform app.audit('user.update', 'users', p_user, jsonb_build_object(
    'old', jsonb_build_object('full_name', old_row.full_name, 'job_title', old_row.job_title,
                              'department_id', old_row.department_id, 'manager_id', old_row.manager_id, 'role', old_row.role),
    'new', jsonb_build_object('full_name', p_full_name, 'job_title', p_job_title,
                              'department_id', p_department_id, 'manager_id', p_manager_id, 'role', p_role)));

  if old_row.role <> p_role then
    perform app.notify(p_user, 'role', 'Your role changed', 'You are now ' || p_role::text || '. Sign in again to refresh access.', 'users', p_user);
  end if;
end $$;

grant execute on function public.admin_update_person(uuid, text, text, uuid, uuid, public.app_role) to authenticated;
revoke execute on function public.admin_update_person(uuid, text, text, uuid, uuid, public.app_role) from public, anon;

-- ---------- delete a person (Boss) ----------
-- Removing the auth.users row cascades to public.users and every dependent
-- record (tasks, feedback, complaints, audit actor refs, etc. per existing FKs).
create or replace function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u public.users;
begin
  if not app.is_boss() then raise exception 'Only the Boss can remove accounts' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You cannot delete your own account'; end if;
  select * into u from public.users where id = p_user for update;
  if not found then raise exception 'Person not found'; end if;
  perform app.audit('user.delete', 'users', p_user, jsonb_build_object('full_name', u.full_name, 'email', u.email, 'role', u.role));
  delete from auth.users where id = p_user;
end $$;

grant execute on function public.admin_delete_user(uuid) to authenticated;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
