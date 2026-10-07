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
select pg_temp.try('employee', 'read sign-up codes table', 'DENIED', 'select count(*)::text from public.auth_codes');
select pg_temp.try('employee', 'other people''s employee_details rows', 'ok: 0', $q$select count(*)::text from public.employee_details where user_id <> auth.uid()$q$);
select pg_temp.try('employee', 'assign task to a colleague', 'DENIED', $q$select public.create_task('Do my work','x','a0000000-0000-4000-8000-000000000005',null,'low',null,'private')::text$q$);
select pg_temp.try('employee', 'create a personal to-do', 'ok', $q$select 'created' from public.create_task('Personal note','x','a0000000-0000-4000-8000-000000000004',null,'low',null,'private')$q$);
select pg_temp.try('employee', 'see another team''s private task', 'ok: 0', $q$select count(*)::text from public.tasks where title = 'Vendor invoice reconciliation'$q$);
select pg_temp.try('employee', 'promote self to boss', 'DENIED', $q$update public.users set role = 'boss' where id = auth.uid() returning 'changed'$q$);
select pg_temp.try('employee', 'read audit log', 'ok: 0', 'select count(*)::text from public.audit_logs');
select pg_temp.try('employee', 'colleague profile: visible fields', 'ok: []', $q$select (public.get_employee_profile('a0000000-0000-4000-8000-000000000005') -> 'visible_fields')::text$q$);
select pg_temp.try('employee', 'see anonymous feedback sent to manager', 'ok: 0', $q$select count(*)::text from public.feedback_items where title = 'Stand-ups run too long'$q$);
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
reset role;

-- ---------------- HR (Priya) WITHOUT 2FA ----------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.try('hr (no 2FA)', 'assign a task', 'DENIED', $q$select public.create_task('Policy review','x','a0000000-0000-4000-8000-000000000004',null,'medium',null,'private')::text$q$);
reset role;

-- ---------------- BOSS WITHOUT 2FA ----------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.try('boss (no 2FA)', 'change someone''s role', 'DENIED', $q$select public.admin_update_user('a0000000-0000-4000-8000-000000000004','hr',null,null,null,true,false)::text$q$);
select pg_temp.try('boss (no 2FA)', 'read salary via profile', 'ok: hidden', $q$select coalesce((public.get_employee_profile('a0000000-0000-4000-8000-000000000004') -> 'salary_monthly')::text, 'hidden')$q$);
reset role;

-- ---------------- BOSS WITH 2FA ----------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select pg_temp.try('boss (2FA)', 'read salary via profile', 'ok: 65000.00', $q$select (public.get_employee_profile('a0000000-0000-4000-8000-000000000004') -> 'salary_monthly')::text$q$);
select pg_temp.try('boss (2FA)', 'read sign-up codes table directly', 'DENIED', 'select count(*)::text from public.auth_codes');
reset role;

-- ---------------- HR WITH 2FA ----------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select pg_temp.try('hr (2FA)', 'profile salary hidden (rule = deny)', 'ok: hidden', $q$select coalesce((public.get_employee_profile('a0000000-0000-4000-8000-000000000004') -> 'salary_monthly')::text, 'hidden')$q$);
select pg_temp.try('hr (2FA)', 'reply to feedback', 'ok', $q$select 'replied' from public.reply_feedback((select id from public.feedback_items where title = 'How do I claim travel reimbursement?'), 'Also attach the client visit approval.')$q$);
select pg_temp.try('hr (2FA)', 'reply stored on the item (2 replies)', 'ok: 2', $q$select jsonb_array_length(replies)::text from public.feedback_items where title = 'How do I claim travel reimbursement?'$q$);
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
