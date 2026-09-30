import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Avatar, Banner, Card, EmptyState, ListSkeleton, PageHeader, Screen, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { TeamMemberSummary } from '@/lib/types';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

type Health = { label: string; fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap };

function health(m: TeamMemberSummary): Health {
  if (m.overdue > 0 || m.blocked > 0) return { label: 'Needs attention', fg: colors.danger, bg: colors.dangerSoft, icon: 'alert-circle' };
  if (m.awaiting_review > 0) return { label: 'Waiting on you', fg: colors.warning, bg: colors.warningSoft, icon: 'hourglass' };
  if (m.open === 0) return { label: 'No open tasks', fg: colors.textSecondary, bg: '#F0EDE6', icon: 'remove-circle' };
  return { label: 'On track', fg: colors.success, bg: colors.successSoft, icon: 'checkmark-circle' };
}

export default function Team() {
  const team = useLoad(() => api.teamOverview());
  const [q, setQ] = useState('');

  const members = team.data ?? [];
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return members.filter((m) => !t || `${m.full_name} ${m.job_title ?? ''} ${m.department ?? ''}`.toLowerCase().includes(t));
  }, [members, q]);

  const sum = members.reduce(
    (a, m) => ({ open: a.open + m.open, overdue: a.overdue + m.overdue, blocked: a.blocked + m.blocked, review: a.review + m.awaiting_review }),
    { open: 0, overdue: 0, blocked: 0, review: 0 },
  );

  return (
    <Screen
      refreshing={team.refreshing}
      onRefresh={team.refresh}
      header={<PageHeader title="My team" subtitle={team.data ? `${members.length} ${members.length === 1 ? 'member' : 'members'} report to you` : 'Loading…'} />}>
      <View style={{ gap: spacing.lg }}>
        {team.error && <Banner tone="danger">{team.error}</Banner>}

        {team.data && members.length > 0 && (
          <View style={styles.summary}>
            <Summary label="Open" value={sum.open} color={colors.brand} />
            <Summary label="Overdue" value={sum.overdue} color={sum.overdue ? colors.danger : colors.textMuted} />
            <Summary label="Blocked" value={sum.blocked} color={sum.blocked ? colors.danger : colors.textMuted} />
            <Summary label="To review" value={sum.review} color={sum.review ? colors.warning : colors.textMuted} />
          </View>
        )}

        {members.length > 4 && <TextField icon="search" placeholder="Search team" value={q} onChangeText={setQ} autoCapitalize="none" />}

        {!team.data ? (
          <ListSkeleton rows={4} />
        ) : members.length === 0 ? (
          <EmptyState icon="people-outline" title="No one reports to you yet" body="When people choose you as their manager, they appear here." />
        ) : (
          list.map((m, i) => {
            const h = health(m);
            const pct = m.total ? m.done / m.total : 0;
            return (
              <Animated.View key={m.id} entering={FadeInDown.delay(i * 50).duration(350)}>
                <Card onPress={() => router.push(`/team/${m.id}`)} style={{ gap: spacing.md }}>
                  <View style={styles.top}>
                    <Avatar name={m.full_name} id={m.id} size={46} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={type.h3} numberOfLines={1}>
                        {m.full_name}
                      </Text>
                      <Text style={type.small} numberOfLines={1}>
                        {[m.job_title, m.department].filter(Boolean).join(' · ') || m.email}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </View>

                  <View style={[styles.health, { backgroundColor: h.bg }]}>
                    <Ionicons name={h.icon} size={13} color={h.fg} />
                    <Text style={[styles.healthText, { color: h.fg }]}>{h.label}</Text>
                  </View>

                  <View style={styles.stats}>
                    <Stat label="Done" value={m.done} />
                    <Stat label="Open" value={m.open} />
                    <Stat label="Overdue" value={m.overdue} tone={m.overdue ? colors.danger : undefined} />
                    <Stat label="On time" value={m.on_time_pct == null ? '—' : `${m.on_time_pct}%`} />
                  </View>

                  <View>
                    <View style={styles.bar}>
                      <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%` }]} />
                    </View>
                    <View style={styles.barMeta}>
                      <Text style={styles.meta}>
                        {m.done}/{m.total} tasks completed
                      </Text>
                      <Text style={styles.meta}>{m.last_active ? `Active ${timeAgo(m.last_active)}` : 'No activity yet'}</Text>
                    </View>
                  </View>
                </Card>
              </Animated.View>
            );
          })
        )}
      </View>
    </Screen>
  );
}

function Summary({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.sumItem}>
      <Text style={[styles.sumValue, { color }]}>{value}</Text>
      <Text style={styles.sumLabel}>{label}</Text>
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md },
  sumItem: { flex: 1, alignItems: 'center', gap: 2 },
  sumValue: { fontFamily: fonts.extrabold, fontSize: 22 },
  sumLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textSecondary },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  health: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  healthText: { fontFamily: fonts.semibold, fontSize: 12 },
  stats: { flexDirection: 'row', paddingVertical: spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  statValue: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  statLabel: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textSecondary },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.gold },
  barMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  meta: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted },
});
