import { colors } from '@/theme/tokens';

import type {
  CaseStage,
  ComplaintCategory,
  FeedbackAudience,
  FeedbackStatus,
  FeedbackType,
  FlagLevel,
  Penalty,
  Role,
  TaskPriority,
  TaskStatus,
  TriageStatus,
  VisibilityField,
} from './types';

export const roleLabel: Record<Role, string> = { boss: 'Boss', hr: 'HR', manager: 'Manager', employee: 'Employee' };

export const taskStatusLabel: Record<TaskStatus, string> = {
  assigned: 'Assigned',
  accepted: 'Accepted',
  in_progress: 'In progress',
  blocked: 'Blocked',
  submitted: 'Submitted',
  approved: 'Approved',
  returned: 'Returned',
  closed: 'Closed',
};

export const taskStatusTone: Record<TaskStatus, Tone> = {
  assigned: 'neutral',
  accepted: 'info',
  in_progress: 'brand',
  blocked: 'danger',
  submitted: 'warning',
  approved: 'success',
  returned: 'danger',
  closed: 'neutral',
};

export const priorityLabel: Record<TaskPriority, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
export const priorityTone: Record<TaskPriority, Tone> = { low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger' };

export const feedbackTypeLabel: Record<FeedbackType, string> = { feedback: 'Feedback', question: 'Question', blocker: 'Blocker' };
export const feedbackTypeTone: Record<FeedbackType, Tone> = { feedback: 'info', question: 'brand', blocker: 'danger' };
export const audienceLabel: Record<FeedbackAudience, string> = { manager: 'My manager', hr: 'HR', boss: 'Boss', all: 'Manager & HR' };
export const feedbackStatusLabel: Record<FeedbackStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  answered: 'Answered',
  resolved: 'Resolved',
};
export const feedbackStatusTone: Record<FeedbackStatus, Tone> = {
  open: 'warning',
  acknowledged: 'info',
  answered: 'brand',
  resolved: 'success',
};

export const complaintCategoryLabel: Record<ComplaintCategory, string> = {
  behaviour: 'Behaviour / conduct',
  work_quality: 'Work quality',
  attendance: 'Attendance / punctuality',
  misuse_of_resources: 'Misuse of resources',
  discrimination: 'Discrimination',
  safety: 'Safety',
  other: 'Other',
};

export const triageLabel: Record<TriageStatus, string> = {
  pending: 'Pending',
  credible: 'Credible',
  duplicate: 'Duplicate',
  unsubstantiated: 'Unsubstantiated',
  malicious: 'Malicious',
};
export const triageTone: Record<TriageStatus, Tone> = {
  pending: 'warning',
  credible: 'danger',
  duplicate: 'neutral',
  unsubstantiated: 'neutral',
  malicious: 'info',
};

export const flagTone: Record<FlagLevel, Tone> = { none: 'neutral', yellow: 'warning', red: 'danger' };
export const flagLabel: Record<FlagLevel, string> = { none: 'Logged', yellow: 'Yellow · watch', red: 'Red · review' };

export const caseStages: CaseStage[] = [
  'preliminary_inquiry',
  'show_cause',
  'employee_reply',
  'domestic_inquiry',
  'findings',
  'penalty',
  'written_order',
  'closed',
];
export const caseStageLabel: Record<CaseStage, string> = {
  preliminary_inquiry: 'Preliminary inquiry',
  show_cause: 'Show-cause notice',
  employee_reply: 'Employee reply',
  domestic_inquiry: 'Domestic inquiry',
  findings: 'Findings',
  penalty: 'Penalty decided',
  written_order: 'Written order',
  closed: 'Closed',
};
export const penaltyLabel: Record<Penalty, string> = {
  none: 'No penalty',
  warning: 'Written warning',
  performance_plan: 'Performance plan',
  suspension: 'Suspension',
  termination: 'Termination',
};

export const fieldLabel: Record<VisibilityField, string> = {
  contact: 'Contact details',
  salary: 'Salary',
  attendance: 'Attendance',
  task_history: 'Task history',
  performance: 'Performance',
};

export type Tone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger';

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textSecondary, bg: '#F0EDE6' },
  brand: { fg: colors.brand, bg: colors.brandSoft },
  info: { fg: colors.info, bg: colors.infoSoft },
  success: { fg: colors.success, bg: colors.successSoft },
  warning: { fg: colors.warning, bg: colors.warningSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  const hh = d.getHours() % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hh}:${mm} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

export function timeAgo(value: string): string {
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(value);
}

export function dueLabel(due: string | null, status: TaskStatus): { text: string; tone: Tone } | null {
  if (!due) return null;
  if (status === 'approved' || status === 'closed') return { text: `Due ${formatDate(due)}`, tone: 'neutral' };
  const today = new Date(toDateOnly(new Date()) + 'T00:00:00').getTime();
  const d = new Date(due + 'T00:00:00').getTime();
  const days = Math.round((d - today) / 86400000);
  if (days < 0) return { text: `Overdue ${-days}d`, tone: 'danger' };
  if (days === 0) return { text: 'Due today', tone: 'warning' };
  if (days === 1) return { text: 'Due tomorrow', tone: 'warning' };
  return { text: `Due ${formatDate(due)}`, tone: 'neutral' };
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const AVATAR_COLORS = ['#9C7415', '#0D9488', '#DB2777', '#D97706', '#2563EB', '#7C3AED', '#059669', '#DC2626'];
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatINR(value: number | null | undefined): string {
  if (value == null) return '—';
  return '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
