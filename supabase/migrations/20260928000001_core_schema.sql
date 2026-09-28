-- =====================================================================
-- 001 CORE SCHEMA: enums, tables, indexes
-- Employee management: Tasks, Complaints (anonymous), Feedback
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Private schema for helper functions. It is NOT exposed through the API.
create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------- enums ----------
create type public.app_role          as enum ('boss','hr','manager','employee');
create type public.task_status       as enum ('assigned','accepted','in_progress','blocked','submitted','approved','returned','closed');
create type public.task_priority     as enum ('low','medium','high','urgent');
create type public.task_visibility   as enum ('private','team','company');
create type public.feedback_type     as enum ('feedback','question','blocker');
create type public.feedback_audience as enum ('manager','hr','boss','all');
create type public.feedback_status   as enum ('open','acknowledged','answered','resolved');
create type public.complaint_category as enum ('behaviour','work_quality','attendance','misuse_of_resources','discrimination','safety','other');
create type public.triage_status     as enum ('pending','credible','duplicate','unsubstantiated','malicious');
create type public.flag_level        as enum ('none','yellow','red');
create type public.case_stage        as enum ('preliminary_inquiry','show_cause','employee_reply','domestic_inquiry','findings','penalty','written_order','closed');
create type public.penalty_type      as enum ('none','warning','performance_plan','suspension','termination');
create type public.visibility_field  as enum ('contact','salary','attendance','task_history','performance');

-- ---------- settings (single row) ----------
create table public.app_settings (
  id                       int primary key default 1 check (id = 1),
  company_name             text not null default 'My Company',
  yellow_threshold         int  not null default 3,
  red_threshold            int  not null default 5,
  window_days              int  not null default 90,
  monthly_complaint_quota  int  not null default 3,
  blocker_hr_hours         int  not null default 4,
  blocker_boss_hours       int  not null default 24,
  retention_complaint_days int  not null default 1095,
  retention_audit_days     int  not null default 1825,
  require_mfa_admins       boolean not null default true,
  min_group_size           int  not null default 5,
  session_timeout_minutes  int  not null default 30,
  privacy_notice_version   int  not null default 1
);
insert into public.app_settings (id) values (1);

-- ---------- org ----------
create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

create table public.users (
  id                   uuid primary key references auth.users(id) on delete cascade,
  full_name            text not null,
  email                text not null,
  role                 public.app_role not null default 'employee',
  department_id        uuid references public.departments(id) on delete set null,
  manager_id           uuid references public.users(id) on delete set null,
  job_title            text,
  is_active            boolean not null default true,
  is_case_handler      boolean not null default false,
  must_change_password boolean not null default false,
  consent_version      int,
  consent_at           timestamptz,
  push_token           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint users_not_own_manager check (manager_id is distinct from id)
);
create index users_department_idx on public.users(department_id);
create index users_manager_idx on public.users(manager_id);

-- Sensitive fields live apart from the directory, so the Boss can control each one.
create table public.employee_details (
  user_id            uuid primary key references public.users(id) on delete cascade,
  phone              text,
  personal_email     text,
  address            text,
  salary_monthly     numeric(12,2),
  attendance_pct     numeric(5,2),
  performance_rating numeric(3,1) check (performance_rating between 0 and 5),
  joined_on          date,
  updated_at         timestamptz not null default now()
);

-- Per person OR per role. Default is deny (no row = not allowed).
create table public.visibility_rules (
  id          uuid primary key default gen_random_uuid(),
  viewer_id   uuid references public.users(id) on delete cascade,
  viewer_role public.app_role,
  field_name  public.visibility_field not null,
  allowed     boolean not null default false,
  set_by      uuid references public.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint visibility_one_target check ((viewer_id is null) <> (viewer_role is null)),
  constraint visibility_unique unique nulls not distinct (viewer_id, viewer_role, field_name)
);

-- ---------- tasks ----------
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 3 and 160),
  description  text,
  priority     public.task_priority not null default 'medium',
  due_date     date,
  status       public.task_status not null default 'assigned',
  visibility   public.task_visibility not null default 'private',
  checklist    jsonb not null default '[]'::jsonb,
  attachments  jsonb not null default '[]'::jsonb,
  created_by   uuid not null references public.users(id),
  assignee_id  uuid not null references public.users(id),
  reviewer_id  uuid not null references public.users(id),
  is_personal  boolean not null default false,
  submitted_at timestamptz,
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index tasks_assignee_idx on public.tasks(assignee_id, status);
create index tasks_creator_idx  on public.tasks(created_by);
create index tasks_reviewer_idx on public.tasks(reviewer_id);

