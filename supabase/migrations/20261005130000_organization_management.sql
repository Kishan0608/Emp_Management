-- =====================================================================
-- 040 ORGANIZATION MANAGEMENT (EDIT & DELETE)
-- Support editing and deleting organization entities for Boss/Admin.
-- =====================================================================

-- Allow Boss to delete organizations
drop policy if exists orgs_boss_delete on public.organizations;
create policy orgs_boss_delete on public.organizations for delete using (app.is_boss());

grant delete on public.organizations to authenticated;

-- Helper to update organization (Boss only)
create or replace function public.update_organization(p_id uuid, p_name text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_boss() then raise exception 'Only the Boss can edit organizations' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Organization name must be at least 2 characters'; end if;
  
  update public.organizations
  set name = trim(p_name)
  where id = p_id;
  
  return true;
end $$;
grant execute on function public.update_organization(uuid, text) to authenticated;

-- Helper to delete organization (Boss only)
create or replace function public.delete_organization(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user_count int;
begin
  if not app.is_boss() then raise exception 'Only the Boss can delete organizations' using errcode = '42501'; end if;
  
  select count(*) into v_user_count
  from public.users
  where organization_id = p_id;
  
  if v_user_count > 0 then
    raise exception 'Cannot delete company: % employee(s) are currently assigned to it', v_user_count;
  end if;

  -- Delete associated departments or detach them
  update public.departments set organization_id = null where organization_id = p_id;

  -- Soft delete / hard delete
  delete from public.organizations where id = p_id;
  if not found then
    update public.organizations set is_active = false where id = p_id;
  end if;

  return true;
end $$;
grant execute on function public.delete_organization(uuid) to authenticated;
