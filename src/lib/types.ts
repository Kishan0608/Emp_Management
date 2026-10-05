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
  email_test_mode?: boolean;
}

export interface MyContext {
  user: AppUser;
  department: string | null;
  manager: string | null;
  organization?: { id: string; name: string } | null;
  mfa_required: boolean;
  aal: 'aal1' | 'aal2';
  settings: AppSettings;
}

export interface Department {
  id: string;
  name: string;
  organization_id?: string | null;
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
  created_at: string;
  updated_at: string;
  assignee?: { full_name: string } | null;
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
  is_published: boolean;
  replies?: FeedbackReply[];
  created_at: string;
  answered_at: string | null;
  resolved_at: string | null;
  author?: { full_name: string } | null;
}

export interface FeedbackReply {
  id: string;
  feedback_id: string;
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
  is_committee?: boolean;
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
  leave_reason?: string | null;
  leave_paid?: boolean | null;
  leave_attachment_path?: string | null;
}

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

export interface AttendanceToday {
  record: AttendanceRecord | null;
  next_action: AttendanceNextAction;
  late_count_this_month: number;
  thresholds: AttendanceThresholds;
}

export interface AttendanceMonthSummary {
  present: number;
  half_day: number;
  absent: number;
  late: number;
}

export interface MyAttendanceMonth {
  records: AttendanceRecord[];
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
}

export interface AttendanceDetail {
  person: { id: string; full_name: string; role: Role };
  records: AttendanceRecord[];
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