create table public.task_events (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  actor_id    uuid references public.users(id) on delete set null,
  from_status public.task_status,
  to_status   public.task_status not null,
  note        text,
  proof_url   text,
  created_at  timestamptz not null default now()
);
create index task_events_task_idx on public.task_events(task_id, created_at);

-- ---------- feedback ----------
create table public.feedback_items (
  id                   uuid primary key default gen_random_uuid(),
  type                 public.feedback_type not null,
  audience             public.feedback_audience not null,
  title                text not null check (char_length(title) between 3 and 160),
  body                 text not null,
  is_anonymous         boolean not null default false,
  author_id            uuid references public.users(id) on delete set null,
  recipient_manager_id uuid references public.users(id) on delete set null,
  department_id        uuid references public.departments(id) on delete set null,
  task_id              uuid references public.tasks(id) on delete set null,
  status               public.feedback_status not null default 'open',
  escalation_level     int not null default 0,   -- 0 manager, 1 HR, 2 Boss
  is_published         boolean not null default false,
  acknowledged_at      timestamptz,
  answered_at          timestamptz,
  resolved_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint feedback_anon_has_no_author check (not is_anonymous or author_id is null)
);
create index feedback_author_idx  on public.feedback_items(author_id);
create index feedback_manager_idx on public.feedback_items(recipient_manager_id);
create index feedback_open_blockers_idx on public.feedback_items(created_at) where type = 'blocker' and status in ('open','acknowledged');

create table public.feedback_replies (
  id           uuid primary key default gen_random_uuid(),
  feedback_id  uuid not null references public.feedback_items(id) on delete cascade,
  responder_id uuid references public.users(id) on delete set null,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index feedback_replies_item_idx on public.feedback_replies(feedback_id, created_at);

-- ---------- complaints (anonymous by design) ----------
-- There is deliberately NO author column, NO exact timestamp and NO IP/device column.
create table public.complaints (
  id              uuid primary key default gen_random_uuid(),
  target_id       uuid not null references public.users(id) on delete cascade,
  category        public.complaint_category not null,
  description_enc bytea not null,                 -- pgp_sym_encrypt, key in Vault
  dedupe_hash     text not null,                  -- HMAC(author, target), key in Vault
  received_date   date not null default current_date,
  triage_status   public.triage_status not null default 'pending',
  triage_note     text,
  triaged_by      uuid references public.users(id) on delete set null
);
create index complaints_target_idx on public.complaints(target_id, received_date);

-- Per-employee summary. Date only (no exact time) so it cannot be matched to a submission.
create table public.complaint_counts (
  target_id        uuid primary key references public.users(id) on delete cascade,
  total_received   int not null default 0,
  credible_count   int not null default 0,
  pending_count    int not null default 0,
  distinct_in_window int not null default 0,
  level            public.flag_level not null default 'none',
  notified_level   public.flag_level not null default 'none',  -- alerts go out in a daily batch, not at submit time
  updated_on       date not null default current_date
);

-- Monthly quota: who, which month, how many. No target, so it cannot be joined to a complaint.
create table public.complaint_quota (
  user_id uuid not null references public.users(id) on delete cascade,
  month   date not null,
  used    int  not null default 0,
  primary key (user_id, month)
);

-- ---------- disciplinary ----------
create table public.disciplinary_cases (
  id            uuid primary key default gen_random_uuid(),
  target_id     uuid not null references public.users(id) on delete cascade,
  opened_by     uuid references public.users(id) on delete set null,
  stage         public.case_stage not null default 'preliminary_inquiry',
  penalty       public.penalty_type not null default 'none',
  summary       text not null,
  opened_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  closed_at     timestamptz,
  terminated_at timestamptz
);
create unique index one_open_case_per_target on public.disciplinary_cases(target_id) where closed_at is null;

create table public.case_documents (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.disciplinary_cases(id) on delete cascade,
  stage      public.case_stage not null,
  doc_type   text not null check (doc_type in ('note','preliminary_report','show_cause','reply','inquiry_record','findings','penalty_decision','written_order')),
  title      text not null,
  body       text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index case_documents_case_idx on public.case_documents(case_id, created_at);

-- ---------- POSH confidential lane (NOT anonymous) ----------
create table public.committee_members (
  user_id  uuid primary key references public.users(id) on delete cascade,
  added_by uuid references public.users(id) on delete set null,
  added_at timestamptz not null default now()
);

create table public.confidential_reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.users(id) on delete cascade,
  target_id        uuid references public.users(id) on delete set null,
  incident_date    date,
  statement_enc    bytea not null,
  committee_status text not null default 'received' check (committee_status in ('received','under_inquiry','resolved','closed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------- notifications & audit ----------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  ref_table  text,
  ref_id     uuid,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, is_read, created_at desc);

create table public.audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.users(id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);
