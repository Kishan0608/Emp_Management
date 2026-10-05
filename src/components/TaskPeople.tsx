import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Avatar } from '@/components/ui';
import { roleLabel } from '@/lib/format';
import type { TaskTeamMember } from '@/lib/types';
import { colors, fonts, radius, shadow, spacing } from '@/theme/tokens';

/** Only managers, HR and the Boss lead a team here; an employee always shows just their own tasks. */
export const leadsTeam = (m: { role: string; team_size?: number }) => m.role !== 'employee' && (m.team_size ?? 0) > 0;

/** Pending work a row stands for: a leader's own tasks plus their team's. */
export const pendingOf = (m: TaskTeamMember) => m.pending + (leadsTeam(m) ? m.team_pending : 0);

const ROLE_TINT: Record<string, { fg: string; bg: string }> = {
  manager: { fg: colors.brand, bg: colors.brandSoft },
  hr: { fg: colors.feedback, bg: colors.feedbackSoft },
  boss: { fg: colors.ink, bg: colors.goldLight },
  employee: { fg: colors.textSecondary, bg: colors.surfaceAlt },
};

/** One person in the tasks-by-people view. Tap opens their tasks (and their team, if they lead one). */
export function PersonTaskRow({ m, index = 0 }: { m: TaskTeamMember; index?: number }) {
  const leads = leadsTeam(m);
  const pending = pendingOf(m);
  const tint = ROLE_TINT[m.role] ?? ROLE_TINT.employee;

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 25).duration(240)}>
      <Pressable
        onPress={() => router.push(`/task/person/${m.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${m.full_name}, ${pending} pending tasks`}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}>
        <Avatar name={m.full_name} id={m.id} size={46} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={styles.name} numberOfLines={1}>
            {m.full_name}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.rolePill, { backgroundColor: tint.bg }]}>
              <Text style={[styles.roleText, { color: tint.fg }]}>{roleLabel[m.role]}</Text>
            </View>
            {!!m.job_title && (
              <Text style={styles.meta} numberOfLines={1}>
                {m.job_title}
              </Text>
            )}
          </View>
          {leads && (
            <View style={styles.metaRow}>
              <Ionicons name="people-outline" size={13} color={colors.textMuted} />
              <Text style={styles.meta} numberOfLines={1}>
                Team of {m.team_size} · own {m.pending} · team {m.team_pending}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.countBox}>
          <View style={[styles.count, pending === 0 ? styles.countZero : m.overdue > 0 ? styles.countLate : styles.countOn]}>
            <Text style={[styles.countText, pending === 0 && { color: colors.textMuted }]}>{pending}</Text>
          </View>
          <Text style={[styles.countLabel, m.overdue > 0 && { color: colors.danger }]}>{m.overdue > 0 ? `${m.overdue} late` : 'pending'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

/** A titled group of people rows inside one card. */
export function PeopleGroup({ title, members, offset = 0 }: { title: string; members: TaskTeamMember[]; offset?: number }) {
  if (members.length === 0) return null;
  const total = members.reduce((n, m) => n + pendingOf(m), 0);
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.groupHead}>
        <Text style={styles.groupTitle}>{title}</Text>
        <Text style={styles.groupCount}>
          {members.length} {members.length === 1 ? 'person' : 'people'} · {total} pending
        </Text>
      </View>
      <View style={styles.group}>
        {members.map((m, i) => (
          <View key={m.id}>
            {i > 0 && <View style={styles.divider} />}
            <PersonTaskRow m={m} index={offset + i} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Three numbers: total / pending / done. Tapping one can filter a list. */
export function CountTiles({
  total,
  pending,
  done,
  overdue,
  active,
  onPick,
}: {
  total: number;
  pending: number;
  done: number;
  overdue?: number;
  active?: 'all' | 'pending' | 'done';
  onPick?: (v: 'all' | 'pending' | 'done') => void;
}) {
  const tiles = [
    { key: 'all' as const, label: 'Total', value: total, color: colors.text, icon: 'layers-outline' as const },
    { key: 'pending' as const, label: 'Pending', value: pending, color: colors.warning, icon: 'time-outline' as const },
    { key: 'done' as const, label: 'Done', value: done, color: colors.success, icon: 'checkmark-done-outline' as const },
  ];
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.tiles}>
        {tiles.map((t) => {
          const on = active === t.key;
          return (
            <Pressable
              key={t.key}
              disabled={!onPick}
              onPress={() => onPick?.(t.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [styles.tile, on && { borderColor: t.color, backgroundColor: colors.surface }, pressed && { opacity: 0.85 }]}>
              <Ionicons name={t.icon} size={16} color={t.color} />
              <Text style={[styles.tileValue, { color: t.color }]}>{t.value}</Text>
              <Text style={styles.tileLabel}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {!!overdue && (
        <View style={styles.lateBar}>
          <Ionicons name="alert-circle" size={15} color={colors.danger} />
          <Text style={styles.lateText}>
            {overdue} pending {overdue === 1 ? 'task is' : 'tasks are'} past the due date
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  name: { fontFamily: fonts.semibold, fontSize: 15.5, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { flexShrink: 1, fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSecondary },
  rolePill: { paddingHorizontal: 7, paddingVertical: 1.5, borderRadius: 6 },
  roleText: { fontFamily: fonts.semibold, fontSize: 11 },
  countBox: { alignItems: 'center', minWidth: 52 },
  count: { minWidth: 40, height: 32, paddingHorizontal: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  countOn: { backgroundColor: colors.warningSoft },
  countLate: { backgroundColor: colors.dangerSoft },
  countZero: { backgroundColor: colors.surfaceAlt },
  countText: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  countLabel: { marginTop: 2, fontFamily: fonts.medium, fontSize: 10.5, color: colors.textMuted },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 },
  groupTitle: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 0.6, color: colors.textSecondary, textTransform: 'uppercase' },
  groupCount: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 74 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  tileValue: { fontFamily: fonts.bold, fontSize: 22 },
  tileLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary },
  lateBar: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  lateText: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.danger },
});
