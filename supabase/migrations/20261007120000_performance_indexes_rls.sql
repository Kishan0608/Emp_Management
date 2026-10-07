-- =====================================================================
-- 035 PERFORMANCE: faster access rules + indexes on foreign keys
--
-- 1. RLS policies called auth.uid() and the app.* role helpers once per ROW.
--    Wrapped in (select ...), Postgres evaluates them once per QUERY
--    (Supabase advisor 0003 auth_rls_initplan). Who can see what is unchanged.
--    Helpers that take a row value (app.leads, app.same_department,
--    app.can_see_field) must stay per row and are left as they were.
-- 2. Index every foreign key that had none (advisor 0001), so joins,
--    lookups and deletes stay fast as the tables grow.
-- No data is changed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Access rules
-- ---------------------------------------------------------------------
alter policy notifications_own on public.notifications
  using (user_id = (select auth.uid()));

alter policy notifications_mark_read on public.notifications
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy users_self_update on public.users
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy attendance_read on public.attendance_records
  using (user_id = (select auth.uid()) or (select app.is_boss()) or (select app.is_hr()));

alter policy details_self_or_boss on public.employee_details
  using (user_id = (select auth.uid()) or (select app.is_boss()));

alter policy visibility_read on public.visibility_rules
  using ((select app.is_boss()) or viewer_id = (select auth.uid()) or viewer_role = (select app.uid_role()));

alter policy tasks_read on public.tasks
  using (
    (select app.is_active_user()) and (
      assignee_id = (select auth.uid())
      or (not is_personal and (
           created_by = (select auth.uid())
        or reviewer_id = (select auth.uid())
        or (select app.is_boss())
        or app.leads(assignee_id)
        or visibility = 'company'::public.task_visibility
        or (visibility = 'team'::public.task_visibility and app.same_department(assignee_id))
        or app.can_see_field(assignee_id, 'task_history'::public.visibility_field)))));

alter policy feedback_read on public.feedback_items
  using (
    (select app.is_active_user()) and (
      author_id = (select auth.uid())
      or (select app.is_boss())
      or (select app.is_hr())
      or is_published
      or ((select app.uid_role()) = 'manager'::public.app_role
          and recipient_manager_id = (select auth.uid())
          and audience = any (array['manager'::public.feedback_audience, 'all'::public.feedback_audience]))));

-- ---------------------------------------------------------------------
-- 2. Foreign-key indexes
-- ---------------------------------------------------------------------
create index if not exists audit_logs_actor_id_idx          on public.audit_logs (actor_id);
create index if not exists auth_codes_issued_by_idx         on public.auth_codes (issued_by);
create index if not exists feedback_items_department_id_idx on public.feedback_items (department_id);
create index if not exists feedback_items_task_id_idx       on public.feedback_items (task_id);
create index if not exists holidays_created_by_idx          on public.holidays (created_by);
create index if not exists holidays_organization_id_idx     on public.holidays (organization_id);
create index if not exists task_events_actor_id_idx         on public.task_events (actor_id);
create index if not exists task_questions_author_id_idx     on public.task_questions (author_id);
create index if not exists task_questions_recipient_id_idx  on public.task_questions (recipient_id);
create index if not exists users_approved_by_idx            on public.users (approved_by);
create index if not exists users_organization_id_idx        on public.users (organization_id);
create index if not exists visibility_rules_set_by_idx      on public.visibility_rules (set_by);
