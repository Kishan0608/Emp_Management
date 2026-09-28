-- =====================================================================
-- 002 HELPERS, TRIGGERS AND ROW-LEVEL SECURITY
-- Every permission is enforced here, never in the app.
-- =====================================================================

-- ---------- role helpers (schema "app" is not exposed through the API) ----------
create or replace function app.uid_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select u.role from public.users u where u.id = auth.uid() and u.is_active
$$;

create or replace function app.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.uid_role() is not null
$$;

-- Boss and HR must be on a two-factor session (aal2) when the setting is on.
create or replace function app.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when app.uid_role() in ('boss','hr')
         and (select s.require_mfa_admins from public.app_settings s where s.id = 1)
      then coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    else true
  end
$$;

create or replace function app.is_boss() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.uid_role() = 'boss' and app.mfa_ok()
$$;

create or replace function app.is_hr() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.uid_role() = 'hr' and app.mfa_ok()
$$;

create or replace function app.is_case_handler() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_active and u.role = 'hr' and u.is_case_handler
  ) and app.mfa_ok()
$$;

create or replace function app.is_committee() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.committee_members c
    join public.users u on u.id = c.user_id
    where c.user_id = auth.uid() and u.is_active
  ) and app.mfa_ok()
$$;

create or replace function app.manages(p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users u where u.id = p_target and u.manager_id = auth.uid())
$$;

create or replace function app.same_department(p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users me join public.users t on t.department_id = me.department_id
    where me.id = auth.uid() and t.id = p_target and me.department_id is not null
  )
$$;

-- Field visibility: self and Boss always; otherwise a per-person rule, then a per-role rule; default deny.
create or replace function app.can_see_field(p_target uuid, p_field public.visibility_field) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.app_role := app.uid_role();
  v_allowed boolean;
begin
  if v_role is null then return false; end if;
  if p_target = auth.uid() then return true; end if;
  if app.is_boss() then return true; end if;
  if not app.mfa_ok() then return false; end if;

  select r.allowed into v_allowed from public.visibility_rules r
   where r.viewer_id = auth.uid() and r.field_name = p_field;
  if found then return v_allowed; end if;

  select r.allowed into v_allowed from public.visibility_rules r
   where r.viewer_role = v_role and r.field_name = p_field;
  return coalesce(v_allowed, false);
end $$;

create or replace function app.audit(p_action text, p_entity text, p_entity_id uuid, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs(actor_id, action, entity, entity_id, meta)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_meta, '{}'::jsonb));
$$;

create or replace function app.notify(p_user uuid, p_kind text, p_title text, p_body text, p_ref_table text, p_ref_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(user_id, kind, title, body, ref_table, ref_id)
  select p_user, p_kind, p_title, p_body, p_ref_table, p_ref_id
  where p_user is not null and exists (select 1 from public.users u where u.id = p_user and u.is_active);
$$;

create or replace function app.notify_role(p_role public.app_role, p_kind text, p_title text, p_body text, p_ref_table text, p_ref_id uuid, p_exclude uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(user_id, kind, title, body, ref_table, ref_id)
  select u.id, p_kind, p_title, p_body, p_ref_table, p_ref_id
  from public.users u
  where u.role = p_role and u.is_active and u.id is distinct from p_exclude;
$$;

-- Vault secrets are only readable by the database owner.
create or replace function app.secret(p_name text) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name
$$;
revoke all on function app.secret(text) from public, anon, authenticated;

-- ---------- generic triggers ----------
create or replace function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger users_touch            before update on public.users              for each row execute function app.touch_updated_at();
create trigger details_touch          before update on public.employee_details   for each row execute function app.touch_updated_at();
create trigger tasks_touch            before update on public.tasks              for each row execute function app.touch_updated_at();
create trigger feedback_touch         before update on public.feedback_items     for each row execute function app.touch_updated_at();
create trigger cases_touch            before update on public.disciplinary_cases for each row execute function app.touch_updated_at();
create trigger confidential_touch     before update on public.confidential_reports for each row execute function app.touch_updated_at();

-- Invite-only sign-up. The very first account becomes the Boss (company bootstrap).
create or replace function app.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_first boolean;
begin
  select not exists (select 1 from public.users) into v_first;
  if not v_first and coalesce(new.raw_app_meta_data ->> 'invited', 'false') <> 'true' then
    raise exception 'Sign-up is invite-only. Ask your administrator for an invitation.';
  end if;

  insert into public.users (id, email, full_name, role)
  values (new.id, new.email,
          coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
          case when v_first then 'boss'::public.app_role else 'employee'::public.app_role end);
  insert into public.employee_details (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function app.handle_new_auth_user();

-- Audit visibility changes and settings changes, whoever makes them.
create or replace function app.audit_visibility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.audit('visibility.' || lower(tg_op), 'visibility_rules', coalesce(new.id, old.id),
    jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)));
  return coalesce(new, old);
end $$;
create trigger visibility_audit after insert or update or delete on public.visibility_rules
  for each row execute function app.audit_visibility();

create or replace function app.audit_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.audit('settings.update', 'app_settings', null, jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)));
  return new;
end $$;
create trigger settings_audit after update on public.app_settings
  for each row execute function app.audit_settings();

-- Push delivery through the Expo push service (uses FCM/APNs underneath).
create or replace function app.push_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  select u.push_token into v_token from public.users u where u.id = new.user_id and u.is_active;
  if v_token like 'ExponentPushToken%' then
    perform net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      body    := jsonb_build_object('to', v_token, 'title', new.title, 'body', coalesce(new.body, ''),
                                    'sound', 'default',
                                    'data', jsonb_build_object('ref_table', new.ref_table, 'ref_id', new.ref_id)),
      headers := '{"Content-Type":"application/json"}'::jsonb);
  end if;
  return new;
