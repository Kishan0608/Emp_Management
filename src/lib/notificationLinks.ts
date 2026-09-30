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
  if (!n.ref_id) return null;
  switch (n.ref_table) {
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
  if (kind.startsWith('task')) return { name: 'checkbox', color: colors.task, bg: colors.taskSoft };
  if (kind.includes('blocker')) return { name: 'hand-left', color: colors.danger, bg: colors.dangerSoft };
  if (kind.startsWith('feedback')) return { name: 'chatbubbles', color: colors.feedback, bg: colors.feedbackSoft };
  return { name: 'notifications', color: colors.brand, bg: colors.brandSoft };
}
