-- =====================================================================
-- RLS / PERMISSION TESTS. Run in the SQL editor. Everything rolls back.
-- Each row shows: role, what was tried, what should happen, what happened.
-- =====================================================================
begin;

create temp table t_results (n serial, who text, test text, expected text, actual text) on commit drop;
grant all on t_results to authenticated, service_role;
grant usage on sequence t_results_n_seq to authenticated, service_role;

-- helper: run a statement, record "ok" or the error message
create or replace function pg_temp.try(p_who text, p_test text, p_expected text, p_sql text) returns void
language plpgsql as $$
declare v text;
begin
  begin
    execute p_sql into v;
    insert into t_results (who, test, expected, actual) values (p_who, p_test, p_expected, coalesce('ok: ' || v, 'ok'));
  exception when others then
    insert into t_results (who, test, expected, actual) values (p_who, p_test, p_expected, 'DENIED: ' || sqlerrm);
  end;
end $$;
grant execute on function pg_temp.try(text, text, text, text) to authenticated, service_role;

-- ---------------- EMPLOYEE (Neha) ----------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.try('employee', 'read complaints table', 'DENIED', 'select count(*)::text from public.complaints');
select pg_temp.try('employee', 'call submit_complaint_internal directly', 'DENIED', $q$select public.submit_complaint_internal('a0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000005','behaviour','trying to bypass the edge function here')::text$q$);
select pg_temp.try('employee', 'read complaint quota table', 'DENIED', 'select count(*)::text from public.complaint_quota');
select pg_temp.try('employee', 'rows visible in complaint_counts', 'ok: 0', 'select count(*)::text from public.complaint_counts');
select pg_temp.try('employee', 'other people''s employee_details rows', 'ok: 0', $q$select count(*)::text from public.employee_details where user_id <> auth.uid()$q$);
select pg_temp.try('employee', 'assign task to a colleague', 'DENIED', $q$select public.create_task('Do my work','x','a0000000-0000-4000-8000-000000000005',null,'low',null,'private')::text$q$);
select pg_temp.try('employee', 'create a personal to-do', 'ok', $q$select 'created' from public.create_task('Personal note','x','a0000000-0000-4000-8000-000000000004',null,'low',null,'private')$q$);
select pg_temp.try('employee', 'see another team''s private task', 'ok: 0', $q$select count(*)::text from public.tasks where title = 'Vendor invoice reconciliation'$q$);
select pg_temp.try('employee', 'promote self to boss', 'DENIED', $q$update public.users set role = 'boss' where id = auth.uid() returning 'changed'$q$);
select pg_temp.try('employee', 'read HR complaint inbox', 'DENIED', 'select count(*)::text from public.hr_list_complaints()');
select pg_temp.try('employee', 'read audit log', 'ok: 0', 'select count(*)::text from public.audit_logs');
select pg_temp.try('employee', 'colleague profile: visible fields', 'ok: []', $q$select (public.get_employee_profile('a0000000-0000-4000-8000-000000000005') -> 'visible_fields')::text$q$);
select pg_temp.try('employee', 'see anonymous feedback sent to manager', 'ok: 0', $q$select count(*)::text from public.feedback_items where title = 'Stand-ups run too long'$q$);
select pg_temp.try('employee', 'see published Q&A', 'ok: 1', 'select count(*)::text from public.feedback_items where is_published');
select pg_temp.try('employee', 'change visibility rules', 'DENIED', $q$select public.admin_set_visibility(null,'employee','salary',true)::text$q$);
select pg_temp.try('employee', 'insert notification for someone else', 'DENIED', $q$insert into public.notifications(user_id, kind, title) values ('a0000000-0000-4000-8000-000000000001','x','spam') returning 'inserted'$q$);
reset role;

