import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TaskCard } from '@/components/cards';
import { WorkLogCard } from '@/components/WorkLogCard';
import {
  Banner,
  Card,
  Divider,
  EmptyState,
  HeroHeader,
  IconButton,
  ListSkeleton,
  Screen,
  SectionTitle,
  Skeleton,
  StatCard,
} from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { greeting, roleLabel } from '@/lib/format';
import { useMe } from '@/providers/AuthProvider';
import { useNotifications } from '@/providers/NotificationsProvider';
import { useOrganization } from '@/providers/OrganizationProvider';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme/tokens';

export default function Home() {
  const { me, isBoss, isHR, isManager, organization } = useMe();
  const { selectedOrg, selectedOrgId } = useOrganization();
  const currentCompany = selectedOrg?.name || organization?.name || 'Shree Karni Fabcom Ltd';
  const { unread } = useNotifications();

  const stats = useLoad(() => api.dashboard(selectedOrgId), [selectedOrgId]);
  const myTasks = useLoad(() => api.tasks('mine', me.id));
  const allTasks = useLoad(
    () => (isBoss ? api.tasks('all', me.id, selectedOrgId) : Promise.resolve([])),
    [isBoss, selectedOrgId]
  );
  const departments = useLoad(() => api.departments());
  const feedbackItems = useLoad(
    () => api.feedback('all', me.id, true, selectedOrgId),
    [selectedOrgId]
  );
  const directoryUsers = useLoad(() => api.directory(selectedOrgId), [selectedOrgId]);

  const s = stats.data;
  const open = (myTasks.data ?? []).filter((t) => !['approved', 'closed'].includes(t.status)).slice(0, 3);

  const refresh = () => {
    stats.refresh();
    myTasks.refresh();
    feedbackItems.refresh();
    if (isBoss) allTasks.refresh();
    departments.refresh();
    directoryUsers.refresh();
  };

  // Compute Support category counts
  const supportCounts = useMemo(() => {
    const items = feedbackItems.data ?? [];
    const leave = items.filter(
      (f) =>
        f.title.startsWith('[Leave]') ||
        f.title.toLowerCase().startsWith('[leave]') ||
        f.title.toLowerCase().includes('leave')
    ).length;
    const questions = items.filter(
      (f) =>
        f.title.startsWith('[General Question]') ||
        f.title.toLowerCase().startsWith('[general') ||
        f.type === 'question'
    ).length;
    const blockers = s?.blockers_open ?? items.filter(
      (f) => f.type === 'blocker' && ['open', 'acknowledged'].includes(f.status)
    ).length;
    const feedback = items.filter(
      (f) => f.type === 'feedback' && !f.title.toLowerCase().includes('leave')
    ).length;
    return {
      leave,
      questions,
      blockers,
      feedback: feedback || (s?.feedback_open ?? 0),
    };
  }, [feedbackItems.data, s]);

  return (
    <>
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
                <View style={styles.orgPill}>
                  <Ionicons name="business" size={13} color={colors.white} />
                  <Text style={styles.orgPillText} numberOfLines={1}>
                    {currentCompany}
                  </Text>
                </View>
              </>
            }
          />
        }>
        {stats.error && <Banner tone="danger">{stats.error}</Banner>}

        {/* daily work log: required when there are no open tasks */}
        {!isBoss && <WorkLogCard />}

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

        {/* Supports section (Replaced Company pulse / HR desk with 4 categories) */}
        {(isHR || isBoss || s) && (
          <>
            <SectionTitle
              title="Supports"
              action="All support"
              onAction={() => router.push({ pathname: '/feedback', params: { scope: isBoss ? 'all' : 'inbox' } })}
            />
            <View style={styles.grid}>
              <StatCard
                label="Leave"
                value={supportCounts.leave}
                icon="calendar-outline"
                tint={colors.warning}
                soft={colors.warningSoft}
                onPress={() =>
                  router.push({
                    pathname: '/feedback',
                    params: { scope: isBoss ? 'all' : 'inbox', category: 'leave' },
                  })
                }
              />
              <StatCard
                label="General questions"
                value={supportCounts.questions}
                icon="help-circle-outline"
                tint={colors.info}
                soft={colors.infoSoft}
                onPress={() =>
                  router.push({
                    pathname: '/feedback',
                    params: { scope: isBoss ? 'all' : 'inbox', category: 'general_question' },
                  })
                }
              />
              <StatCard
                label="Feedback"
                value={supportCounts.feedback}
                icon="chatbubbles-outline"
                tint={colors.brand}
                soft={colors.brandSoft}
                onPress={() =>
                  router.push({
                    pathname: '/feedback',
                    params: { scope: isBoss ? 'all' : 'inbox', category: 'feedback' },
                  })
                }
              />
              <StatCard
                label="Blockers open"
                value={supportCounts.blockers}
                icon="hand-left-outline"
                tint={colors.danger}
                soft={colors.dangerSoft}
                onPress={() =>
                  router.push({
                    pathname: '/feedback',
                    params: { scope: 'blockers', category: 'blockers' },
                  })
                }
              />
            </View>
          </>
        )}

        {/* Tasks Section (Replaced Delivery with clean Department Rows & right arrows) */}
        {isBoss && s && (
          <>
            <SectionTitle title="Tasks" action="Analytics" onAction={() => router.push('/admin/analytics')} />
            <Card style={styles.tasksCard}>
              <View style={styles.metricsRow}>
                <Metric label="On-time (30d)" value={s.on_time_rate_30d == null ? '—' : `${s.on_time_rate_30d}%`} />
                <Metric label="Overdue" value={s.tasks_overdue ?? 0} tone={s.tasks_overdue ? colors.danger : undefined} />
                <Metric label="Headcount" value={Object.values(s.headcount ?? {}).reduce((a, b) => a + (b ?? 0), 0)} />
              </View>

              <View style={styles.deptListContainer}>
                {/* Only departments that have tasks; each one opens its own full page */}
                {(s.by_department ?? [])
                  .filter((d) => d.open + d.done + d.overdue > 0)
                  .map((d, index) => (
                  <View key={d.name}>
                    {index > 0 && <Divider />}
                    <Pressable
                      onPress={() => router.push({ pathname: '/department', params: { name: d.name } })}
                      style={({ pressed }) => [
                        styles.deptRow,
                        pressed && { backgroundColor: colors.surfaceAlt, opacity: 0.8 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${d.name} department: ${d.done} done, ${d.open} open, ${d.overdue} overdue`}>
                      <View style={styles.deptLeft}>
                        <View style={[styles.deptIconWrap, d.overdue > 0 && styles.deptIconWrapAlert]}>
                          <Ionicons
                            name="business-outline"
                            size={17}
                            color={d.overdue > 0 ? colors.danger : colors.brand}
                          />
                        </View>
                        <View style={styles.deptCol}>
                          <Text style={styles.deptName} numberOfLines={1}>
                            {d.name}
                          </Text>
                          <View style={styles.deptPillsRow}>
                            <View style={styles.pillDone}>
                              <Ionicons name="checkmark-circle" size={11} color="#15803D" />
                              <Text style={styles.pillDoneText}>{d.done} done</Text>
                            </View>
                            <View style={styles.pillOpen}>
                              <Ionicons name="time-outline" size={11} color={colors.textSecondary} />
                              <Text style={styles.pillOpenText}>{d.open} open</Text>
                            </View>
                            {d.overdue > 0 && (
                              <View style={styles.pillOverdue}>
                                <Ionicons name="alert-circle" size={11} color="#B91C1C" />
                                <Text style={styles.pillOverdueText}>{d.overdue} overdue</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                      <View style={styles.deptChevronWrap}>
                        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                      </View>
                    </Pressable>
                  </View>
                ))}
              </View>
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

    </>
  );
}

interface MetricProps {
  label: string;
  value: number | string;
  tone?: string;
}

function Metric({ label, value, tone }: MetricProps) {
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
  orgPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.22)',
    maxWidth: 220,
  },
  orgPillText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.white },
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

  // Tasks Card & Department Rows
  tasksCard: {
    gap: spacing.md,
    padding: spacing.md,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  deptListContainer: {
    gap: 2,
  },
  deptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  deptLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
    minWidth: 0,
  },
  deptIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  deptIconWrapAlert: {
    backgroundColor: '#FEF2F2',
  },
  deptCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  deptName: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
  },
  deptPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  pillDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: '#DCFCE7',
  },
  pillDoneText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: '#15803D',
  },
  pillOpen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pillOpenText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  pillOverdue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: '#FEE2E2',
  },
  pillOverdueText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: '#B91C1C',
  },
  deptChevronWrap: {
    paddingLeft: spacing.sm,
    justifyContent: 'center',
  },

  // Sheet Content
  sheetContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  sheetMetricsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  sheetMetricCard: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetMetricNum: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.text,
  },
  sheetMetricLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  sheetFilterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  sheetTab: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetTabActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brandDark,
  },
  sheetTabText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  sheetTabTextActive: {
    fontFamily: fonts.bold,
    color: colors.white,
  },
  sheetTasksScroll: {
    maxHeight: 340,
  },
  sheetTaskCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadow.sm,
  },
  sheetTaskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sheetTaskTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  sheetTaskBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priorityTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityTagText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  statusTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusTagText: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    textTransform: 'capitalize',
  },
  sheetTaskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  sheetTaskAssignee: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  sheetTaskDue: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
});
