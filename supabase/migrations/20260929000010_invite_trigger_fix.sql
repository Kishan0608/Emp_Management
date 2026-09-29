-- 010: Supabase Auth inserts the auth user BEFORE attaching app_metadata, so the
-- "invited" check in the trigger rejected every invited account ("Database error
-- creating new user"). The check is no longer needed: every new account starts
-- 'invited' with NO access, and can only become usable with a Boss-issued
-- activation key + Boss approval. A self-signup therefore gets nothing.
create or replace function app.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_first boolean;
begin
  select not exists (select 1 from public.users) into v_first;
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
