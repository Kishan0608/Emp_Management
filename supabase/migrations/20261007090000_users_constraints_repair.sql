-- =====================================================================
-- 033 USERS: repair two constraints
--
-- 1. app.handle_new_auth_user() inserts with `on conflict (email)`, which
--    needs a unique constraint on users.email. There was none, so the insert
--    errored, the trigger's exception handler swallowed it, and every new
--    sign-in account (app sign-up, invite, Google) ended up with no profile.
-- 2. users_id_fkey pointed at public.users(id) itself instead of
--    auth.users(id), so deleting a sign-in account no longer removed its
--    profile (the original 001 design: references auth.users on delete cascade).
-- Emails are stored lower-cased by every writer, so a plain unique index is enough.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.users'::regclass and conname = 'users_email_key') then
    alter table public.users add constraint users_email_key unique (email);
  end if;
end $$;

alter table public.users drop constraint if exists users_id_fkey;
alter table public.users
  add constraint users_id_fkey foreign key (id) references auth.users(id) on delete cascade;