-- ---------------- MANAGER (Rohan) ----------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.try('manager', 'see own team''s tasks (3 non-personal)', 'ok: 3', 'select count(*)::text from public.tasks where not is_personal');
select pg_temp.try('manager', 'see an employee''s personal to-do', 'ok: 0', 'select count(*)::text from public.tasks where is_personal');
select pg_temp.try('manager', 'assign task to own report', 'ok', $q$select 'created' from public.create_task('Update docs','x','a0000000-0000-4000-8000-000000000004',null,'medium',null,'team')$q$);
select pg_temp.try('manager', 'assign task to HR (not on team)', 'DENIED', $q$select public.create_task('HR thing','x','a0000000-0000-4000-8000-000000000002',null,'medium',null,'team')::text$q$);
select pg_temp.try('manager', 'report profile: visible fields', 'ok: ["performance", "task_history"]', $q$select (select jsonb_agg(v order by v) from jsonb_array_elements_text(public.get_employee_profile('a0000000-0000-4000-8000-000000000004') -> 'visible_fields') v)::text$q$);
select pg_temp.try('manager', 'see anonymous feedback addressed to them', 'ok: 1', $q$select count(*)::text from public.feedback_items where title = 'Stand-ups run too long'$q$);
select pg_temp.try('manager', 'rows visible in complaint_counts', 'ok: 0', 'select count(*)::text from public.complaint_counts');
select pg_temp.try('manager', 'open a disciplinary case', 'DENIED', $q$select public.open_case('a0000000-0000-4000-8000-000000000005','summary of concern')::text$q$);
reset role;

-- ---------------- HR (Priya) WITHOUT 2FA ----------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.try('hr (no 2FA)', 'read complaint inbox', 'DENIED', 'select count(*)::text from public.hr_list_complaints()');
select pg_temp.try('hr (no 2FA)', 'assign a task', 'DENIED', $q$select public.create_task('Policy review','x','a0000000-0000-4000-8000-000000000004',null,'medium',null,'private')::text$q$);
reset role;

-- ---------------- BOSS WITHOUT 2FA ----------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.try('boss (no 2FA)', 'change someone''s role', 'DENIED', $q$select public.admin_update_user('a0000000-0000-4000-8000-000000000004','hr',null,null,null,true,false)::text$q$);
select pg_temp.try('boss (no 2FA)', 'read salary via profile', 'ok: hidden', $q$select coalesce((public.get_employee_profile('a0000000-0000-4000-8000-000000000004') -> 'salary_monthly')::text, 'hidden')$q$);
reset role;

-- ---------------- COMPLAINT PIPELINE (as the Edge Function / service role) ----------------
set local role service_role;
select pg_temp.try('edge fn', 'Boss complains about Karan',  'ok', $q$select 'filed' from public.submit_complaint_internal('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000005','behaviour','Repeatedly rude in client meetings this month.')$q$);
select pg_temp.try('edge fn', 'HR complains about Karan',    'ok', $q$select 'filed' from public.submit_complaint_internal('a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000005','behaviour','Shouted at a junior colleague during review.')$q$);
select pg_temp.try('edge fn', 'Manager complains about Karan','ok', $q$select 'filed' from public.submit_complaint_internal('a0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000005','work_quality','Skipped mandatory testing steps twice.')$q$);
select pg_temp.try('edge fn', 'Neha complains about Karan',  'ok', $q$select 'filed' from public.submit_complaint_internal('a0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000005','behaviour','Made inappropriate jokes about my work in the team channel.')$q$);
select pg_temp.try('edge fn', 'Neha again (same person, same target)', 'ok', $q$select 'filed' from public.submit_complaint_internal('a0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000005','behaviour','It happened again today in the stand-up meeting.')$q$);
select pg_temp.try('edge fn', 'Neha 3rd this month (about the manager)', 'ok', $q$select 'filed' from public.submit_complaint_internal('a0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000003','other','Testing that the third complaint is still allowed.')$q$);
select pg_temp.try('edge fn', 'Neha 4th this month (quota 3)', 'DENIED', $q$select public.submit_complaint_internal('a0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000006','other','Testing that the monthly quota blocks this one.')::text$q$);
select pg_temp.try('edge fn', 'Karan counts: 5 received, 4 distinct = yellow', 'ok: 5/4/yellow', $q$select total_received || '/' || distinct_in_window || '/' || level from public.complaint_counts where target_id = 'a0000000-0000-4000-8000-000000000005'$q$);
select pg_temp.try('edge fn', 'Sneha files (5th distinct person)', 'ok', $q$select 'filed' from public.submit_complaint_internal('a0000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000005','safety','Left the server room unlocked overnight.')$q$);
select pg_temp.try('edge fn', 'Karan now red', 'ok: red', $q$select level::text from public.complaint_counts where target_id = 'a0000000-0000-4000-8000-000000000005'$q$);
reset role;

