import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { TaskCard } from '@/components/cards';
import { Banner, Card, EmptyState, HeroHeader, IconButton, ListSkeleton, Screen, SectionTitle, Skeleton, StatCard } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { greeting, roleLabel } from '@/lib/format';
import { useMe } from '@/providers/AuthProvider';
import { useNotifications } from '@/providers/NotificationsProvider';
import { colors, fonts, spacing, type } from '@/theme/tokens';

export default function Home() {
  const { me, isBoss, isHR, isManager } = useMe();
  const { unread } = useNotifications();
  const stats = useLoad(() => api.dashboard());
  const myTasks = useLoad(() => api.tasks('mine', me.id));
  const s = stats.data;
  const open = (myTasks.data ?? []).filter((t) => !['approved', 'closed'].includes(t.status)).slice(0, 3);

  const refresh = () => {
    stats.refresh();
    myTasks.refresh();
  };

  return (
    <Screen
      refreshing={stats.refreshing}
      onRefresh={refresh}
      header={
        <HeroHeader
          subtitle={`${greeting()},`}
          title={me.full_name.split(' ')[0]}
          right={
            <IconButton
              icon="notifications-outline"
              label="Notifications"
              color={colors.white}
              bg="rgba(255,255,255,0.16)"
              badge={unread}
              onPress={() => router.push('/notifications')}
            />
          }
          meta={
            <>
              <View style={styles.rolePill}>
                <Ionicons name="shield-half-outline" size={13} color={colors.white} />
                <Text style={styles.rolePillText}>{roleLabel[me.role]}</Text>
              </View>
              {!!me.job_title && (
                <Text style={styles.heroMetaText} numberOfLines={1}>
                  {me.job_title}
                </Text>
              )}
            </>
          }
        />
      }>
      {stats.error && <Banner tone="danger">{stats.error}</Banner>}

      {/* personal numbers */}
      <SectionTitle style={styles.firstSection} title="My work" action="All tasks" onAction={() => router.push('/tasks')} />
      {!s ? (
        <View style={styles.grid}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={112} width="47%" radiusSize={16} />
          ))}
        </View>
      ) : (
        <View style={styles.grid}>
          <StatCard label="Open tasks" value={s.my_tasks.open} icon="layers-outline" tint={colors.brand} soft={colors.brandSoft} onPress={() => router.push('/tasks')} />
          <StatCard label="Due today" value={s.my_tasks.due_today} icon="today-outline" tint={colors.warning} soft={colors.warningSoft} onPress={() => router.push('/tasks')} />
          <StatCard label="Overdue" value={s.my_tasks.overdue} icon="alarm-outline" tint={colors.danger} soft={colors.dangerSoft} onPress={() => router.push('/tasks')} />
          <StatCard label="Done (30 days)" value={s.my_tasks.done_30d} icon="checkmark-done-outline" tint={colors.success} soft={colors.successSoft} onPress={() => router.push('/tasks')} />
        </View>
      )}

      {/* role-specific */}
      {isManager && s?.team && (
        <>
          <SectionTitle title="My team" action="Team tasks" onAction={() => router.push({ pathname: '/tasks', params: { scope: 'team' } })} />
          <Card style={{ gap: spacing.md }} onPress={() => router.push('/team' as Href)}>
            <View style={styles.teamCard}>
              <Metric label="Members" value={s.team.members} tone={colors.brand} />
              <Metric label="Open" value={s.team.open} />
              <Metric label="Blocked" value={s.team.blocked} tone={s.team.blocked ? colors.danger : undefined} />
              <Metric label="Overdue" value={s.team.overdue} tone={s.team.overdue ? colors.warning : undefined} />
              <Metric label="Feedback" value={s.team.feedback_open} />
            </View>
            <View style={styles.teamCta}>
              <Ionicons name="people" size={16} color={colors.brand} />
              <Text style={styles.teamCtaText}>View members & their reports</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.brand} />
            </View>
          </Card>
        </>
      )}

      {(isHR || isBoss) && s && (
        <>
          <SectionTitle title={isBoss ? 'Company pulse' : 'HR desk'} />
          <View style={styles.grid}>
            <StatCard label="Open feedback" value={s.feedback_open ?? 0} icon="chatbubbles-outline" tint={colors.feedback} soft={colors.feedbackSoft} onPress={() => router.push('/feedback')} />
            <StatCard
              label="Blockers open"
              value={s.blockers_open ?? 0}
              icon="hand-left-outline"
              tint={colors.danger}
              soft={colors.dangerSoft}
              onPress={() => router.push({ pathname: '/feedback', params: { scope: 'blockers' } })}
            />
          </View>
        </>
      )}

      {isBoss && s && (
        <>
          <SectionTitle title="Delivery" action="Analytics" onAction={() => router.push('/admin/analytics')} />
          <Card style={{ gap: spacing.lg }}>
            <View style={{ flexDirection: 'row', gap: spacing.lg }}>
              <Metric label="On-time (30d)" value={s.on_time_rate_30d == null ? '—' : `${s.on_time_rate_30d}%`} />
              <Metric label="Overdue" value={s.tasks_overdue ?? 0} tone={s.tasks_overdue ? colors.danger : undefined} />
              <Metric label="Headcount" value={Object.values(s.headcount ?? {}).reduce((a, b) => a + (b ?? 0), 0)} />
            </View>
            {(s.by_department ?? []).map((d) => {
              const total = d.open + d.done || 1;
              return (
                <View key={d.name} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={type.smallMedium}>{d.name}</Text>
                    <Text style={type.small}>
                      {d.done} done · {d.open} open{d.overdue ? ` · ${d.overdue} overdue` : ''}
                    </Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${(d.done / total) * 100}%`, backgroundColor: colors.task }]} />
                    <View style={[styles.fill, { width: `${(d.overdue / total) * 100}%`, backgroundColor: colors.danger }]} />
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      )}

      <SectionTitle title="Up next" action="See all" onAction={() => router.push('/tasks')} />
      {myTasks.loading ? (
        <ListSkeleton rows={2} />
      ) : open.length === 0 ? (
        <Card>
          <EmptyState icon="sparkles-outline" title="You're all caught up" body="No open tasks assigned to you right now." />
        </Card>
      ) : (
        <View style={{ gap: spacing.md }}>
          {open.map((t, i) => (
            <TaskCard key={t.id} task={t} index={i} showAssignee={false} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 56 }}>
      <Text style={[styles.metricValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={type.small} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  rolePillText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.white },
  heroMetaText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  firstSection: { marginTop: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  teamCard: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  teamCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  teamCtaText: { flex: 1, fontFamily: fonts.semibold, fontSize: 13.5, color: colors.brand },
  metricValue: { fontFamily: fonts.bold, fontSize: 22, color: colors.text, letterSpacing: -0.4 },
  track: { height: 8, borderRadius: 4, backgroundColor: '#F0EDE6', flexDirection: 'row', overflow: 'hidden' },
  fill: { height: 8 },
});
