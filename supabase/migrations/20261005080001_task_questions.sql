-- Task Questions: Allow asking questions directly on a task, routing to assigned person or assigner with notifications and replies

create table if not exists public.task_questions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  recipient_id uuid references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  replies jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_questions_task_idx on public.task_questions(task_id, created_at asc);

alter table public.task_questions enable row level security;

create policy "task_questions_select" on public.task_questions
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_questions.task_id
    )
  );

create policy "task_questions_insert" on public.task_questions
  for insert to authenticated
  with check (author_id = auth.uid());

create policy "task_questions_update" on public.task_questions
  for update to authenticated
  using (
    author_id = auth.uid()
    or recipient_id = auth.uid()
    or exists (
      select 1 from public.tasks t
      where t.id = task_questions.task_id
        and (t.assignee_id = auth.uid() or t.created_by = auth.uid() or t.reviewer_id = auth.uid())
    )
  );

grant select, insert, update on public.task_questions to authenticated;

-- Helper to safely send notification without crashing
create or replace function public.send_task_notification(
  p_recipient uuid,
  p_title text,
  p_body text,
  p_task uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient is null or p_recipient = auth.uid() then
    return;
  end if;
  insert into public.notifications (user_id, kind, title, body, ref_table, ref_id)
  values (p_recipient, 'task_question', p_title, p_body, 'tasks', p_task);
exception when others then
  -- Ignore notification failures so main operation succeeds
  null;
end;
$$;

grant execute on function public.send_task_notification(uuid, text, text, uuid) to authenticated;

-- Ask a question on a task
create or replace function public.ask_task_question(
  p_task uuid,
  p_title text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task record;
  v_recipient uuid;
  v_author_name text;
  v_question_id uuid;
begin
  select id, title, assignee_id, created_by, reviewer_id
  into v_task
  from public.tasks
  where id = p_task;

  if not found then
    raise exception 'Task not found';
  end if;

  if auth.uid() = v_task.assignee_id then
    v_recipient := coalesce(v_task.created_by, v_task.reviewer_id);
  else
    v_recipient := v_task.assignee_id;
  end if;

  select coalesce(full_name, 'A team member')
  into v_author_name
  from public.users
  where id = auth.uid();

  insert into public.task_questions (task_id, author_id, recipient_id, title, body, status, replies)
  values (p_task, auth.uid(), v_recipient, trim(p_title), trim(p_body), 'open', '[]'::jsonb)
  returning id into v_question_id;

  perform public.send_task_notification(
    v_recipient,
    'Question on task: ' || v_task.title,
    v_author_name || ' asked: "' || trim(p_title) || '"',
    p_task
  );

  return v_question_id;
end;
$$;

grant execute on function public.ask_task_question(uuid, text, text) to authenticated;

-- Reply to a task question
create or replace function public.reply_task_question(
  p_question_id uuid,
  p_body text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q record;
  v_author_name text;
  v_new_reply jsonb;
  v_notify_to uuid;
begin
  select q.*, t.title as task_title
  into v_q
  from public.task_questions q
  join public.tasks t on t.id = q.task_id
  where q.id = p_question_id;

  if not found then
    raise exception 'Question not found';
  end if;

  select coalesce(full_name, 'Someone')
  into v_author_name
  from public.users
  where id = auth.uid();

  v_new_reply := jsonb_build_object(
    'id', gen_random_uuid(),
    'author_id', auth.uid(),
    'author_name', v_author_name,
    'body', trim(p_body),
    'created_at', now()
  );

  update public.task_questions
  set replies = coalesce(replies, '[]'::jsonb) || jsonb_build_array(v_new_reply),
      status = 'answered',
      updated_at = now()
  where id = p_question_id;

  if auth.uid() = v_q.author_id then
    v_notify_to := v_q.recipient_id;
  else
    v_notify_to := v_q.author_id;
  end if;

  perform public.send_task_notification(
    v_notify_to,
    'Reply on task question: ' || v_q.title,
    v_author_name || ': "' || left(trim(p_body), 100) || '"',
    v_q.task_id
  );

  return true;
end;
$$;

grant execute on function public.reply_task_question(uuid, text) to authenticated;

-- Get task questions with user details
create or replace function public.get_task_questions(p_task uuid)
returns table (
  id uuid,
  task_id uuid,
  author_id uuid,
  recipient_id uuid,
  title text,
  body text,
  status text,
  replies jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  author_name text,
  recipient_name text
)
language sql
security definer
set search_path = public
as $$
  select
    q.id,
    q.task_id,
    q.author_id,
    q.recipient_id,
    q.title,
    q.body,
    q.status,
    q.replies,
    q.created_at,
    q.updated_at,
    coalesce(u_author.full_name, 'Unknown') as author_name,
    coalesce(u_recipient.full_name, 'Unknown') as recipient_name
  from public.task_questions q
  left join public.users u_author on u_author.id = q.author_id
  left join public.users u_recipient on u_recipient.id = q.recipient_id
  where q.task_id = p_task
  order by q.created_at desc;
$$;

grant execute on function public.get_task_questions(uuid) to authenticated;
