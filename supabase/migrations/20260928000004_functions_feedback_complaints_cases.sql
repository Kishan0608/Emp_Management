-- =====================================================================
-- 004 FUNCTIONS: feedback, complaints, disciplinary cases, POSH lane,
--     retention, scheduled jobs, dashboard, grants
-- =====================================================================

-- ---------- feedback ----------
create or replace function public.submit_feedback(
  p_type public.feedback_type, p_audience public.feedback_audience, p_title text, p_body text,
  p_anonymous boolean default false, p_task uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 5 then raise exception 'Please write a little more detail'; end if;
  if p_type = 'blocker' and p_anonymous then raise exception 'Blockers cannot be anonymous: someone has to unblock you'; end if;
  if p_task is not null and not exists (select 1 from public.tasks t where t.id = p_task and t.assignee_id = auth.uid()) then
    raise exception 'You can only link your own tasks';
  end if;
  return app.create_feedback(auth.uid(), p_type, p_audience, p_title, p_body, p_anonymous, p_task);
end $$;

create or replace function app.can_respond_feedback(f public.feedback_items) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_boss() or app.is_hr()
      or (app.uid_role() = 'manager' and f.recipient_manager_id = auth.uid() and f.audience in ('manager','all'))
$$;

create or replace function public.reply_feedback(p_id uuid, p_body text, p_publish boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.feedback_items; v_responder boolean; v_name text;
begin
  select * into f from public.feedback_items where id = p_id for update;
  if not found then raise exception 'Item not found'; end if;
  v_responder := app.can_respond_feedback(f);
  if not (v_responder or f.author_id = auth.uid()) then raise exception 'You cannot reply to this item' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 2 then raise exception 'Reply is empty'; end if;

  insert into public.feedback_replies (feedback_id, responder_id, body) values (p_id, auth.uid(), trim(p_body));

  if v_responder and f.author_id is distinct from auth.uid() then
    update public.feedback_items set
      status = case when status = 'resolved' then status else 'answered' end,
      answered_at = coalesce(answered_at, now()),
      acknowledged_at = coalesce(acknowledged_at, now()),
      is_published = case when p_publish and type = 'question' then true else is_published end
    where id = p_id;
    select full_name into v_name from public.users where id = auth.uid();
    perform app.notify(f.author_id, 'feedback_reply', v_name || ' replied', f.title, 'feedback_items', p_id);
  else
    perform app.notify(f.recipient_manager_id, 'feedback_reply', 'New follow-up', f.title, 'feedback_items', p_id);
  end if;
end $$;

create or replace function public.set_feedback_status(p_id uuid, p_status public.feedback_status) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.feedback_items;
begin
  select * into f from public.feedback_items where id = p_id for update;
  if not found then raise exception 'Item not found'; end if;
  if not (app.can_respond_feedback(f) or (f.author_id = auth.uid() and p_status = 'resolved')) then
    raise exception 'You cannot change this item' using errcode = '42501';
  end if;
  update public.feedback_items set
    status = p_status,
    acknowledged_at = case when p_status <> 'open' then coalesce(acknowledged_at, now()) else acknowledged_at end,
    resolved_at = case when p_status = 'resolved' then now() else null end
  where id = p_id;
  perform app.notify(f.author_id, 'feedback_status', 'Status: ' || p_status::text, f.title, 'feedback_items', p_id);
end $$;

create or replace function public.set_feedback_published(p_id uuid, p_published boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Only Boss or HR can publish to the Q&A board' using errcode = '42501'; end if;
  update public.feedback_items set is_published = p_published
   where id = p_id and type = 'question' and status in ('answered','resolved');
  if not found then raise exception 'Only answered questions can be published'; end if;
end $$;

-- Blockers: manager at once, HR after N hours, Boss after M hours (scheduled every 15 min).
create or replace function app.escalate_blockers() returns void
language plpgsql security definer set search_path = '' as $$
declare s public.app_settings; r record;
begin
  select * into s from public.app_settings where id = 1;
  for r in
    update public.feedback_items set escalation_level = 1
     where type = 'blocker' and status in ('open','acknowledged') and escalation_level = 0
       and created_at < now() - make_interval(hours => s.blocker_hr_hours)
    returning id, title
  loop
    perform app.notify_role('hr', 'blocker_escalated', 'Blocker escalated to HR', r.title, 'feedback_items', r.id);
  end loop;
  for r in
    update public.feedback_items set escalation_level = 2
     where type = 'blocker' and status in ('open','acknowledged') and escalation_level < 2
       and created_at < now() - make_interval(hours => s.blocker_boss_hours)
    returning id, title
  loop
    perform app.notify_role('boss', 'blocker_escalated', 'Blocker escalated to Boss', r.title, 'feedback_items', r.id);
  end loop;
end $$;

-- ---------- complaints: encryption keys live in Vault ----------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'complaint_enc_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'complaint_enc_key', 'Encrypts complaint and confidential report text');
  end if;
  if not exists (select 1 from vault.secrets where name = 'complaint_hmac_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'complaint_hmac_key', 'Keys the complaint dedupe hash');
  end if;
end $$;

-- Recompute a person's counters. Runs on insert/update of complaints.
create or replace function app.recompute_complaint_counts(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.app_settings;
  v_total int; v_credible int; v_pending int; v_distinct int;
  v_level public.flag_level;
begin
  select * into s from public.app_settings where id = 1;
  select count(*),
         count(*) filter (where triage_status = 'credible'),
         count(*) filter (where triage_status = 'pending'),
         count(distinct dedupe_hash) filter (where received_date >= current_date - s.window_days
                                             and triage_status not in ('duplicate','unsubstantiated','malicious'))
    into v_total, v_credible, v_pending, v_distinct
  from public.complaints where target_id = p_target;

  v_level := case when v_distinct >= s.red_threshold then 'red'
                  when v_distinct >= s.yellow_threshold then 'yellow'
                  else 'none' end;

  insert into public.complaint_counts as c (target_id, total_received, credible_count, pending_count, distinct_in_window, level, updated_on)
  values (p_target, v_total, v_credible, v_pending, v_distinct, v_level, current_date)
  on conflict (target_id) do update set
    total_received = excluded.total_received, credible_count = excluded.credible_count,
    pending_count = excluded.pending_count, distinct_in_window = excluded.distinct_in_window,
    level = excluded.level, updated_on = current_date,
    notified_level = case when excluded.level = 'none' then 'none' else c.notified_level end;
end $$;

create or replace function app.complaints_after_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.recompute_complaint_counts(new.target_id);
  return null;
end $$;
create trigger complaints_counts after insert or update on public.complaints
  for each row execute function app.complaints_after_change();

-- Called ONLY by the submit-complaint Edge Function with the service role.
-- The author id is used for the quota and the keyed hash, then discarded. It is never stored with the complaint.
create or replace function public.submit_complaint_internal(
  p_author uuid, p_target uuid, p_category public.complaint_category, p_description text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.app_settings;
  v_month date := date_trunc('month', current_date)::date;
  v_used int;
  v_hash text;
begin
  select * into s from public.app_settings where id = 1;
  if not exists (select 1 from public.users where id = p_author and is_active) then
    raise exception 'Account not active' using errcode = '42501';
  end if;
  if not exists (select 1 from public.users where id = p_target and is_active) then
    raise exception 'That person was not found';
  end if;
  if p_author = p_target then raise exception 'You cannot file a complaint about yourself'; end if;
  if char_length(trim(coalesce(p_description, ''))) < 20 then raise exception 'Please describe what happened (at least 20 characters)'; end if;
  if char_length(p_description) > 4000 then raise exception 'Description is too long (4000 characters max)'; end if;

  insert into public.complaint_quota as q (user_id, month, used) values (p_author, v_month, 1)
  on conflict (user_id, month) do update set used = q.used + 1 where q.used < s.monthly_complaint_quota
  returning used into v_used;
  if v_used is null then
    raise exception 'You have reached this month''s complaint limit (%)', s.monthly_complaint_quota;
  end if;

  v_hash := encode(extensions.hmac(p_author::text || ':' || p_target::text, app.secret('complaint_hmac_key'), 'sha256'), 'hex');

  insert into public.complaints (target_id, category, description_enc, dedupe_hash, received_date)
  values (p_target, p_category, extensions.pgp_sym_encrypt(trim(p_description), app.secret('complaint_enc_key')), v_hash, current_date);

  return jsonb_build_object('ok', true, 'remaining', s.monthly_complaint_quota - v_used);
end $$;

create or replace function public.my_complaint_quota() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'limit', s.monthly_complaint_quota,
    'used', coalesce((select q.used from public.complaint_quota q
                      where q.user_id = auth.uid() and q.month = date_trunc('month', current_date)::date), 0))
  from public.app_settings s where s.id = 1
$$;

-- Tells the submitter if the person's team is small enough that anonymity may be weak.
create or replace function public.complaint_target_context(p_target uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'group_size', (select count(*) from public.users x where x.is_active and x.department_id = t.department_id and x.id <> t.id),
    'min_group_size', s.min_group_size,
    'small_group', (select count(*) from public.users x where x.is_active and x.department_id = t.department_id and x.id <> t.id) < s.min_group_size)
  from public.users t, public.app_settings s
  where t.id = p_target and s.id = 1 and app.is_active_user()
$$;

-- HR case handler: reads text (decrypted here), never identity. Every view is audited.
create or replace function public.hr_list_complaints(p_status public.triage_status default null)
returns table (id uuid, target_id uuid, target_name text, target_role public.app_role, category public.complaint_category,
               description text, received_date date, triage_status public.triage_status, triage_note text)
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_case_handler() then raise exception 'Only the HR case handler can read complaints' using errcode = '42501'; end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id)
  select auth.uid(), 'complaint.view', 'complaints', c.id
  from public.complaints c
  where c.target_id <> auth.uid() and (p_status is null or c.triage_status = p_status);

  return query
  select c.id, c.target_id, u.full_name, u.role, c.category,
         extensions.pgp_sym_decrypt(c.description_enc, app.secret('complaint_enc_key')),
         c.received_date, c.triage_status, c.triage_note
  from public.complaints c join public.users u on u.id = c.target_id
  where c.target_id <> auth.uid()                       -- a handler never sees complaints about themselves
    and (p_status is null or c.triage_status = p_status)
  order by c.received_date desc, c.id;
end $$;

create or replace function public.hr_triage_complaint(p_id uuid, p_status public.triage_status, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_case_handler() then raise exception 'Only the HR case handler can triage' using errcode = '42501'; end if;
  if p_status = 'pending' then raise exception 'Pick a triage result'; end if;
  update public.complaints set triage_status = p_status, triage_note = nullif(trim(p_note), ''), triaged_by = auth.uid()
   where id = p_id and target_id <> auth.uid();
  if not found then raise exception 'Complaint not found'; end if;
  perform app.audit('complaint.triage', 'complaints', p_id, jsonb_build_object('status', p_status));
end $$;

-- Boss / case handler: numbers only.
create or replace function public.complaint_overview()
returns table (target_id uuid, full_name text, job_title text, role public.app_role, department text,
               total_received int, credible_count int, pending_count int, distinct_in_window int,
               level public.flag_level, open_case_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.is_boss() or app.is_case_handler()) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
  select c.target_id, u.full_name, u.job_title, u.role, d.name,
         c.total_received, c.credible_count, c.pending_count, c.distinct_in_window, c.level,
         (select k.id from public.disciplinary_cases k where k.target_id = c.target_id and k.closed_at is null)
  from public.complaint_counts c
  join public.users u on u.id = c.target_id
  left join public.departments d on d.id = u.department_id
  where c.total_received > 0
    and (app.is_boss() or c.target_id <> auth.uid())
  order by case c.level when 'red' then 0 when 'yellow' then 1 else 2 end, c.distinct_in_window desc;
end $$;

-- Daily batch: alert about new yellow/red flags without revealing the time a complaint arrived.
create or replace function app.daily_flag_digest() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    update public.complaint_counts c set notified_level = c.level
     where c.level <> 'none' and c.level <> c.notified_level
       and (c.notified_level = 'none' or c.level = 'red')
    returning c.target_id, c.level
  loop
    if r.level = 'red' then
      perform app.notify_role('boss', 'complaint_flag', 'Red flag: ' || (select full_name from public.users where id = r.target_id),
        'Complaint threshold reached. You can open a disciplinary case.', 'users', r.target_id, r.target_id);
    end if;
    insert into public.notifications (user_id, kind, title, body, ref_table, ref_id)
    select u.id, 'complaint_flag', initcap(r.level::text) || ' flag: ' || (select full_name from public.users where id = r.target_id),
           'Review the pattern of complaints.', 'users', r.target_id
    from public.users u where u.role = 'hr' and u.is_case_handler and u.is_active and u.id <> r.target_id;
  end loop;
end $$;

-- ---------- disciplinary cases ----------
create or replace function public.open_case(p_target uuid, p_summary text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.is_boss() then raise exception 'Only the Boss can open a case' using errcode = '42501'; end if;
  if not exists (select 1 from public.complaint_counts c where c.target_id = p_target and c.level = 'red') then
    raise exception 'A case can only be opened when the employee is at the red level';
  end if;
  if char_length(trim(coalesce(p_summary, ''))) < 10 then raise exception 'Write a short summary of the concern'; end if;
  insert into public.disciplinary_cases (target_id, opened_by, summary) values (p_target, auth.uid(), trim(p_summary)) returning id into v_id;
  insert into public.case_documents (case_id, stage, doc_type, title, body, created_by)
  values (v_id, 'preliminary_inquiry', 'note', 'Case opened', trim(p_summary), auth.uid());
  insert into public.notifications (user_id, kind, title, body, ref_table, ref_id)
  select u.id, 'case_opened', 'Case opened: preliminary inquiry', 'Gather independent evidence before any notice.', 'disciplinary_cases', v_id
  from public.users u where u.role = 'hr' and u.is_case_handler and u.is_active and u.id <> p_target;
  perform app.audit('case.open', 'disciplinary_cases', v_id, jsonb_build_object('target', p_target));
  return v_id;
end $$;

-- Moves a case one stage forward, attaching the document that stage needs.
create or replace function public.advance_case(p_case uuid, p_title text, p_body text, p_penalty public.penalty_type default null)
returns public.case_stage
language plpgsql security definer set search_path = '' as $$
declare
  k public.disciplinary_cases;
  v_next public.case_stage;
  v_doc text;
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into k from public.disciplinary_cases where id = p_case for update;
  if not found then raise exception 'Case not found'; end if;
  if k.target_id = auth.uid() then raise exception 'You cannot act on your own case' using errcode = '42501'; end if;
  if k.closed_at is not null then raise exception 'Case is closed'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 10 then raise exception 'The stage document needs real content'; end if;

  v_next := case k.stage
    when 'preliminary_inquiry' then 'show_cause'
    when 'show_cause'          then 'employee_reply'
    when 'employee_reply'      then 'domestic_inquiry'
    when 'domestic_inquiry'    then 'findings'
    when 'findings'            then 'penalty'
    when 'penalty'             then 'written_order'
    when 'written_order'       then 'closed'
  end;
  v_doc := case v_next
    when 'show_cause'       then 'show_cause'
    when 'employee_reply'   then 'note'            -- used when the employee did not reply in time
    when 'domestic_inquiry' then 'inquiry_record'
    when 'findings'         then 'findings'
    when 'penalty'          then 'penalty_decision'
    when 'written_order'    then 'written_order'
    else 'note'
  end;

  if v_next in ('penalty','written_order','closed') and not app.is_boss() then
    raise exception 'Only the Boss can decide the penalty and issue the order' using errcode = '42501';
  end if;
  if v_next = 'penalty' and p_penalty is null then
    raise exception 'Choose a penalty (or "none")';
  end if;
  if v_next = 'closed' and k.penalty = 'termination' then
    raise exception 'Termination cases are closed by the Terminate action';
  end if;

  update public.disciplinary_cases set
    stage = v_next,
    penalty = case when v_next = 'penalty' then p_penalty else penalty end,
    closed_at = case when v_next = 'closed' then now() else null end
  where id = p_case;

  insert into public.case_documents (case_id, stage, doc_type, title, body, created_by)
  values (p_case, v_next, v_doc, coalesce(nullif(trim(p_title), ''), initcap(replace(v_next::text, '_', ' '))), trim(p_body), auth.uid());

  if v_next = 'show_cause' then
    perform app.notify(k.target_id, 'case_notice', 'Show-cause notice issued', 'Please read the notice and submit your written reply.', 'disciplinary_cases', p_case);
  elsif v_next in ('findings','written_order') then
    perform app.notify(k.target_id, 'case_update', 'Case update: ' || replace(v_next::text, '_', ' '), 'A new document is available.', 'disciplinary_cases', p_case);
  end if;
  perform app.audit('case.advance', 'disciplinary_cases', p_case, jsonb_build_object('from', k.stage, 'to', v_next, 'penalty', p_penalty));
  return v_next;
end $$;

create or replace function public.submit_case_reply(p_case uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare k public.disciplinary_cases;
begin
  select * into k from public.disciplinary_cases where id = p_case for update;
  if not found or k.target_id <> auth.uid() then raise exception 'Case not found' using errcode = '42501'; end if;
  if k.stage <> 'show_cause' then raise exception 'A reply can only be submitted after a show-cause notice'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 20 then raise exception 'Please write your full reply'; end if;
  insert into public.case_documents (case_id, stage, doc_type, title, body, created_by)
  values (p_case, 'employee_reply', 'reply', 'Employee reply', trim(p_body), auth.uid());
  update public.disciplinary_cases set stage = 'employee_reply' where id = p_case;
  insert into public.notifications (user_id, kind, title, body, ref_table, ref_id)
  select u.id, 'case_reply', 'Employee replied to show-cause', null, 'disciplinary_cases', p_case
  from public.users u where u.is_active and (u.role = 'boss' or (u.role = 'hr' and u.is_case_handler)) and u.id <> k.target_id;
  perform app.audit('case.reply', 'disciplinary_cases', p_case);
end $$;

create or replace function public.add_case_note(p_case uuid, p_title text, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare k public.disciplinary_cases;
begin
  if not (app.is_boss() or app.is_hr()) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into k from public.disciplinary_cases where id = p_case;
  if not found or k.target_id = auth.uid() then raise exception 'Case not found'; end if;
  insert into public.case_documents (case_id, stage, doc_type, title, body, created_by)
  values (p_case, k.stage, 'note', coalesce(nullif(trim(p_title), ''), 'Note'), trim(p_body), auth.uid());
end $$;

-- Terminate is only possible at the written-order stage of a termination case. Never automatic.
create or replace function public.terminate_employee(p_case uuid, p_confirm_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare k public.disciplinary_cases; v_name text;
begin
  if not app.is_boss() then raise exception 'Only the Boss can terminate' using errcode = '42501'; end if;
  select * into k from public.disciplinary_cases where id = p_case for update;
  if not found then raise exception 'Case not found'; end if;
  if k.stage <> 'written_order' or k.penalty <> 'termination' then
    raise exception 'Terminate unlocks only after a written order with a termination penalty';
  end if;
  select full_name into v_name from public.users where id = k.target_id;
  if lower(trim(p_confirm_name)) <> lower(v_name) then raise exception 'Type the employee''s full name to confirm'; end if;

  update public.users set is_active = false where id = k.target_id;
  update public.disciplinary_cases set stage = 'closed', closed_at = now(), terminated_at = now() where id = p_case;
  update auth.users set banned_until = 'infinity' where id = k.target_id;
  delete from auth.sessions where user_id = k.target_id;
  perform app.audit('employee.terminate', 'users', k.target_id, jsonb_build_object('case', p_case));
end $$;

-- ---------- POSH confidential lane ----------
create or replace function public.submit_confidential_report(p_target uuid, p_incident_date date, p_statement text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_statement, ''))) < 30 then raise exception 'Please describe the incident in your statement'; end if;
  if not exists (select 1 from public.committee_members) then
    raise exception 'No Internal Committee is set up yet. Please contact HR directly.';
  end if;
  insert into public.confidential_reports (reporter_id, target_id, incident_date, statement_enc)
  values (auth.uid(), p_target, p_incident_date, extensions.pgp_sym_encrypt(trim(p_statement), app.secret('complaint_enc_key')))
  returning id into v_id;
  insert into public.notifications (user_id, kind, title, body, ref_table, ref_id)
  select c.user_id, 'confidential_report', 'New confidential report', 'Open the committee inbox.', 'confidential_reports', v_id
  from public.committee_members c join public.users u on u.id = c.user_id
  where u.is_active and c.user_id is distinct from p_target;
  return v_id;
end $$;

create or replace function public.my_confidential_reports()
returns table (id uuid, target_name text, incident_date date, committee_status text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, u.full_name, r.incident_date, r.committee_status, r.created_at
  from public.confidential_reports r left join public.users u on u.id = r.target_id
  where r.reporter_id = auth.uid() order by r.created_at desc
$$;

create or replace function public.committee_list_reports()
returns table (id uuid, reporter_name text, target_name text, incident_date date, statement text, committee_status text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_committee() then raise exception 'Only Internal Committee members can read these reports' using errcode = '42501'; end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id)
  select auth.uid(), 'confidential.view', 'confidential_reports', r.id from public.confidential_reports r
  where r.target_id is distinct from auth.uid();
  return query
  select r.id, rp.full_name, t.full_name, r.incident_date,
         extensions.pgp_sym_decrypt(r.statement_enc, app.secret('complaint_enc_key')), r.committee_status, r.created_at
  from public.confidential_reports r
  join public.users rp on rp.id = r.reporter_id
  left join public.users t on t.id = r.target_id
  where r.target_id is distinct from auth.uid()
  order by r.created_at desc;
end $$;

create or replace function public.committee_update_report(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.confidential_reports;
begin
  if not app.is_committee() then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.confidential_reports set committee_status = p_status
   where id = p_id and target_id is distinct from auth.uid() returning * into r;
  if not found then raise exception 'Report not found'; end if;
  perform app.notify(r.reporter_id, 'confidential_status', 'Your confidential report: ' || replace(p_status, '_', ' '), null, 'confidential_reports', p_id);
  perform app.audit('confidential.status', 'confidential_reports', p_id, jsonb_build_object('status', p_status));
end $$;

-- ---------- retention (DPDP) ----------
create or replace function app.purge_expired() returns void
language plpgsql security definer set search_path = '' as $$
declare s public.app_settings; v_targets uuid[];
begin
  select * into s from public.app_settings where id = 1;
  with gone as (
    delete from public.complaints
     where received_date < current_date - s.retention_complaint_days and triage_status <> 'pending'
    returning target_id)
  select array_agg(distinct target_id) into v_targets from gone;
  if v_targets is not null then
    perform app.recompute_complaint_counts(t) from unnest(v_targets) t;
  end if;
  delete from public.complaint_quota where month < (date_trunc('month', current_date) - interval '13 months')::date;
  delete from public.notifications where is_read and created_at < now() - interval '180 days';
  delete from public.audit_logs where created_at < now() - make_interval(days => s.retention_audit_days);
end $$;

-- ---------- scheduled jobs ----------
select cron.schedule('escalate-blockers', '*/15 * * * *', $$select app.escalate_blockers()$$);
select cron.schedule('daily-flag-digest', '30 3 * * *',  $$select app.daily_flag_digest()$$);   -- 09:00 IST
select cron.schedule('purge-expired',     '0 21 * * *',  $$select app.purge_expired()$$);      -- 02:30 IST

-- ---------- dashboard ----------
create or replace function public.dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.app_role := app.uid_role();
  me uuid := auth.uid();
  result jsonb;
begin
  if v_role is null then raise exception 'Not signed in' using errcode = '42501'; end if;

  result := jsonb_build_object(
    'my_tasks', (select jsonb_build_object(
        'open',      count(*) filter (where status not in ('approved','closed')),
        'due_today', count(*) filter (where status not in ('approved','closed') and due_date = current_date),
        'overdue',   count(*) filter (where status not in ('approved','closed') and due_date < current_date),
        'to_review', (select count(*) from public.tasks r where r.reviewer_id = me and r.status = 'submitted' and r.assignee_id <> me),
        'done_30d',  count(*) filter (where status in ('approved','closed') and approved_at > now() - interval '30 days'))
      from public.tasks where assignee_id = me),
    'unread_notifications', (select count(*) from public.notifications n where n.user_id = me and not n.is_read),
    'my_open_feedback', (select count(*) from public.feedback_items f where f.author_id = me and f.status <> 'resolved'));

  if v_role = 'manager' then
    result := result || jsonb_build_object('team', (select jsonb_build_object(
        'members',  (select count(*) from public.users u where u.manager_id = me and u.is_active),
        'open',     count(*) filter (where t.status not in ('approved','closed')),
        'blocked',  count(*) filter (where t.status = 'blocked'),
        'overdue',  count(*) filter (where t.status not in ('approved','closed') and t.due_date < current_date),
        'feedback_open', (select count(*) from public.feedback_items f where f.recipient_manager_id = me
                           and f.audience in ('manager','all') and f.status in ('open','acknowledged')))
      from public.tasks t join public.users u on u.id = t.assignee_id
      where u.manager_id = me and not t.is_personal));
  end if;

  if app.is_hr() or app.is_boss() then
    result := result || jsonb_build_object(
      'feedback_open',  (select count(*) from public.feedback_items where status in ('open','acknowledged')),
      'blockers_open',  (select count(*) from public.feedback_items where type = 'blocker' and status in ('open','acknowledged')),
      'open_cases',     (select count(*) from public.disciplinary_cases where closed_at is null));
  end if;

  if app.is_case_handler() then
    result := result || jsonb_build_object('complaints_pending',
      (select count(*) from public.complaints where triage_status = 'pending' and target_id <> me));
  end if;

  if app.is_boss() then
    result := result || jsonb_build_object(
      'headcount', (select jsonb_object_agg(role, n) from (select role, count(*) n from public.users where is_active group by role) x),
      'tasks_by_status', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.tasks where not is_personal group by status) x),
      'tasks_overdue', (select count(*) from public.tasks where not is_personal and status not in ('approved','closed') and due_date < current_date),
      'on_time_rate_30d', (select round(100.0 * count(*) filter (where due_date is null or approved_at::date <= due_date) / nullif(count(*), 0))
                           from public.tasks where not is_personal and approved_at > now() - interval '30 days'),
      'flags', (select jsonb_build_object('yellow', count(*) filter (where level = 'yellow'), 'red', count(*) filter (where level = 'red'))
                from public.complaint_counts),
      'by_department', (select coalesce(jsonb_agg(x order by x.name), '[]'::jsonb) from (
          select d.name,
                 count(t.id) filter (where t.status not in ('approved','closed')) as open,
                 count(t.id) filter (where t.status in ('approved','closed')) as done,
                 count(t.id) filter (where t.status not in ('approved','closed') and t.due_date < current_date) as overdue
          from public.departments d
          left join public.users u on u.department_id = d.id
          left join public.tasks t on t.assignee_id = u.id and not t.is_personal
          group by d.name) x));
  end if;
  return result;
end $$;

-- ---------- grants ----------
revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated;

-- Complaint writes: only the Edge Function (service role). Not callable from the app.
revoke execute on function public.submit_complaint_internal(uuid, uuid, public.complaint_category, text) from authenticated;
grant  execute on function public.submit_complaint_internal(uuid, uuid, public.complaint_category, text) to service_role;

-- Internal helpers are not for clients either.
revoke execute on function app.escalate_blockers(), app.daily_flag_digest(), app.purge_expired(),
                           app.recompute_complaint_counts(uuid) from public, anon, authenticated;
