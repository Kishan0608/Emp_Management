-- =====================================================================
-- DEMO SEED DATA: one account per role. Password for all: Demo@2026
-- DELETE THESE ACCOUNTS BEFORE GOING LIVE.
-- =====================================================================
do $$
declare
  v_eng uuid; v_ops uuid; v_hrd uuid;
  v_boss uuid := 'a0000000-0000-4000-8000-000000000001';
  v_hr   uuid := 'a0000000-0000-4000-8000-000000000002';
  v_mgr  uuid := 'a0000000-0000-4000-8000-000000000003';
  v_e1   uuid := 'a0000000-0000-4000-8000-000000000004';
  v_e2   uuid := 'a0000000-0000-4000-8000-000000000005';
  v_e3   uuid := 'a0000000-0000-4000-8000-000000000006';
  r record;
  v_task uuid;
begin
  insert into public.departments (name) values ('Engineering') returning id into v_eng;
  insert into public.departments (name) values ('Operations') returning id into v_ops;
  insert into public.departments (name) values ('Human Resources') returning id into v_hrd;
  update public.app_settings set company_name = 'Shree Karni Fabcom Ltd' where id = 1;

  for r in select * from (values
      (v_boss, 'boss@example.com',     'Aarav Shah'),
      (v_hr,   'hr@example.com',       'Priya Nair'),
      (v_mgr,  'manager@example.com',  'Rohan Mehta'),
      (v_e1,   'neha@example.com',     'Neha Patel'),
      (v_e2,   'karan@example.com',    'Karan Desai'),
      (v_e3,   'sneha@example.com',    'Sneha Iyer')) as t(id, email, name)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change,
                            email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated', r.email,
            extensions.crypt('Demo@2026', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"],"invited":true}'::jsonb,
            jsonb_build_object('full_name', r.name), now(), now(), '', '', '', '', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), r.id, r.id::text,
            jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true),
            'email', now(), now(), now());
  end loop;

  update public.users set role = 'boss',    department_id = null,  job_title = 'Managing Director' where id = v_boss;
  update public.users set role = 'hr',      department_id = v_hrd, job_title = 'HR Lead', is_case_handler = true where id = v_hr;
  update public.users set role = 'manager', department_id = v_eng, job_title = 'Engineering Manager' where id = v_mgr;
  update public.users set role = 'employee', department_id = v_eng, manager_id = v_mgr, job_title = 'Software Engineer'  where id = v_e1;
  update public.users set role = 'employee', department_id = v_eng, manager_id = v_mgr, job_title = 'QA Engineer'        where id = v_e2;
  update public.users set role = 'employee', department_id = v_ops, manager_id = v_mgr, job_title = 'Operations Analyst' where id = v_e3;

  update public.employee_details set phone = '+91 98' || lpad((row_number)::text, 8, '0'),
         salary_monthly = 45000 + row_number * 5000, attendance_pct = 90 + row_number, performance_rating = 3.5 + (row_number % 3) * 0.5,
         joined_on = current_date - (row_number * 120)::int
  from (select user_id as uid, row_number() over (order by user_id) as row_number from public.employee_details) x
  where employee_details.user_id = x.uid;

  insert into public.committee_members (user_id, added_by) values (v_hr, v_boss);

  -- Default visibility (the Boss can change all of these in the app)
  insert into public.visibility_rules (viewer_role, field_name, allowed, set_by) values
    ('hr', 'contact', true, v_boss), ('hr', 'attendance', true, v_boss), ('hr', 'task_history', true, v_boss),
    ('hr', 'performance', true, v_boss), ('hr', 'salary', false, v_boss),
    ('manager', 'task_history', true, v_boss), ('manager', 'performance', true, v_boss),
    ('manager', 'contact', false, v_boss), ('manager', 'salary', false, v_boss), ('manager', 'attendance', false, v_boss);

  -- Sample tasks
  insert into public.tasks (title, description, priority, due_date, visibility, created_by, assignee_id, reviewer_id, status, checklist)
  values ('Prepare Q3 release notes', 'Summarise all features shipped this quarter for the client update.', 'high', current_date + 3, 'team',
          v_mgr, v_e1, v_mgr, 'in_progress', '[{"text":"Collect merged PRs","done":true},{"text":"Draft notes","done":false},{"text":"Manager review","done":false}]')
  returning id into v_task;
  insert into public.task_events (task_id, actor_id, from_status, to_status, note, created_at) values
    (v_task, v_mgr, null, 'assigned', 'Task created', now() - interval '2 days'),
    (v_task, v_e1, 'assigned', 'accepted', null, now() - interval '2 days' + interval '1 hour'),
    (v_task, v_e1, 'accepted', 'in_progress', null, now() - interval '1 day');

  insert into public.tasks (title, description, priority, due_date, visibility, created_by, assignee_id, reviewer_id, status)
  values ('Regression test the payments module', 'Full regression before Friday deploy.', 'urgent', current_date + 1, 'team',
          v_mgr, v_e2, v_mgr, 'assigned') returning id into v_task;
  insert into public.task_events (task_id, actor_id, to_status, note) values (v_task, v_mgr, 'assigned', 'Task created');

  insert into public.tasks (title, description, priority, due_date, visibility, created_by, assignee_id, reviewer_id, status, submitted_at)
  values ('Vendor invoice reconciliation', 'Match September invoices with purchase orders.', 'medium', current_date - 1, 'private',
          v_hr, v_e3, v_hr, 'submitted', now() - interval '3 hours') returning id into v_task;
  insert into public.task_events (task_id, actor_id, from_status, to_status, note, created_at) values
    (v_task, v_hr, null, 'assigned', 'Task created', now() - interval '4 days'),
    (v_task, v_e3, 'assigned', 'in_progress', null, now() - interval '3 days'),
    (v_task, v_e3, 'in_progress', 'submitted', 'Reconciled 48 of 48 invoices. Sheet shared on drive.', now() - interval '3 hours');

  insert into public.tasks (title, priority, due_date, created_by, assignee_id, reviewer_id, is_personal)
  values ('Book dentist appointment', 'low', current_date + 5, v_e1, v_e1, v_e1, true) returning id into v_task;
  insert into public.task_events (task_id, actor_id, to_status, note) values (v_task, v_e1, 'assigned', 'Task created');

  -- Sample feedback + a published Q&A answer
  insert into public.feedback_items (type, audience, title, body, author_id, recipient_manager_id, department_id, status, is_published, answered_at, acknowledged_at)
  values ('question', 'hr', 'How do I claim travel reimbursement?', 'I travelled to the client site last week. What is the process and deadline for claims?',
          v_e1, v_mgr, v_eng, 'answered', true, now(), now())
  returning id into v_task;
  insert into public.feedback_replies (feedback_id, responder_id, body)
  values (v_task, v_hr, 'Upload bills in the expense portal within 30 days of travel. Your manager approves, and payment is made with the next salary.');

  insert into public.feedback_items (type, audience, title, body, is_anonymous, recipient_manager_id, department_id)
  values ('feedback', 'manager', 'Stand-ups run too long', 'Daily stand-ups often go past 30 minutes. Could we time-box them to 15?', true, v_mgr, v_eng);
end $$;
