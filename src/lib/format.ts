import { colors } from '@/theme/tokens';

import type {
  AttendanceStatus,
  FeedbackAudience,
  FeedbackStatus,
  FeedbackType,
  Role,
  TaskPriority,
  TaskStatus,
  VisibilityField,
} from './types';

export type Tone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger';

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textSecondary, bg: '#F0EDE6' },
  brand: { fg: colors.brand, bg: colors.brandSoft },
  info: { fg: colors.info, bg: colors.infoSoft },
  success: { fg: colors.success, bg: colors.successSoft },
  warning: { fg: colors.warning, bg: colors.warningSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
};

export const roleLabel: Record<Role, string> = {
  boss: 'Boss',
  hr: 'HR',
  manager: 'Manager',
  employee: 'Employee',
};

export const taskStatusLabel: Record<TaskStatus, string> = {
  assigned: 'Assigned',
  accepted: 'Accepted',
  in_progress: 'In progress',
  blocked: 'Blocked',
  submitted: 'Submitted',
  approved: 'Approved',
  returned: 'Returned',
  closed: 'Done',
};

export const taskStatusTone: Record<TaskStatus, Tone> = {
  assigned: 'neutral',
  accepted: 'info',
  in_progress: 'brand',
  blocked: 'danger',
  submitted: 'warning',
  approved: 'success',
  returned: 'danger',
  closed: 'success',
};

export const priorityLabel: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const priorityTone: Record<TaskPriority, Tone> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
};

export const feedbackTypeLabel: Record<FeedbackType, string> = {
  feedback: 'Feedback',
  question: 'Question',
  blocker: 'Blocker',
};

export const feedbackTypeTone: Record<FeedbackType, Tone> = {
  feedback: 'info',
  question: 'brand',
  blocker: 'danger',
};

export const audienceLabel: Record<FeedbackAudience, string> = {
  manager: 'Reporting manager',
  hr: 'HR',
  boss: 'Boss',
  all: 'Manager & HR',
};

export type FeedbackDisplayIcon =
  | 'briefcase-outline'
  | 'help-circle-outline'
  | 'calendar-outline'
  | 'hand-left-outline'
  | 'chatbubble-ellipses-outline';

export interface FeedbackDisplay {
  label: string;
  tone: Tone;
  icon: FeedbackDisplayIcon;
  cleanTitle: string;
}

export function resolveFeedbackDisplay(item: { type: FeedbackType; title: string }): FeedbackDisplay {
  if (item.title.startsWith('[Leave]')) {
    return {
      label: 'Leave',
      tone: 'warning',
      icon: 'calendar-outline',
      cleanTitle: item.title.replace(/^\[Leave\]\s*/, ''),
    };
  }
  if (item.type === 'question') {
    if (item.title.startsWith('[Work Question]') || item.title.startsWith('[Work]')) {
      return {
        label: 'Work question',
        tone: 'brand',
        icon: 'briefcase-outline',
        cleanTitle: item.title.replace(/^\[(Work Question|Work)\]\s*/, ''),
      };
    }
    if (item.title.startsWith('[General Question]') || item.title.startsWith('[General]')) {
      return {
        label: 'General question',
        tone: 'info',
        icon: 'help-circle-outline',
        cleanTitle: item.title.replace(/^\[(General Question|General)\]\s*/, ''),
      };
    }
  }
  return {
    label: feedbackTypeLabel[item.type] ?? 'Feedback',
    tone: feedbackTypeTone[item.type] ?? 'info',
    icon:
      item.type === 'blocker'
        ? 'hand-left-outline'
        : item.type === 'question'
          ? 'help-circle-outline'
          : 'chatbubble-ellipses-outline',
    cleanTitle: item.title,
  };
}

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

export const fieldLabel: Record<VisibilityField, string> = {
  contact: 'Contact details',
  salary: 'Salary',
  attendance: 'Attendance',
  task_history: 'Task history',
  performance: 'Performance',
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
  if (isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  const hh = d.getHours() % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hh}:${mm} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '—';
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(value);
}

export function dueLabel(due: string | null | undefined, status: TaskStatus): { text: string; tone: Tone } | null {
  if (!due) return null;
  if (status === 'approved' || status === 'closed') return { text: `Due ${formatDate(due)}`, tone: 'neutral' };
  const today = new Date(toDateOnly(new Date()) + 'T00:00:00').getTime();
  const d = new Date(due.length === 10 ? `${due}T00:00:00` : due).getTime();
  if (isNaN(d)) return null;
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

export const attendanceStatusLabel: Record<AttendanceStatus, string> = { present: 'Present', half_day: 'Half day', absent: 'Absent', leave: 'Leave' };
export const attendanceStatusTone: Record<AttendanceStatus, Tone> = { present: 'success', half_day: 'warning', absent: 'danger', leave: 'info' };

export function formatClockTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  const hh = d.getHours() % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

export function formatDayLabel(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDayShort(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Minutes as "Xh Ym" once past an hour, so a 113-minute lateness reads as "1h 53m" instead of "113 min". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** The last calendar day of a 'YYYY-MM-01' month key, as a 'YYYY-MM-DD' string. */
export function monthEndKey(month: string): string {
  const d = new Date(`${month}T00:00:00`);
  return toDateOnly(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** "Payable" once the month is fully elapsed, "Payable (till 5 Oct)" while it's still in progress. */
export function payableLabel(month: string, asOf: string | null | undefined): string {
  if (!asOf || asOf >= monthEndKey(month)) return 'Payable';
  return `Payable (till ${formatDayShort(asOf)})`;
}

/** Local calendar day as 'YYYY-MM-DD' (phone time). */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shiftDay(key: string, delta: number): string {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return dayKey(d);
}

/** First-of-month key ('YYYY-MM-01') used end to end for month-scoped attendance RPCs. */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function shiftMonth(key: string, delta: number): string {
  const d = new Date(`${key}T00:00:00`);
  d.setMonth(d.getMonth() + delta);
  return monthKey(d);
}

export function monthLabel(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatINR(value: number | null | undefined): string {
  if (value == null || isNaN(Number(value))) return '—';
  return '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
export const isTaskDone = (status: TaskStatus) => status === 'closed' || status === 'approved';

/**
 * Task list order: open work first (overdue, then soonest due, then highest
 * priority, then most recently updated); finished work after, newest first.
 */
export function sortTasks<
  T extends {
    status: TaskStatus;
    priority?: TaskPriority;
    due_date?: string | null;
    approved_at?: string | null;
    updated_at?: string;
  },
>(list: T[]): T[] {
  const today = toDateOnly(new Date());
  return [...list].sort((a, b) => {
    const ad = isTaskDone(a.status);
    const bd = isTaskDone(b.status);
    if (ad !== bd) return ad ? 1 : -1;
    if (ad) {
      const aDate = a.approved_at ?? a.updated_at ?? '';
      const bDate = b.approved_at ?? b.updated_at ?? '';
      return bDate.localeCompare(aDate);
    }
    const ao = !!a.due_date && a.due_date < today;
    const bo = !!b.due_date && b.due_date < today;
    if (ao !== bo) return ao ? -1 : 1;
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    const aPrio = a.priority ? PRIORITY_RANK[a.priority] : 3;
    const bPrio = b.priority ? PRIORITY_RANK[b.priority] : 3;
    if (aPrio !== bPrio) return aPrio - bPrio;
    return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
  });
}
