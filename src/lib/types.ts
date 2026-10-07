export type Role = 'boss' | 'hr' | 'manager' | 'employee';
export type TaskStatus = 'assigned' | 'accepted' | 'in_progress' | 'blocked' | 'submitted' | 'approved' | 'returned' | 'closed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskVisibility = 'private' | 'team' | 'company';
export type FeedbackType = 'feedback' | 'question' | 'blocker';
export type FeedbackAudience = 'manager' | 'hr' | 'boss' | 'all';
export type FeedbackStatus = 'open' | 'acknowledged' | 'answered' | 'resolved';
export type VisibilityField = 'contact' | 'salary' | 'attendance' | 'task_history' | 'performance';
export type AttendanceStatus = 'present' | 'half_day' | 'absent' | 'leave';
export type AttendanceNextAction = 'clock_in' | 'break_start' | 'break_end' | 'clock_out' | 'done';
export type HalfDayReason = 'early_clockout' | 'late_streak';

export type AppLockType = 'passcode' | 'pattern' | 'biometric';

export interface AppLockConfig {
  enabled: boolean;
  type: AppLockType;
  has_passcode: boolean;
  has_pattern: boolean;
  biometric_enabled: boolean;
}

export interface Organization {
  id: string;
  name: string;
  logo_url?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AppUser {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  department_id: string | null;
  organization_id?: string | null;
  organization?: string | null;
  manager_id: string | null;
  job_title: string | null;
  is_active: boolean;
  is_case_handler: boolean;
  must_change_password: boolean;
  account_status?: 'invited' | 'awaiting_approval' | 'active';
  consent_version: number | null;
  consent_at: string | null;
  phone?: string | null;
  personal_email?: string | null;
  address?: string | null;
  salary_monthly?: number | null;
  attendance_pct?: number | null;
  performance_rating?: number | null;
  joined_on?: string | null;
  created_at: string;
  // App Lock
  app_lock_enabled?: boolean;
  app_lock_type?: AppLockType;
  app_lock_biometric_enabled?: boolean;
  has_passcode?: boolean;
  has_pattern?: boolean;
  // Location sharing (opt-in, set only through set_my_location_sharing)
  location_sharing_enabled?: boolean;
  location_sharing_changed_at?: string | null;
  location_device_status?: LocationDeviceStatus | null;
}

export interface AppSettings {
  company_name: string;
  session_timeout_minutes: number;
  privacy_notice_version: number;
  min_group_size: number;
  blocker_hr_hours: number;
  blocker_boss_hours: number;
  require_mfa_admins: boolean;
  retention_audit_days: number;
  location_retention_days: number;
  email_test_mode?: boolean;
}

// ---------- location tracking ----------
/** What the salesperson's phone last reported about itself. */
export type LocationDeviceStatus = 'ok' | 'foreground_only' | 'permission_denied' | 'services_off';

export interface LocationPoint {
  recorded_at: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  speed_mps: number | null;
}

/** One row on the live board: the newest fix for a person the viewer may track. */
export interface LiveLocation {
  user_id: string;
  full_name: string;
  role: Role;
  job_title: string | null;
  department: string | null;
  organization_id: string | null;
  organization: string | null;
  last_point: LocationPoint | null;
  points_today: number;
  /** Off = the person switched sharing off: shown as Offline; last_point and the trail are their data from before. */
  sharing_enabled: boolean;
  device_status: LocationDeviceStatus | null;
  status_at: string | null;
}

/** A location problem during the person's office time; they are told first, then their manager / HR. */
export interface MyLocationAlert {
  id: string;
  kind: 'sharing_off' | 'gps_off' | 'no_update';
  work_date: string;
  started_at: string;
  employee_notified_at: string | null;
  reason: string | null;
  reason_at: string | null;
  paused_until: string | null;
  escalated_at: string | null;
  resolved_at: string | null;
  escalate_after_min: number;
  pause_min: number;
  can_pause: boolean;
}

/** A file attached to a daily work log (private 'work-logs' bucket, under the owner's id). */
export interface WorkAttachment {
  path: string;
  name: string;
  size: number | null;
  type: string | null;
}

/** One person's daily work log: what they did, hours, files; reviewed by their manager / HR / Boss. */
export interface WorkLog {
  id: string;
  user_id: string;
  work_date: string;
  summary: string;
  hours: number | null;
  attachments: WorkAttachment[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  reviewer?: string | null;
  created_at: string;
  updated_at: string;
}

/** My day: is a work log required (no open tasks on a working day), and the log if added. */
export interface MyWorkDay {
  work_date: string;
  today: string;
  required: boolean;
  open_tasks: number;
  weekly_off: boolean;
  holiday: string | null;
  on_leave: boolean;
  clocked_in: boolean;
  log: WorkLog | null;
}

export interface LocationDay {
  person: { id: string; full_name: string; role: Role; sharing_enabled: boolean };
  work_date: string;
  points: LocationPoint[];
}

export interface MyContext {
  user: AppUser;
  department: string | null;
  manager: string | null;
  organization?: { id: string; name: string } | null;
  /** True when anyone reports to this user, whatever their role. */
  leads_team?: boolean;
  mfa_required: boolean;
  aal: 'aal1' | 'aal2';
  settings: AppSettings;
}

/** Departments are shared by every company. */
export interface Department {
  id: string;
  name: string;
}

export interface DirectoryUser {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  job_title: string | null;
  department_id: string | null;
  department?: string | null;
  organization_id?: string | null;
  organization?: string | null;
  manager_id: string | null;
  phone?: string | null;
  is_active: boolean;
  is_case_handler: boolean;
}

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export interface Attachment {
  path: string;
  name: string;
  by: string;
  at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  due_date: string | null;
  status: TaskStatus;
  visibility: TaskVisibility;
  checklist: ChecklistItem[];
  attachments: Attachment[];
  created_by: string;
  assignee_id: string;
  reviewer_id: string;
  is_personal: boolean;
  submitted_at: string | null;
  approved_at: string | null;
  /** 1-5 stars, set by whoever assigned the task when they mark it done. */
  rating: number | null;
  created_at: string;
  updated_at: string;
  assignee?: { full_name: string; organization_id?: string | null; department_id?: string | null } | null;
  creator?: { full_name: string } | null;
  reviewer?: { full_name: string } | null;
}

export interface TaskEvent {
  id: string;
  task_id: string;
  actor_id: string | null;
  from_status: TaskStatus | null;
  to_status: TaskStatus;
  note: string | null;
  proof_url: string | null;
  created_at: string;
  actor?: { full_name: string } | null;
}

export interface TaskQuestionReply {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface TaskQuestion {
  id: string;
  task_id: string;
  author_id: string;
  recipient_id: string | null;
  title: string;
  body: string;
  status: 'open' | 'answered' | 'closed';
  replies: TaskQuestionReply[];
  created_at: string;
  updated_at: string;
  author_name?: string | null;
  recipient_name?: string | null;
}

export interface FeedbackItem {
  id: string;
  type: FeedbackType;
  audience: FeedbackAudience;
  title: string;
  body: string;
  is_anonymous: boolean;
  author_id: string | null;
  recipient_manager_id: string | null;
  task_id: string | null;
  status: FeedbackStatus;
  escalation_level: number;
  replies?: FeedbackReply[];
  created_at: string;
  answered_at: string | null;
  resolved_at: string | null;
  author?: { full_name: string } | null;
}

/** One entry of feedback_items.replies (jsonb). */
export interface FeedbackReply {
  id: string;
  feedback_id?: string;
  responder_id: string | null;
  body: string;
  created_at: string;
  responder?: { full_name: string; role: Role } | null;
}

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  ref_table: string | null;
  ref_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface EmployeeProfile {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  job_title: string | null;
  department: string | null;
  department_id: string | null;
  manager: string | null;
  manager_id: string | null;
  is_active: boolean;
  is_case_handler?: boolean;
  created_at: string;
  organization_id?: string | null;
  organization?: string | null;
  visible_fields: VisibilityField[];
  phone?: string | null;
  personal_email?: string | null;
  address?: string | null;
  joined_on?: string | null;
  salary_monthly?: number | null;
  attendance_pct?: number | null;
  performance_rating?: number | null;
  task_stats?: { total: number; completed: number; on_time: number; overdue: number; open: number; returned: number };
  timeline?: { created_at: string; to_status: TaskStatus; note: string | null; title: string; task_id: string }[];
}

export interface DashboardStats {
  my_tasks: { open: number; due_today: number; overdue: number; to_review: number; done_30d: number };
  unread_notifications: number;
  my_open_feedback: number;
  team?: { members: number; open: number; blocked: number; overdue: number; feedback_open: number };
  feedback_open?: number;
  blockers_open?: number;
  headcount?: Partial<Record<Role, number>>;
  tasks_by_status?: Partial<Record<TaskStatus, number>>;
  tasks_overdue?: number;
  on_time_rate_30d?: number | null;
  by_department?: { name: string; open: number; done: number; overdue: number }[];
}

export interface VisibilityRule {
  id: string;
  viewer_id: string | null;
  viewer_role: Role | null;
  field_name: VisibilityField;
  allowed: boolean;
  updated_at: string;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  actor?: { full_name: string } | null;
}

export interface TeamMemberSummary {
  id: string;
  full_name: string;
  job_title: string | null;
  role: Role;
  email: string;
  department: string | null;
  total: number;
  done: number;
  open: number;
  blocked: number;
  awaiting_review: number;
  overdue: number;
  on_time_pct: number | null;
  last_active: string | null;
}

export interface AttendanceRecord {
  id: string;
  work_date: string;
  clock_in_at: string | null;
  break_start_at: string | null;
  break_end_at: string | null;
  clock_out_at: string | null;
  status: AttendanceStatus | null;
  half_day_reason: HalfDayReason | null;
  is_late: boolean;
  late_minutes: number | null;
  worked_minutes: number | null;
  auto_closed?: boolean;
  leave_type?: LeaveType | null;
  leave_reason?: string | null;
  leave_paid?: boolean | null;
  leave_attachment_path?: string | null;
}

export type LeaveType = 'sick' | 'casual' | 'emergency' | 'other';

export interface LeaveBalance {
  year: number;
  quota: number;
  used: number;
  remaining: number;
}

export interface AttendanceThresholds {
  work_start: string;
  work_end: string;
  grace_minutes: number;
  half_day_cutoff: string;
  warning_limit: number;
}

export type HolidayKind = 'festival' | 'national' | 'company' | 'other';

/** A paid day off for everyone in scope (organization_id null = every company). Never counts as leave. */
export interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  kind: HolidayKind;
  organization_id: string | null;
  organization?: string | null;
}

/**
 * One day's punches, as sent to import_punch_records. Times are the company's local time.
 * Matched by employee_code first; email is a fallback for rows that carry no code.
 */
export interface PunchRow {
  employee_code?: string | null;
  email?: string | null;
  work_date: string; // YYYY-MM-DD
  clock_in: string; // HH:MM
  break_start?: string | null;
  break_end?: string | null;
  clock_out?: string | null;
}

export interface AttendanceToday {
  record: AttendanceRecord | null;
  /** Set when today is a holiday for this person (absent until the holidays migration is applied). */
  holiday?: Holiday | null;
  next_action: AttendanceNextAction;
  late_count_this_month: number;
  thresholds: AttendanceThresholds;
}

export interface AttendanceMonthSummary {
  present: number;
  half_day: number;
  absent: number;
  late: number;
  leave?: number;
  holiday?: number;
}

export interface MyAttendanceMonth {
  records: AttendanceRecord[];
  holidays?: Holiday[];
  summary: AttendanceMonthSummary;
}

export interface SalaryBreakdown {
  base_salary: number | null;
  per_day_rate: number;
  days_in_month: number;
  absent_days: number;
  half_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  holiday_days?: number;
  deduction: number;
  payable_salary: number;
  /** Last date the deduction actually covers — equals the month's end once it's fully elapsed. */
  as_of: string;
}

export interface AttendanceOverviewRow extends SalaryBreakdown {
  user_id: string;
  full_name: string;
  role: Role;
  department: string | null;
  organization_id?: string | null;
  organization?: string | null;
  present: number;
  half_day: number;
  absent: number;
  late: number;
  leave?: number;
}

export interface AttendanceDetail {
  person: { id: string; full_name: string; role: Role };
  records: AttendanceRecord[];
  holidays?: Holiday[];
  salary: SalaryBreakdown;
}

export interface TeamMemberReport {
  person: {
    id: string;
    full_name: string;
    email: string;
    role: Role;
    job_title: string | null;
    department: string | null;
    manager: string | null;
    is_active: boolean;
    member_since: string;
    joined_on: string | null;
  };
  attendance_pct: number | null;
  performance_rating: number | null;
  tasks: {
    total: number;
    done: number;
    open: number;
    not_started: number;
    in_progress: number;
    blocked: number;
    awaiting_review: number;
    returned: number;
    overdue: number;
    due_7d: number;
    done_30d: number;
  };
  priority_open: Record<TaskPriority, number>;
  quality: { on_time: number; late: number; reworked: number; avg_days_to_complete: number | null };
  habits: {
    avg_hours_to_accept: number | null;
    updates_30d: number;
    active_days_30d: number;
    last_active: string | null;
    blocked_times: number;
    feedback_to_me: number;
    blockers_to_me: number;
  };
  monthly: { month: string; done: number }[];
  recent_tasks: { id: string; title: string; status: TaskStatus; priority: TaskPriority; due_date: string | null; sort_key: string; overdue: boolean }[];
  timeline: { created_at: string; to_status: TaskStatus; note: string | null; title: string; task_id: string; actor: string | null }[];
}

/** Tasks grouped by people: Boss -> managers & HR -> their team. */
export interface TaskCounts {
  total: number;
  pending: number;
  done: number;
  overdue: number;
}
export interface TaskTeamMember extends TaskCounts {
  id: string;
  full_name: string;
  role: Role;
  job_title: string | null;
  team_size: number;
  team_pending: number;
}
export interface TaskTeam {
  is_top: boolean;
  leader: TaskCounts & { id: string; full_name: string; role: Role; job_title: string | null };
  members: TaskTeamMember[];
}
