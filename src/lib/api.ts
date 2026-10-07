import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';
import type {
  AppSettings,
  AppLockConfig,
  AppLockType,
  AttendanceDetail,
  AttendanceOverviewRow,
  AttendanceRecord,
  AttendanceToday,
  AuditLog,
  ChecklistItem,
  DashboardStats,
  Department,
  DirectoryUser,
  EmployeeProfile,
  FeedbackAudience,
  FeedbackItem,
  FeedbackReply,
  FeedbackStatus,
  FeedbackType,
  Holiday,
  HolidayKind,
  LeaveBalance,
  LeaveType,
  LiveLocation,
  LocationDeviceStatus,
  LocationDay,
  LocationPoint,
  MyAttendanceMonth,
  MyContext,
  NotificationRow,
  Organization,
  Role,
  Task,
  TaskTeam,
  TaskEvent,
  TaskPriority,
  TaskQuestion,
  TaskStatus,
  TaskVisibility,
  VisibilityField,
  VisibilityRule,
  TeamMemberReport,
  TeamMemberSummary,
  PunchRow,
} from './types';

export type OnboardingStatus = 'invited' | 'email_pending' | 'email_verified' | 'key_verified' | 'approver_pending' | 'awaiting_approval' | 'active';

export interface OnboardingState {
  status: OnboardingStatus;
  email: string;
  google: boolean;
  first_name: string | null;
  last_name: string | null;
  approver_name: string | null;
  approver_role: Role | null;
  code_sent_to: string | null;
  code_expires_at: string | null;
}

export interface OnboardingOptions {
  departments: { id: string; name: string }[];
  approvers: { id: string; full_name: string; role: Role; job_title: string | null; department: string | null }[];
  organization?: { id: string; name: string } | null;
  organizations?: { id: string; name: string }[];
}

/** Turns any Supabase / network error into one readable sentence. */
export function errorMessage(e: unknown): string {
  if (!e) return 'Something went wrong';
  if (typeof e === 'string') return e;
  const anyE = e as { message?: string; details?: string };
  const msg = anyE.message ?? 'Something went wrong';
  if (msg.includes('Failed to fetch') || msg.includes('Network request failed')) {
    return 'No connection. Check your internet and try again.';
  }
  if (msg.includes('JWT expired')) return 'Your session expired. Please sign in again.';
  return msg;
}

function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw new Error(errorMessage(res.error));
  return res.data as T;
}

async function invokeFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? 'Request failed');
    }
    throw new Error(errorMessage(error));
  }
  return data as T;
}

const USER_FIELDS = 'id, full_name, email, role, job_title, department_id, organization_id, manager_id, is_active, is_case_handler';
const TASK_SELECT =
  '*, assignee:users!tasks_assignee_id_fkey(full_name, organization_id, department_id), creator:users!tasks_created_by_fkey(full_name), reviewer:users!tasks_reviewer_id_fkey(full_name)';

