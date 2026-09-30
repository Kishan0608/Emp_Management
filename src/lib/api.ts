import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';
import type {
  AppSettings,
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
  MyContext,
  NotificationRow,
  Role,
  Task,
  TaskEvent,
  TaskPriority,
  TaskStatus,
  TaskVisibility,
  VisibilityField,
  VisibilityRule,
  TeamMemberReport,
  TeamMemberSummary,
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

const USER_FIELDS = 'id, full_name, email, role, job_title, department_id, manager_id, is_active, is_case_handler';
const TASK_SELECT =
  '*, assignee:users!tasks_assignee_id_fkey(full_name), creator:users!tasks_created_by_fkey(full_name), reviewer:users!tasks_reviewer_id_fkey(full_name)';

export const api = {
  // ---------- session ----------
  myContext: async () => check<MyContext>(await supabase.rpc('my_context')),
  recordLogin: async () => check(await supabase.rpc('record_login')),
  recordLogout: async (allDevices: boolean) => check(await supabase.rpc('record_logout', { p_all_devices: allDevices })),
  acceptPrivacy: async () => check(await supabase.rpc('accept_privacy_notice')),
  passwordChanged: async () => check(await supabase.rpc('password_changed')),
  savePushToken: async (userId: string, token: string | null) =>
    check(await supabase.from('users').update({ push_token: token }).eq('id', userId)),
  dashboard: async () => check<DashboardStats>(await supabase.rpc('dashboard_stats')),

  // ---------- people ----------
  taskAssignees: async () => {
    try {
      const res = await supabase.rpc('get_task_assignees');
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        return res.data as DirectoryUser[];
      }
    } catch {}
    return check<DirectoryUser[]>(await supabase.from('users').select(USER_FIELDS).order('full_name').limit(1000));
  },
  directory: async () =>
    check<DirectoryUser[]>(await supabase.from('users').select(USER_FIELDS).order('full_name').limit(1000)),
  departments: async () => check<Department[]>(await supabase.from('departments').select('id, name').order('name')),
  createDepartment: async (name: string) => check(await supabase.from('departments').insert({ name: name.trim() })),
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
  tasks: async (scope: 'mine' | 'assigned' | 'review' | 'team' | 'all', me: string) => {
    let q = supabase.from('tasks').select(TASK_SELECT).order('updated_at', { ascending: false }).limit(200);
    if (scope === 'mine') q = q.eq('assignee_id', me);
    if (scope === 'assigned') q = q.eq('created_by', me).neq('assignee_id', me);
    if (scope === 'review') q = q.eq('reviewer_id', me).eq('status', 'submitted').neq('assignee_id', me);
    if (scope === 'team') q = q.neq('assignee_id', me).eq('is_personal', false);
    return check<Task[]>(await q);
  },
  task: async (id: string) => check<Task>(await supabase.from('tasks').select(TASK_SELECT).eq('id', id).single()),
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

  // ---------- feedback ----------
  feedback: async (scope: 'inbox' | 'mine' | 'qa' | 'blockers' | 'all', me: string) => {
    let q = supabase
      .from('feedback_items')
      .select('*, author:users!feedback_items_author_id_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (scope === 'mine') q = q.eq('author_id', me);
    if (scope === 'qa') q = q.eq('is_published', true);
    if (scope === 'blockers') q = q.eq('type', 'blocker').in('status', ['open', 'acknowledged']);
    if (scope === 'inbox') q = q.or(`author_id.is.null,author_id.neq.${me}`);
    return check<FeedbackItem[]>(await q);
  },
  feedbackItem: async (id: string) =>
    check<FeedbackItem>(
      await supabase.from('feedback_items').select('*, author:users!feedback_items_author_id_fkey(full_name)').eq('id', id).single(),
    ),
  feedbackReplies: async (id: string) =>
    check<FeedbackReply[]>(
      await supabase
        .from('feedback_replies')
        .select('*, responder:users!feedback_replies_responder_id_fkey(full_name, role)')
        .eq('feedback_id', id)
        .order('created_at'),
    ),
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
  replyFeedback: async (id: string, body: string, publish: boolean) =>
    check(await supabase.rpc('reply_feedback', { p_id: id, p_body: body, p_publish: publish })),
  setFeedbackStatus: async (id: string, status: FeedbackStatus) =>
    check(await supabase.rpc('set_feedback_status', { p_id: id, p_status: status })),
  setFeedbackPublished: async (id: string, published: boolean) =>
    check(await supabase.rpc('set_feedback_published', { p_id: id, p_published: published })),

  // ---------- self sign-up & onboarding ----------
  signupStart: async (email: string, password: string) =>
    invokeFn<{ ok: true; sent_to: string; test_code?: string }>('signup-start', { email, password }),
  onboardingState: async () => check<OnboardingState>(await supabase.rpc('onboarding_state')),
  sendCode: async (purpose: 'email' | 'approver') =>
    invokeFn<{ ok: true; sent_to: string; test_code?: string }>('onboarding-mail', { purpose }),
  verifyEmail: async (code: string) => check(await supabase.rpc('onboarding_verify_email', { p_code: code })),
  verifyKey: async (key: string) => check(await supabase.rpc('onboarding_verify_key', { p_key: key })),
  onboardingOptions: async () => check<OnboardingOptions>(await supabase.rpc('onboarding_options')),
  submitProfile: async (p: { first: string; last: string; jobTitle: string; departmentId: string; reportsTo: string; role: Role }) => {
    const res = await supabase.rpc('onboarding_submit_profile', {
      p_first: p.first,
      p_middle: null,
      p_last: p.last,
      p_job_title: p.jobTitle,
      p_department: p.departmentId,
      p_reports_to: p.reportsTo,
      p_role: p.role,
    });
    if (res.error && (res.error.message?.includes('Could not find the function') || res.error.code === 'PGRST202')) {
      return check(
        await supabase.rpc('onboarding_submit_profile', {
          p_first: p.first,
          p_last: p.last,
          p_job_title: p.jobTitle,
          p_department: p.departmentId,
          p_reports_to: p.reportsTo,
          p_role: p.role,
        }),
      );
    }
    return check(res);
  },
  confirmApprover: async (code: string) => check(await supabase.rpc('onboarding_confirm_approver', { p_code: code })),
  passwordResetStart: async (email: string) =>
    invokeFn<{ ok: true; sent_to: string; test_code?: string }>('password-reset', { action: 'start', email }),
  passwordResetComplete: async (email: string, code: string, password: string) =>
    invokeFn<{ ok: true }>('password-reset', { action: 'complete', email, code, password }),


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