select pg_temp.try('schema', 'complaints table has NO author/user/ip/time column', 'ok: 0', $q$select count(*)::text from information_schema.columns where table_schema='public' and table_name='complaints' and (column_name ~ '^(author|user|ip|device|created|submitted|time)')$q$);
select pg_temp.try('schema', 'complaint text is stored encrypted', 'ok: true', $q$select bool_and(position('Repeatedly rude' in encode(description_enc,'escape')) = 0)::text from public.complaints$q$);

-- ---------------- BOSS WITH 2FA ----------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select pg_temp.try('boss (2FA)', 'see complaint overview (numbers only)', 'ok: 2', 'select count(*)::text from public.complaint_overview()');
select pg_temp.try('boss (2FA)', 'read complaint text', 'DENIED', 'select count(*)::text from public.hr_list_complaints()');
select pg_temp.try('boss (2FA)', 'read complaints table directly', 'DENIED', 'select count(*)::text from public.complaints');
select pg_temp.try('boss (2FA)', 'read salary via profile', 'ok: 65000.00', $q$select (public.get_employee_profile('a0000000-0000-4000-8000-000000000004') -> 'salary_monthly')::text$q$);
select pg_temp.try('boss (2FA)', 'terminate without a case', 'DENIED', $q$select public.terminate_employee(gen_random_uuid(),'Karan Desai')::text$q$);
select pg_temp.try('boss (2FA)', 'open case at red level', 'ok', $q$select 'opened' from public.open_case('a0000000-0000-4000-8000-000000000005','Pattern of behaviour complaints; start inquiry.')$q$);
select pg_temp.try('boss (2FA)', 'terminate at preliminary stage', 'DENIED', $q$select public.terminate_employee((select id from public.disciplinary_cases limit 1),'Karan Desai')::text$q$);
reset role;

-- ---------------- TARGET (Karan) ----------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.try('target employee', 'see own case before show-cause', 'ok: 0', 'select count(*)::text from public.disciplinary_cases');
select pg_temp.try('target employee', 'see own complaint count', 'ok: 0', 'select count(*)::text from public.complaint_counts');
reset role;

-- ---------------- HR CASE HANDLER WITH 2FA ----------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select pg_temp.try('hr handler (2FA)', 'read complaint text (7 rows)', 'ok: 7', 'select count(*)::text from public.hr_list_complaints()');
select pg_temp.try('hr handler (2FA)', 'inbox exposes an author column', 'ok: 0', $q$select count(*)::text from (select * from public.hr_list_complaints() limit 1) x where to_jsonb(x) ?| array['author_id','user_id','dedupe_hash']$q$);
select pg_temp.try('hr handler (2FA)', 'edit case row directly', 'DENIED', $q$update public.disciplinary_cases set stage = 'findings' returning 'x'$q$);
select pg_temp.try('hr handler (2FA)', 'profile salary hidden (rule = deny)', 'ok: hidden', $q$select coalesce((public.get_employee_profile('a0000000-0000-4000-8000-000000000004') -> 'salary_monthly')::text, 'hidden')$q$);
select pg_temp.try('hr handler (2FA)', 'advance case to show-cause', 'ok: show_cause', $q$select public.advance_case((select id from public.disciplinary_cases limit 1), 'Show-cause notice', 'You are asked to explain the incidents listed in this notice within 7 days.')::text$q$);
select pg_temp.try('hr handler (2FA)', 'skip the employee reply window', 'DENIED', $q$select public.advance_case((select id from public.disciplinary_cases limit 1), 'No reply', 'Moving on without waiting for the reply.')::text$q$);
reset role;