exception when others then
  return new;  -- a failed push must never block the business action
end $$;
create trigger notifications_push after insert on public.notifications
  for each row execute function app.push_notification();

-- =====================================================================
-- ROW-LEVEL SECURITY
-- =====================================================================
alter table public.app_settings         enable row level security;
alter table public.departments          enable row level security;
alter table public.users                enable row level security;
alter table public.employee_details     enable row level security;
alter table public.visibility_rules     enable row level security;
alter table public.tasks                enable row level security;
alter table public.task_events          enable row level security;
alter table public.feedback_items       enable row level security;
alter table public.feedback_replies     enable row level security;
alter table public.complaints           enable row level security;
alter table public.complaint_counts     enable row level security;
alter table public.complaint_quota      enable row level security;
alter table public.disciplinary_cases   enable row level security;
alter table public.case_documents       enable row level security;
alter table public.committee_members    enable row level security;
alter table public.confidential_reports enable row level security;
alter table public.notifications        enable row level security;
alter table public.audit_logs           enable row level security;

-- Anonymous (logged-out) callers get nothing.
revoke all on all tables in schema public from anon;

-- Writes go through checked functions. Clients only get SELECT, plus two narrow updates below.
revoke insert, update, delete on all tables in schema public from authenticated;

-- The anonymous complaint tables and confidential reports are closed to clients completely.
revoke all on public.complaints, public.complaint_quota, public.confidential_reports from authenticated;

-- settings
create policy settings_read on public.app_settings for select to authenticated using (app.is_active_user());
grant update (company_name, yellow_threshold, red_threshold, window_days, monthly_complaint_quota,
              blocker_hr_hours, blocker_boss_hours, retention_complaint_days, retention_audit_days,
              require_mfa_admins, min_group_size, session_timeout_minutes) on public.app_settings to authenticated;
create policy settings_boss_update on public.app_settings for update to authenticated
  using (app.is_boss()) with check (app.is_boss());

-- departments
create policy departments_read on public.departments for select to authenticated using (app.is_active_user());
grant insert, update, delete on public.departments to authenticated;
create policy departments_boss_insert on public.departments for insert to authenticated with check (app.is_boss());
create policy departments_boss_update on public.departments for update to authenticated using (app.is_boss()) with check (app.is_boss());
create policy departments_boss_delete on public.departments for delete to authenticated using (app.is_boss());

-- users: the directory (name, role, team) is visible to colleagues; sensitive data is elsewhere.
create policy users_directory on public.users for select to authenticated using (app.is_active_user());
grant update (full_name, push_token) on public.users to authenticated;
create policy users_self_update on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- employee_details: self and Boss directly; everyone else through get_employee_profile().
create policy details_self_or_boss on public.employee_details for select to authenticated
  using (user_id = auth.uid() or app.is_boss());

-- visibility rules: Boss manages; viewers can see the rules that apply to them.
create policy visibility_read on public.visibility_rules for select to authenticated
  using (app.is_boss() or viewer_id = auth.uid() or viewer_role = app.uid_role());

-- tasks
create policy tasks_read on public.tasks for select to authenticated using (
  app.is_active_user() and (
    assignee_id = auth.uid()
    or (not is_personal and (
         created_by = auth.uid()
      or reviewer_id = auth.uid()
      or app.is_boss()
      or app.manages(assignee_id)
      or visibility = 'company'
      or (visibility = 'team' and app.same_department(assignee_id))
      or app.can_see_field(assignee_id, 'task_history')
    ))
  )
);

create policy task_events_read on public.task_events for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

-- feedback
create policy feedback_read on public.feedback_items for select to authenticated using (
  app.is_active_user() and (
    author_id = auth.uid()
    or app.is_boss()
    or app.is_hr()
    or is_published
    or (app.uid_role() = 'manager' and recipient_manager_id = auth.uid() and audience in ('manager','all'))
  )
);
create policy feedback_replies_read on public.feedback_replies for select to authenticated
  using (exists (select 1 from public.feedback_items f where f.id = feedback_id));

-- complaints / quota / confidential reports: RLS on and NO policies = no client access at all.

-- complaint counts: Boss and the HR case handler only. Numbers, never text or identity.
create policy counts_read on public.complaint_counts for select to authenticated
  using (app.is_boss() or app.is_case_handler());

-- disciplinary cases: Boss and HR; the employee sees their own case only after notice is issued.
create policy cases_read on public.disciplinary_cases for select to authenticated using (
  app.is_boss() or app.is_hr() or (target_id = auth.uid() and stage <> 'preliminary_inquiry')
);
create policy case_docs_read on public.case_documents for select to authenticated using (
  app.is_boss() or app.is_hr() or (
    doc_type in ('show_cause','reply','findings','penalty_decision','written_order')
    and exists (select 1 from public.disciplinary_cases c where c.id = case_id and c.target_id = auth.uid())
  )
);

-- committee
create policy committee_read on public.committee_members for select to authenticated
  using (app.is_boss() or app.is_hr() or user_id = auth.uid());

-- notifications: own only; may only flip is_read.
create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());
grant update (is_read) on public.notifications to authenticated;
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit log: Boss only, read only.
create policy audit_boss_read on public.audit_logs for select to authenticated using (app.is_boss());
