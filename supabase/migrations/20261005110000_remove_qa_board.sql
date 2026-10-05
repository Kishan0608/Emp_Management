-- =====================================================================
-- REMOVE THE Q&A BOARD
-- Drops publishing of feedback answers: the is_published column, the
-- publish RPC, the publish argument on reply_feedback, and the read
-- policy clause that exposed published items to everyone.
-- =====================================================================

-- 1. Read policy: drop the published clause before the column goes.
drop policy if exists feedback_read on public.feedback_items;
create policy feedback_read on public.feedback_items for select to authenticated using (
  app.is_active_user() and (
    author_id = auth.uid()
    or app.is_boss()
    or app.is_hr()
    or (app.uid_role() = 'manager' and recipient_manager_id = auth.uid() and audience in ('manager','all'))
  )
);

-- 2. Publish RPC and the publish argument on reply_feedback.
drop function if exists public.set_feedback_published(uuid, boolean);
drop function if exists public.reply_feedback(uuid, text, boolean);

-- Feedback reply: appends the reply JSON into feedback_items.replies
create or replace function public.reply_feedback(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  f public.feedback_items;
  u public.users;
  me uuid := auth.uid();
  v_new_reply jsonb;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into f from public.feedback_items where id = p_id;
  if not found then raise exception 'Feedback not found'; end if;
  select * into u from public.users where id = me;

  v_new_reply := jsonb_build_object(
    'id', extensions.gen_random_uuid(),
    'feedback_id', p_id,
    'responder_id', me,
    'body', trim(p_body),
    'created_at', now(),
    'responder', jsonb_build_object('full_name', u.full_name, 'role', u.role)
  );

  update public.feedback_items set
    status      = case when status = 'open' then 'answered' else status end,
    answered_at = coalesce(answered_at, now()),
    updated_at  = now(),
    replies     = coalesce(replies, '[]'::jsonb) || jsonb_build_array(v_new_reply)
  where id = p_id;

  if f.author_id is not null and f.author_id <> me then
    perform app.notify(f.author_id, 'feedback_reply', 'New reply on your ' || f.type,
      left(trim(p_body), 120), 'feedback_items', p_id);
  end if;
end $$;

-- 3. The column itself.
alter table public.feedback_items drop column if exists is_published;