-- ---------------- TARGET REPLIES (natural justice) ----------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.try('target employee', 'see own case after show-cause', 'ok: 1', 'select count(*)::text from public.disciplinary_cases');
select pg_temp.try('target employee', 'see HR internal notes', 'ok: 0', $q$select count(*)::text from public.case_documents where doc_type = 'note'$q$);
select pg_temp.try('target employee', 'submit written reply', 'ok', $q$select 'replied' from public.submit_case_reply((select id from public.disciplinary_cases limit 1), 'I deny the allegations and request a fair hearing with witnesses.')$q$);
reset role;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select pg_temp.try('hr handler (2FA)', 'advance to domestic inquiry', 'ok: domestic_inquiry', $q$select public.advance_case((select id from public.disciplinary_cases limit 1), 'Inquiry', 'Hearing held on 5 Oct with two witnesses; employee present.')::text$q$);
select pg_temp.try('hr handler (2FA)', 'advance to findings', 'ok: findings', $q$select public.advance_case((select id from public.disciplinary_cases limit 1), 'Findings', 'Two of three allegations proven by independent evidence.')::text$q$);
select pg_temp.try('hr handler (2FA)', 'decide penalty (Boss only)', 'DENIED', $q$select public.advance_case((select id from public.disciplinary_cases limit 1), 'Penalty', 'HR trying to set the penalty here.', 'termination')::text$q$);
reset role;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select pg_temp.try('boss (2FA)', 'decide penalty termination', 'ok: penalty', $q$select public.advance_case((select id from public.disciplinary_cases limit 1), 'Penalty', 'Termination for proven repeated misconduct.', 'termination')::text$q$);
select pg_temp.try('boss (2FA)', 'terminate before written order', 'DENIED', $q$select public.terminate_employee((select id from public.disciplinary_cases limit 1),'Karan Desai')::text$q$);
select pg_temp.try('boss (2FA)', 'issue written order', 'ok: written_order', $q$select public.advance_case((select id from public.disciplinary_cases limit 1), 'Order', 'Written termination order with reasons and effective date.')::text$q$);
select pg_temp.try('boss (2FA)', 'terminate with wrong name', 'DENIED', $q$select public.terminate_employee((select id from public.disciplinary_cases limit 1),'Karan')::text$q$);
select pg_temp.try('boss (2FA)', 'terminate after written order', 'ok', $q$select 'terminated' from public.terminate_employee((select id from public.disciplinary_cases limit 1),'Karan Desai')$q$);
reset role;

-- ---------------- DEACTIVATED USER (token still valid) ----------------
update public.users set is_active = false where id = 'a0000000-0000-4000-8000-000000000006';
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select pg_temp.try('deactivated', 'read tasks', 'ok: 0', 'select count(*)::text from public.tasks');
select pg_temp.try('deactivated', 'read directory', 'ok: 0', 'select count(*)::text from public.users');
select pg_temp.try('deactivated', 'submit feedback', 'DENIED', $q$select public.submit_feedback('feedback','hr','Still here','I should not be able to post this')::text$q$);
reset role;

select n, who, test, expected, actual,
       case when actual like expected || '%' or (expected = 'ok' and actual like 'ok%') then 'PASS' else 'FAIL' end as result
from t_results order by n;

rollback;
