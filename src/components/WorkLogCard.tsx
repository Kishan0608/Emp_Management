import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

/**
 * Home: today's work log. Prominent when it is required (no open tasks) and missing,
 * a quiet confirmation once added, hidden on holidays, leave and the weekly off.
 */
export function WorkLogCard() {
  const day = useLoad(() => api.myWorkDay());
  const d = day.data;
  if (!d || d.weekly_off || d.holiday || d.on_leave) return null;

  const log = d.log;
  const tone = log ? 'done' : d.required ? 'due' : 'optional';
  const c = {
    due: { fg: colors.warning, bg: colors.warningSoft, icon: 'document-text' as const },
    done: { fg: colors.success, bg: colors.successSoft, icon: 'checkmark-circle' as const },
    optional: { fg: colors.brand, bg: colors.brandSoft, icon: 'document-text-outline' as const },
  }[tone];

  const title = log
    ? log.reviewed_at
      ? "Today's work log · reviewed"
      : "Today's work log added"
    : d.required
      ? "Add today's work log"
      : 'Daily work log (optional)';
  const sub = log
    ? `${log.summary.slice(0, 70)}${log.summary.length > 70 ? '…' : ''}`
    : d.required
      ? 'You have no open tasks today. Write what you worked on.'
      : `You have ${d.open_tasks} open ${d.open_tasks === 1 ? 'task' : 'tasks'}. Add a note about your day if you like.`;

  return (
    <Pressable
      onPress={() => router.push('/work-log' as Href)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, { borderColor: c.fg + '40', backgroundColor: c.bg }, pressed && { opacity: 0.9 }]}>
      <View style={[styles.icon, { backgroundColor: colors.white }]}>
        <Ionicons name={c.icon} size={20} color={c.fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.title, { color: tone === 'optional' ? colors.text : c.fg }]}>{title}</Text>
        <Text style={styles.sub} numberOfLines={2}>
          {sub}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 15 },
  sub: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
});