export const api = {
  // ---------- session ----------
  myContext: async () => check<MyContext>(await supabase.rpc('my_context')),
  syncGoogleUser: async (orgId?: string) =>
    check<MyContext>(await supabase.rpc('sync_google_user', { p_org: orgId ?? null })),
  recordLogin: async () => check(await supabase.rpc('record_login')),
  recordLogout: async (allDevices: boolean) => check(await supabase.rpc('record_logout', { p_all_devices: allDevices })),
  acceptPrivacy: async () => check(await supabase.rpc('accept_privacy_notice')),
  passwordChanged: async () => check(await supabase.rpc('password_changed')),
  /** Ties this phone to the signed-in account (and removes it from any other account); null unregisters it. */
  setPushToken: async (token: string | null) => check(await supabase.rpc('set_my_push_token', { p_token: token })),
  dashboard: async (orgId?: string | null) => check<DashboardStats>(await supabase.rpc('dashboard_stats', { p_org: orgId ?? null })),
  organizations: async () => check<Organization[]>(await supabase.from('organizations').select('*').eq('is_active', true).order('name')),
  allOrganizations: async () => check<Organization[]>(await supabase.from('organizations').select('*').order('name')),
  createOrganization: async (name: string) => check<string>(await supabase.rpc('create_organization', { p_name: name.trim() })),
  updateOrganization: async (id: string, name: string) => {
    try {
      const res = await supabase.rpc('update_organization', { p_id: id, p_name: name.trim() });
      if (!res.error) return res.data;
    } catch {}
    return check(await supabase.from('organizations').update({ name: name.trim() }).eq('id', id));
  },
  deleteOrganization: async (id: string) => {
    const countRes = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('organization_id', id);
    if ((countRes.count ?? 0) > 0) {
      throw new Error(`Cannot delete this company: ${(countRes.count ?? 0)} ${(countRes.count ?? 0) === 1 ? 'employee is' : 'employees are'} currently assigned to it.`);
    }
    try {
      const res = await supabase.rpc('delete_organization', { p_id: id });
      if (!res.error) return res.data;
    } catch {}
    const delRes = await supabase.from('organizations').delete().eq('id', id);
    if (!delRes.error) return check(delRes);
    return check(await supabase.from('organizations').update({ is_active: false }).eq('id', id));
  },
  getAppLock: async () => check<AppLockConfig | null>(await supabase.rpc('get_my_app_lock')),
  saveAppLock: async (p: {
    enabled: boolean;
    type?: AppLockType;
    passcode_hash?: string | null;
    passcode_salt?: string | null;
    pattern_hash?: string | null;
    pattern_salt?: string | null;
    biometric_enabled?: boolean;
  }) =>
    check<AppLockConfig>(
      await supabase.rpc('save_my_app_lock', {
        p_enabled: p.enabled,
        p_type: p.type ?? 'passcode',
        p_passcode_hash: p.passcode_hash ?? null,
        p_passcode_salt: p.passcode_salt ?? null,
        p_pattern_hash: p.pattern_hash ?? null,
        p_pattern_salt: p.pattern_salt ?? null,
        p_biometric_enabled: p.biometric_enabled ?? false,
      }),
    ),
  verifyAppLock: async (type: 'passcode' | 'pattern', secret: string) =>
    check<boolean>(await supabase.rpc('verify_my_app_lock', { p_type: type, p_secret: secret })),

  // ---------- people ----------
  taskAssignees: async (orgId?: string | null) => {
    try {
      const res = await supabase.rpc('get_task_assignees');
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        return (orgId ? res.data.filter((u: any) => !u.organization_id || u.organization_id === orgId || u.role === 'boss') : res.data) as DirectoryUser[];
      }
    } catch {}
    let q = supabase.from('users').select(USER_FIELDS).order('full_name').limit(1000);
    if (orgId) q = q.or(`organization_id.eq.${orgId},role.eq.boss,organization_id.is.null`);
    return check<DirectoryUser[]>(await q);
  },
  directory: async (orgId?: string | null) => {
    try {
      let q = supabase.from('users').select(USER_FIELDS).order('full_name').limit(1000);
      if (orgId) q = q.or(`organization_id.eq.${orgId},role.eq.boss,organization_id.is.null`);
      const res = await q;
      if (res.error) {
        try {
          const rpcRes = await supabase.rpc('get_task_assignees');
          if (rpcRes.data && Array.isArray(rpcRes.data) && rpcRes.data.length > 0) {
            return (orgId ? rpcRes.data.filter((u: any) => !u.organization_id || u.organization_id === orgId || u.role === 'boss') : rpcRes.data) as DirectoryUser[];
          }
        } catch {}
      }
      return check<DirectoryUser[]>(res);
    } catch (err) {
      try {
        const rpcRes = await supabase.rpc('get_task_assignees');
        if (rpcRes.data && Array.isArray(rpcRes.data) && rpcRes.data.length > 0) {
          return (orgId ? rpcRes.data.filter((u: any) => !u.organization_id || u.organization_id === orgId || u.role === 'boss') : rpcRes.data) as DirectoryUser[];
        }
      } catch {}
      throw err;
    }
  },
  departments: async () => check<Department[]>(await supabase.from('departments').select('id, name').order('name')),
  createDepartment: async (name: string) => check(await supabase.from('departments').insert({ name: name.trim() })),
  deleteDepartment: async (id: string) => check(await supabase.from('departments').delete().eq('id', id)),
  profile: async (id: string) => check<EmployeeProfile>(await supabase.rpc('get_employee_profile', { p_target: id })),
  teamOverview: async () => check<TeamMemberSummary[]>(await supabase.rpc('team_overview')),
  teamMemberReport: async (id: string) => check<TeamMemberReport>(await supabase.rpc('team_member_report', { p_target: id })),
  updateUser: async (p: {
    id: string;
    role: Role;
    department_id: string | null;
    manager_id: string | null;
    job_title: string | null;
    is_active: boolean;
    is_case_handler: boolean;
  }) =>
    check(
      await supabase.rpc('admin_update_user', {
        p_user_id: p.id,
        p_role: p.role,
        p_department_id: p.department_id,
        p_manager_id: p.manager_id,
        p_job_title: p.job_title ?? '',
        p_is_active: p.is_active,
        p_is_case_handler: p.is_case_handler,
      }),
    ),
  setEmployeeDetails: async (p: {
    id: string;
    phone: string | null;
    personal_email: string | null;
    address: string | null;
    salary: number | null;
    attendance: number | null;
    performance: number | null;
    joined_on: string | null;
  }) =>
    check(
      await supabase.rpc('admin_set_employee_details', {
        p_user_id: p.id,
        p_phone: p.phone,
        p_personal_email: p.personal_email,
        p_address: p.address,
        p_salary: p.salary,
        p_attendance: p.attendance,
        p_performance: p.performance,
        p_joined_on: p.joined_on,
      }),
    ),
  /** Self-service: phone, personal email, address, joining date only. Salary/attendance/performance stay admin-managed. */
  updateMyContactDetails: async (p: { phone: string | null; personal_email: string | null; address: string | null; joined_on: string | null }) =>
    check(
      await supabase.rpc('update_my_contact_details', {
        p_phone: p.phone,
        p_personal_email: p.personal_email,
        p_address: p.address,
        p_joined_on: p.joined_on,
      }),
    ),
  invite: async (p: { email: string; full_name: string; role: Role; department_id: string | null; manager_id: string | null; job_title: string }) =>
    invokeFn<{ ok: true; user_id: string; activation_key: string }>('invite-user', p),

  // ---------- visibility ----------
  visibilityRules: async () =>
    check<VisibilityRule[]>(await supabase.from('visibility_rules').select('id, viewer_id, viewer_role, field_name, allowed, updated_at')),
  setVisibility: async (viewer: { id?: string; role?: Role }, field: VisibilityField, allowed: boolean) =>
    check(
      await supabase.rpc('admin_set_visibility', {
        p_viewer_id: viewer.id ?? null,
        p_viewer_role: viewer.role ?? null,
        p_field: field,
        p_allowed: allowed,
      }),
    ),
  clearPersonVisibility: async (viewerId: string, field: VisibilityField) =>
    check(await supabase.rpc('admin_clear_person_visibility', { p_viewer_id: viewerId, p_field: field })),

  // ---------- tasks ----------
  tasks: async (scope: 'mine' | 'assigned' | 'review' | 'team' | 'all', me: string, orgId?: string | null) => {
    let q = supabase.from('tasks').select(TASK_SELECT).order('updated_at', { ascending: false }).limit(200);
    if (scope === 'mine') q = q.eq('assignee_id', me);
    if (scope === 'assigned') q = q.eq('created_by', me).neq('assignee_id', me);
    if (scope === 'review') q = q.eq('reviewer_id', me).eq('status', 'submitted').neq('assignee_id', me);
    if (scope === 'team') q = q.neq('assignee_id', me).eq('is_personal', false);
    const res = await q;
    const items = check<Task[]>(res);
    if (orgId && (scope === 'team' || scope === 'all' || scope === 'assigned')) {
      return items.filter((t: any) => !t.assignee?.organization_id || t.assignee?.organization_id === orgId);
    }
    return items;
  },
  task: async (id: string) => check<Task>(await supabase.from('tasks').select(TASK_SELECT).eq('id', id).single()),
  /** A person's team with task counts; no id = my own team (for the Boss: every manager and HR). */
  taskTeam: async (leader?: string) => check<TaskTeam>(await supabase.rpc('task_team', { p_leader: leader ?? null })),
  /** Work tasks one person gave to other people. */
  tasksGivenBy: async (person: string) =>
    check<Task[]>(await supabase.from('tasks').select(TASK_SELECT).eq('created_by', person).neq('assignee_id', person).eq('is_personal', false).order('updated_at', { ascending: false }).limit(200)),
  /** Work tasks assigned to one person (personal to-dos excluded). */
  personTasks: async (person: string) =>
    check<Task[]>(await supabase.from('tasks').select(TASK_SELECT).eq('assignee_id', person).eq('is_personal', false).order('updated_at', { ascending: false }).limit(200)),
  /** Status history of a task, oldest first (from task_events; readable whenever the task is). */
  taskEvents: async (id: string) =>
    check<TaskEvent[]>(
      await supabase
        .from('task_events')
        .select('*, actor:users!task_events_actor_id_fkey(full_name)')
        .eq('task_id', id)
        .order('created_at', { ascending: true }),
    ),
  createTask: async (p: {
    title: string;
    description: string;
    assignee: string;
    reviewer: string | null;
    priority: TaskPriority;
    due: string | null;
    visibility: TaskVisibility;
    checklist: ChecklistItem[];
  }) =>
    check<string>(
      await supabase.rpc('create_task', {
        p_title: p.title,
        p_description: p.description,
        p_assignee: p.assignee,
        p_reviewer: p.reviewer,
        p_priority: p.priority,
        p_due: p.due,
        p_visibility: p.visibility,
        p_checklist: p.checklist,
      }),
    ),
  changeTaskStatus: async (id: string, to: TaskStatus, note?: string, proofUrl?: string) =>
    check(await supabase.rpc('change_task_status', { p_task: id, p_to: to, p_note: note ?? null, p_proof_url: proofUrl ?? null })),
  updateChecklist: async (id: string, checklist: ChecklistItem[]) =>
    check(await supabase.rpc('update_task_checklist', { p_task: id, p_checklist: checklist })),
  uploadTaskFile: async (taskId: string, file: { uri: string; name: string; mimeType?: string | null }) => {
    const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
    const path = `${taskId}/${Date.now()}_${safeName}`;
    const bytes = await (await fetch(file.uri)).arrayBuffer();
    const up = await supabase.storage.from('task-files').upload(path, bytes, { contentType: file.mimeType ?? 'application/octet-stream' });
    if (up.error) throw new Error(errorMessage(up.error));
    check(await supabase.rpc('add_task_attachment', { p_task: taskId, p_path: path, p_name: file.name }));
    return path;
  },
  fileUrl: async (path: string) => {
    const { data, error } = await supabase.storage.from('task-files').createSignedUrl(path, 300);
    if (error) throw new Error(errorMessage(error));
    return data.signedUrl;
  },
  taskQuestions: async (taskId: string) =>
    check<TaskQuestion[]>(await supabase.rpc('get_task_questions', { p_task: taskId })),
  askTaskQuestion: async (taskId: string, title: string, body: string) =>
    check<string>(await supabase.rpc('ask_task_question', { p_task: taskId, p_title: title, p_body: body })),
  replyTaskQuestion: async (questionId: string, body: string) =>
    check<boolean>(await supabase.rpc('reply_task_question', { p_question_id: questionId, p_body: body })),

  feedback: async (
    scope: 'inbox' | 'mine' | 'blockers' | 'all',
    me: string,
    isStaff?: boolean,
    orgId?: string | null,
  ) => {
    let q = supabase
      .from('feedback_items')
      .select('*, author:users!feedback_items_author_id_fkey(full_name, organization_id)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (scope === 'mine') {
      q = q.eq('author_id', me);
    } else if (scope === 'blockers') {
      q = q.eq('type', 'blocker').in('status', ['open', 'acknowledged']);
    } else if (scope === 'inbox') {
      if (isStaff) {
        q = q.or(`author_id.is.null,author_id.neq.${me}`);
      } else {
        q = q.eq('author_id', me);
      }
    }
    const res = await q;
    const items = check<FeedbackItem[]>(res);
    if (orgId && (scope === 'inbox' || scope === 'blockers' || scope === 'all')) {
      return items.filter((f: any) => !f.author?.organization_id || f.author?.organization_id === orgId);
    }
    return items;
  },
  feedbackCounts: async (me: string, isStaff?: boolean) => {
    try {
      const [inboxRes, mineRes, blockersRes] = await Promise.all([
        isStaff
          ? supabase
              .from('feedback_items')
              .select('*', { count: 'exact', head: true })
              .or(`author_id.is.null,author_id.neq.${me}`)
              .in('status', ['open', 'acknowledged'])
          : supabase
              .from('feedback_items')
              .select('*', { count: 'exact', head: true })
              .eq('author_id', me)
              .in('status', ['open', 'acknowledged', 'answered']),
        supabase
          .from('feedback_items')
          .select('*', { count: 'exact', head: true })
          .eq('author_id', me),
        supabase
          .from('feedback_items')
          .select('*', { count: 'exact', head: true })
          .eq('type', 'blocker')
          .in('status', ['open', 'acknowledged']),
      ]);
      return {
        inbox: inboxRes.count ?? 0,
        mine: mineRes.count ?? 0,
        blockers: blockersRes.count ?? 0,
      };
    } catch {
      return { inbox: 0, mine: 0, blockers: 0 };
    }
  },
  feedbackItem: async (id: string) =>
    check<FeedbackItem>(
      await supabase.from('feedback_items').select('*, author:users!feedback_items_author_id_fkey(full_name)').eq('id', id).single(),
    ),
  // Replies live inside the item (feedback_items.replies), oldest first.
  feedbackReplies: async (id: string) => {
    const row = check<{ replies: FeedbackReply[] | null }>(await supabase.from('feedback_items').select('replies').eq('id', id).single());
    return (row.replies ?? []).map((r) => ({ ...r, feedback_id: id }));
  },
  submitFeedback: async (p: { type: FeedbackType; audience: FeedbackAudience; title: string; body: string; anonymous: boolean; taskId?: string | null }) =>
    check<string>(
      await supabase.rpc('submit_feedback', {
        p_type: p.type,
        p_audience: p.audience,
        p_title: p.title,
        p_body: p.body,
        p_anonymous: p.anonymous,
        p_task: p.taskId ?? null,
      }),
    ),
  replyFeedback: async (id: string, body: string) =>
    check(await supabase.rpc('reply_feedback', { p_id: id, p_body: body })),
  setFeedbackStatus: async (id: string, status: FeedbackStatus) =>
    check(await supabase.rpc('set_feedback_status', { p_id: id, p_status: status })),

  // ---------- self sign-up & onboarding ----------
  signupStart: async (email: string, password: string, organizationId?: string) =>
    invokeFn<{ ok: true; sent_to: string; test_code?: string }>('signup-start', { email, password, organization_id: organizationId }),
  onboardingState: async () => check<OnboardingState>(await supabase.rpc('onboarding_state')),
  sendCode: async (purpose: 'email' | 'approver') =>
    invokeFn<{ ok: true; sent_to: string; test_code?: string }>('onboarding-mail', { purpose }),
  verifyEmail: async (code: string) => check(await supabase.rpc('onboarding_verify_email', { p_code: code })),
  verifyKey: async (key: string) => check(await supabase.rpc('onboarding_verify_key', { p_key: key })),
  onboardingOptions: async () => check<OnboardingOptions>(await supabase.rpc('onboarding_options')),
  submitProfile: async (p: { first: string; last: string; jobTitle: string; departmentId: string; reportsTo: string; role: Role }) =>
    check(
      await supabase.rpc('onboarding_submit_profile', {
        p_first: p.first,
        p_last: p.last,
        p_job_title: p.jobTitle,
        p_department: p.departmentId,
        p_reports_to: p.reportsTo,
        p_role: p.role,
      }),
    ),
  confirmApprover: async (code: string) => check(await supabase.rpc('onboarding_confirm_approver', { p_code: code })),
  passwordResetStart: async (email: string) =>
    invokeFn<{ ok: true; sent_to: string; test_code?: string }>('password-reset', { action: 'start', email }),
  passwordResetComplete: async (email: string, code: string, password: string) =>
    invokeFn<{ ok: true }>('password-reset', { action: 'complete', email, code, password }),


  // ---------- attendance ----------
  attendanceToday: async () => check<AttendanceToday>(await supabase.rpc('attendance_today')),
  /** 'app' = employees punch in the app; 'machine' = the company's punching machine is the source. */
  orgAttendanceSource: async (orgId: string) =>
    check<{ attendance_source: 'app' | 'machine' }>(await supabase.from('organizations').select('attendance_source').eq('id', orgId).single()),
  setAttendanceSource: async (orgId: string, source: 'app' | 'machine') =>
    check(await supabase.rpc('set_attendance_source', { p_org: orgId, p_source: source })),
  importPunchRecords: async (orgId: string, rows: PunchRow[]) =>
    check<{ imported: number; skipped: { email: string; reason: string }[] }>(
      await supabase.rpc('import_punch_records', { p_org: orgId, p_rows: rows }),
    ),
  clockIn: async () => check<AttendanceToday>(await supabase.rpc('clock_in')),
  breakStart: async () => check<AttendanceToday>(await supabase.rpc('break_start')),
  breakEnd: async () => check<AttendanceToday>(await supabase.rpc('break_end')),
  clockOut: async () => check<AttendanceToday>(await supabase.rpc('clock_out')),
  myAttendance: async (month: string) => check<MyAttendanceMonth>(await supabase.rpc('my_attendance', { p_month: month })),
  attendanceOverview: async (month: string) => check<AttendanceOverviewRow[]>(await supabase.rpc('attendance_overview', { p_month: month })),
  attendanceDetail: async (id: string, month: string) => check<AttendanceDetail>(await supabase.rpc('attendance_detail', { p_target: id, p_month: month })),
  // ---------- location tracking ----------
  setLocationSharing: async (enabled: boolean) => check<boolean>(await supabase.rpc('set_my_location_sharing', { p_enabled: enabled })),
  reportLocationStatus: async (status: LocationDeviceStatus) => check(await supabase.rpc('report_location_status', { p_status: status })),
  recordLocationPoints: async (points: LocationPoint[]) => check<number>(await supabase.rpc('record_location_points', { p_points: points })),
  /** `log` is true only for a deliberate screen open; background refreshes leave it false so the audit log stays readable. */
  liveLocations: async (log = false) => check<LiveLocation[]>(await supabase.rpc('location_live', { p_log: log })),
  locationDay: async (id: string, date: string, log = false) =>
    check<LocationDay>(await supabase.rpc('location_day', { p_target: id, p_date: date, p_log: log })),

  setSalary: async (userId: string, salary: number) => check(await supabase.rpc('admin_set_salary', { p_user_id: userId, p_salary: salary })),
  /** HR/Boss only: fix a day's punches (e.g. an employee forgot to clock out). Pass null to clear a field. */
  hrEditAttendance: async (
    userId: string,
    workDate: string,
    punches: { clock_in_at: string | null; break_start_at: string | null; break_end_at: string | null; clock_out_at: string | null },
  ) =>
    check<AttendanceRecord>(
      await supabase.rpc('hr_edit_attendance', {
        p_user_id: userId,
        p_work_date: workDate,
        p_clock_in: punches.clock_in_at,
        p_break_start: punches.break_start_at,
        p_break_end: punches.break_end_at,
        p_clock_out: punches.clock_out_at,
      }),
    ),
  /**
   * HR/Boss only: approve a day as leave. `paid` null follows the yearly quota (paid while it lasts);
   * true/false is HR's own choice. Unpaid leave is deducted like an absent day.
   */
  hrMarkLeave: async (userId: string, workDate: string, reason: string, attachmentPath: string | null, leaveType: LeaveType, paid: boolean | null) =>
    check<AttendanceRecord>(
      await supabase.rpc('hr_mark_leave', {
        p_user_id: userId,
        p_work_date: workDate,
        p_reason: reason,
        p_attachment_path: attachmentPath,
        p_leave_type: leaveType,
        p_paid: paid,
      }),
    ),
  // ---------- holidays ----------
  /** The year's holidays: Boss/HR see every company's, everyone else the ones that apply to them. */
  listHolidays: async (year: number) => check<Holiday[]>(await supabase.rpc('list_holidays', { p_year: year })),
  /** Boss/HR: add one day or a range (`to` inclusive). Returns how many days were saved. */
  addHoliday: async (h: { name: string; from: string; to: string | null; kind: HolidayKind; organizationId: string | null }) =>
    check<number>(
      await supabase.rpc('hr_add_holiday', { p_name: h.name, p_from: h.from, p_to: h.to, p_kind: h.kind, p_org: h.organizationId }),
    ),
  updateHoliday: async (id: string, name: string, kind: HolidayKind) =>
    check(await supabase.rpc('hr_update_holiday', { p_id: id, p_name: name, p_kind: kind })),
  deleteHoliday: async (id: string) => check(await supabase.rpc('hr_delete_holiday', { p_id: id })),
  hrCancelLeave: async (userId: string, workDate: string) => check(await supabase.rpc('hr_cancel_leave', { p_user_id: userId, p_work_date: workDate })),
  /** HR/Boss see any employee's balance; an employee can see their own. */
  leaveBalance: async (userId: string, year?: number) =>
    check<LeaveBalance>(await supabase.rpc('leave_balance', { p_user_id: userId, p_year: year ?? null })),
  uploadLeaveAttachment: async (userId: string, file: { uri: string; name: string; mimeType?: string | null }) => {
    const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
    const path = `${userId}/${Date.now()}_${safeName}`;
    const bytes = await (await fetch(file.uri)).arrayBuffer();
    const up = await supabase.storage.from('leave-attachments').upload(path, bytes, { contentType: file.mimeType ?? 'application/octet-stream' });
    if (up.error) throw new Error(errorMessage(up.error));
    return path;
  },
  leaveAttachmentUrl: async (path: string) => {
    const { data, error } = await supabase.storage.from('leave-attachments').createSignedUrl(path, 300);
    if (error) throw new Error(errorMessage(error));
    return data.signedUrl;
  },

  // ---------- notifications ----------
  notifications: async () =>
    check<NotificationRow[]>(
      await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100),
    ),
  markRead: async (id: string) => check(await supabase.from('notifications').update({ is_read: true }).eq('id', id)),
  markAllRead: async (me: string) =>
    check(await supabase.from('notifications').update({ is_read: true }).eq('user_id', me).eq('is_read', false)),

  // ---------- admin ----------
  updateSettings: async (patch: Partial<AppSettings>) =>
    check(await supabase.from('app_settings').update(patch).eq('id', 1)),
  auditLogs: async (limit = 150) =>
    check<AuditLog[]>(
      await supabase
        .from('audit_logs')
        .select('*, actor:users!audit_logs_actor_id_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(limit),
    ),
};
