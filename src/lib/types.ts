export type Role = 'boss' | 'hr' | 'manager' | 'employee';
export type TaskStatus = 'assigned' | 'accepted' | 'in_progress' | 'blocked' | 'submitted' | 'approved' | 'returned' | 'closed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskVisibility = 'private' | 'team' | 'company';
export type FeedbackType = 'feedback' | 'question' | 'blocker';
export type FeedbackAudience = 'manager' | 'hr' | 'boss' | 'all';
export type FeedbackStatus = 'open' | 'acknowledged' | 'answered' | 'resolved';
export type ComplaintCategory = 'behaviour' | 'work_quality' | 'attendance' | 'misuse_of_resources' | 'discrimination' | 'safety' | 'other';
export type TriageStatus = 'pending' | 'credible' | 'duplicate' | 'unsubstantiated' | 'malicious';
export type FlagLevel = 'none' | 'yellow' | 'red';
export type CaseStage = 'preliminary_inquiry' | 'show_cause' | 'employee_reply' | 'domestic_inquiry' | 'findings' | 'penalty' | 'written_order' | 'closed';
export type Penalty = 'none' | 'warning' | 'performance_plan' | 'suspension' | 'termination';
export type VisibilityField = 'contact' | 'salary' | 'attendance' | 'task_history' | 'performance';

export interface AppUser {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  department_id: string | null;
  manager_id: string | null;
  job_title: string | null;
  is_active: boolean;
  is_case_handler: boolean;
  must_change_password: boolean;
  consent_version: number | null;
  consent_at: string | null;
  created_at: string;
}

export interface AppSettings {
  company_name: string;
  session_timeout_minutes: number;
  privacy_notice_version: number;
  monthly_complaint_quota: number;
  min_group_size: number;
  yellow_threshold: number;
  red_threshold: number;
  window_days: number;
  blocker_hr_hours: number;
  blocker_boss_hours: number;
  require_mfa_admins: boolean;
  retention_complaint_days: number;
  retention_audit_days: number;
}

export interface MyContext {
  user: AppUser;
  department: string | null;
  manager: string | null;
  is_committee: boolean;
  mfa_required: boolean;
  aal: 'aal1' | 'aal2';
  settings: AppSettings;
}

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
  manager_id: string | null;
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

export interface ComplaintOverviewRow {
  target_id: string;
  full_name: string;
  job_title: string | null;
  role: Role;
  department: string | null;
  total_received: number;
  credible_count: number;
  pending_count: number;
  distinct_in_window: number;
  level: FlagLevel;
  open_case_id: string | null;
}

export interface HrComplaint {
  id: string;
  target_id: string;
  target_name: string;
  target_role: Role;
  category: ComplaintCategory;
  description: string;
  received_date: string;
  triage_status: TriageStatus;
  triage_note: string | null;
}

export interface DisciplinaryCase {
  id: string;
  target_id: string;
  opened_by: string | null;
  stage: CaseStage;
  penalty: Penalty;
  summary: string;
  opened_at: string;
  updated_at: string;
  closed_at: string | null;
  terminated_at: string | null;
  target?: { full_name: string; job_title: string | null } | null;
}

export interface CaseDocument {
  id: string;
  case_id: string;
  stage: CaseStage;
  doc_type: string;
  title: string;
  body: string;
  created_by: string | null;
  created_at: string;
  author?: { full_name: string } | null;
}

export interface ConfidentialReport {
  id: string;
  reporter_name?: string;
  target_name: string | null;
  incident_date: string | null;
  statement?: string;
  committee_status: 'received' | 'under_inquiry' | 'resolved' | 'closed';
  created_at: string;
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
  is_case_handler: boolean;
  is_committee: boolean;
  created_at: string;
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
  open_cases?: number;
  complaints_pending?: number;
  headcount?: Partial<Record<Role, number>>;
  tasks_by_status?: Partial<Record<TaskStatus, number>>;
  tasks_overdue?: number;
  on_time_rate_30d?: number | null;
  flags?: { yellow: number; red: number };
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
