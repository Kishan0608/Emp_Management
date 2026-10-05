-- =====================================================================
-- 026 ATTENDANCE: schema
-- Clock in / break / clock out punches drive attendance status automatically.
-- Employee and Manager see only their own attendance; HR and Boss see everyone's.
-- =====================================================================

create type public.attendance_status as enum ('present', 'half_day', 'absent');

create table public.attendance_records (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  work_date       date not null,
  clock_in_at     timestamptz,
  break_start_at  timestamptz,
  break_end_at    timestamptz,
  clock_out_at    timestamptz,
  status          public.attendance_status,   -- null while the day is still in progress
  half_day_reason text check (half_day_reason in ('early_clockout', 'late_streak')),
  is_late         boolean not null default false,
  late_minutes    int,
  worked_minutes  int,                        -- clock_out - clock_in, minus the actual break duration
  auto_closed     boolean not null default false,  -- true when the nightly job force-closed it, not the employee
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, work_date)
);
create index attendance_user_date_idx on public.attendance_records(user_id, work_date desc);

create trigger attendance_touch before update on public.attendance_records
  for each row execute function app.touch_updated_at();

-- ---------- settings: configurable thresholds, same pattern as yellow_threshold/red_threshold ----------
alter table public.app_settings
  add column attendance_work_start        time not null default '10:00',
  add column attendance_work_end          time not null default '19:00',
  add column attendance_late_grace_minutes int  not null default 30,
  add column attendance_half_day_cutoff   time not null default '14:00',
  add column attendance_late_warning_limit int  not null default 3,
  add column attendance_weekly_off_dow    int   not null default 0,   -- 0 = Sunday, matches extract(dow from date)
  add column attendance_timezone         text  not null default 'Asia/Kolkata';

grant update (attendance_work_start, attendance_work_end, attendance_late_grace_minutes, attendance_half_day_cutoff,
              attendance_late_warning_limit, attendance_weekly_off_dow, attendance_timezone)
  on public.app_settings to authenticated;
-- covered by the existing settings_boss_update policy (migration 002) — no new policy needed.

-- ---------- RLS ----------
alter table public.attendance_records enable row level security;
-- writes only through RPCs: relies on the existing blanket
-- `revoke insert, update, delete on all tables in schema public from authenticated` from migration 002.

create policy attendance_read on public.attendance_records for select to authenticated
  using (user_id = auth.uid() or app.is_boss() or app.is_hr());
