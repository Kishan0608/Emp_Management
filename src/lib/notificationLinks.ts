import type { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';

import { colors } from '@/theme/tokens';

interface Ref {
  kind: string;
  ref_table: string | null;
  ref_id: string | null;
}

/** Which screen a notification opens (list, live banner and phone push all use this). */
export function notificationHref(n: Ref): Href | null {
  // Holiday notices open the holiday list even when the holiday itself was removed (no ref_id).
  if (n.ref_table === 'holidays' || n.kind === 'holiday') return '/holidays' as Href;
  if (n.ref_table === 'attendance_records' || n.kind === 'attendance') return '/attendance' as Href;
  if (n.ref_table === 'work_logs' || n.kind.startsWith('work_log')) return '/work-log' as Href;
  if (!n.ref_id) return null;
  switch (n.ref_table) {
    case 'location_alerts':
      return `/location-alert/${n.ref_id}` as Href;
    case 'location_trail':
      return `/admin/location/${n.ref_id}` as Href;
    case 'tasks':
      return `/task/${n.ref_id}`;
    case 'feedback_items':
      return `/feedback/${n.ref_id}`;
    case 'users':
      return `/people/${n.ref_id}`;
    default:
      return null;
  }
}

export function notificationIcon(kind: string): { name: keyof typeof Ionicons.glyphMap; color: string; bg: string } {
  if (kind === 'holiday') return { name: 'sparkles', color: '#7C3AED', bg: '#F3EEFF' };
  if (kind === 'attendance') return { name: 'calendar', color: colors.info, bg: colors.infoSoft };
  if (kind.startsWith('location_alert')) return { name: 'navigate', color: colors.danger, bg: colors.dangerSoft };
  if (kind.startsWith('work_log')) return { name: 'document-text', color: colors.brand, bg: colors.brandSoft };
  if (kind.startsWith('task')) return { name: 'checkbox', color: colors.task, bg: colors.taskSoft };
  if (kind.includes('blocker')) return { name: 'hand-left', color: colors.danger, bg: colors.dangerSoft };
  if (kind.startsWith('feedback')) return { name: 'chatbubbles', color: colors.feedback, bg: colors.feedbackSoft };
  return { name: 'notifications', color: colors.brand, bg: colors.brandSoft };
}
