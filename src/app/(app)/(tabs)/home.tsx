import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { TaskCard } from '@/components/cards';
import { Badge, Banner, Card, EmptyState, HeroHeader, IconButton, ListSkeleton, Screen, SectionTitle, Skeleton, StatCard, type IconName } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { greeting, roleLabel } from '@/lib/format';
import { useMe } from '@/providers/AuthProvider';
import { useNotifications } from '@/providers/NotificationsProvider';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme/tokens';

export default function Home() {
  const { me, isBoss, isHR, isManager, isCaseHandler, isEmployee } = useMe();
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
          }>
          <View style={styles.heroMeta}>
            <View style={styles.rolePill}>
              <Ionicons name="shield-half-outline" size={13} color={colors.white} />
              <Text style={styles.rolePillText}>{roleLabel[me.role]}</Text>
            </View>
            {!!me.job_title && (
              <Text style={styles.heroMetaText} numberOfLines={1}>
                {me.job_title}
              </Text>
            )}
          </View>
        </HeroHeader>
      }>
      {stats.error && <Banner tone="danger">{stats.error}</Banner>}

      {/* quick actions */}
      <View style={styles.quickRow}>
        {!isEmployee && (
          <QuickAction icon="add-circle" label="New task" color={colors.task} bg={colors.taskSoft} onPress={() => router.push('/task/new')} />
        )}
        <QuickAction icon="chatbubble-ellipses" label="Ask / Feedback" color={colors.feedback} bg={colors.feedbackSoft} onPress={() => router.push('/feedback/new')} />
        <QuickAction icon="shield" label="Complaint" color={colors.complaint} bg={colors.complaintSoft} onPress={() => router.push('/complaint/new')} />
      </View>

      {/* personal numbers */}
      <SectionTitle title="My work" action="All tasks" onAction={() => router.push('/tasks')} />
      {!s ? (
        <View style={styles.grid}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={112} width="47%" radiusSize={16} />
          ))}
        </View>
      ) : (
        <View style={styles.grid}>
          <StatCard label="Open tasks" value={s.my_tasks.open} icon="layers-outline" tint={colors.brand} soft={colors.brandSoft} onPress={() => router.push('/tasks')} />
          <StatCard label="Due today" value={s.my_tasks.due_today} icon="today-outline" tint={colors.warning} soft={colors.warningSoft} />
          <StatCard label="Overdue" value={s.my_tasks.overdue} icon="alarm-outline" tint={colors.danger} soft={colors.dangerSoft} />
          <StatCard
            label="Waiting for my review"
            value={s.my_tasks.to_review}
            icon="checkmark-done-outline"
            tint={colors.task}
            soft={colors.taskSoft}
            onPress={() => router.push({ pathname: '/tasks', params: { scope: 'review' } })}
          />
        </View>
      )}

      {/* role-specific */}
      {isManager && s?.team && (
        <>
          <SectionTitle title="My team" action="Team tasks" onAction={() => router.push({ pathname: '/tasks', params: { scope: 'team' } })} />
          <Card style={{ gap: spacing.md }} onPress={() => router.push('/team')}>
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
            {isCaseHandler && (
              <StatCard
                label="Complaints to triage"
                value={s.complaints_pending ?? 0}
                icon="file-tray-full-outline"
                tint={colors.complaint}
                soft={colors.complaintSoft}
                onPress={() => router.push('/complaint/triage')}
              />
            )}
            <StatCard label="Open cases" value={s.open_cases ?? 0} icon="briefcase-outline" tint={colors.accent} soft="#F3EEFE" onPress={() => router.push('/complaints')} />
          </View>
        </>
      )}

      {isBoss && s?.flags && (s.flags.red > 0 || s.flags.yellow > 0) && (
        <Animated.View entering={FadeInDown.duration(350)} style={{ marginTop: spacing.lg }}>
          <Card onPress={() => router.push('/complaints')} style={styles.flagCard}>
            <View style={styles.flagIcon}>
              <Ionicons name="flag" size={22} color={colors.white} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={type.h3}>Complaint flags need attention</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {s.flags.red > 0 && <Badge label={`${s.flags.red} red`} tone="danger" />}
                {s.flags.yellow > 0 && <Badge label={`${s.flags.yellow} yellow`} tone="warning" />}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Card>
        </Animated.View>
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

function QuickAction({ icon, label, color, bg, onPress }: { icon: IconName; label: string; color: string; bg: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.quick, pressed && { transform: [{ scale: 0.97 }] }]}>
      <View style={[styles.quickIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.quickText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
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
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
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
  quickRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  quick: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.md,
  },
  quickIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.text },
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
  flagCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderColor: colors.complaint + '40', backgroundColor: '#FFF8F9' },
  flagIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.complaint, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#F0EDE6', flexDirection: 'row', overflow: 'hidden' },
  fill: { height: 8 },
});
