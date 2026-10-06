import { StyleSheet, Text, View } from 'react-native';

import { Banner, Card, ListSkeleton, PageHeader, Screen, SectionTitle, StatCard } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { roleLabel, taskStatusLabel } from '@/lib/format';
import type { Role, TaskStatus } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useOrganization } from '@/providers/OrganizationProvider';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

const STATUS_COLORS: Record<TaskStatus, string> = {
  assigned: '#94A3B8',
  accepted: colors.info,
  in_progress: colors.brand,
  blocked: colors.danger,
  submitted: colors.warning,
  approved: colors.success,
  returned: '#F97316',
  closed: '#64748B',
};

export default function Analytics() {
  const { isBoss } = useMe();
  const { selectedOrgId } = useOrganization();
  const stats = useLoad(() => api.dashboard(selectedOrgId), [selectedOrgId]);
  const s = stats.data;

  const statusEntries = Object.entries(s?.tasks_by_status ?? {}) as [TaskStatus, number][];
  const totalTasks = statusEntries.reduce((a, [, n]) => a + n, 0) || 1;

  return (
    <Screen refreshing={stats.refreshing} onRefresh={stats.refresh} header={<PageHeader title="Analytics" />}>
      {stats.error && <Banner tone="danger">{stats.error}</Banner>}
      {!s ? (
        <ListSkeleton rows={3} />
      ) : (
        <View style={{ gap: spacing.md }}>
          {isBoss && (
            <>
              <View style={styles.grid}>
                <StatCard label="On time (30 days)" value={s.on_time_rate_30d == null ? '—' : `${s.on_time_rate_30d}%`} icon="speedometer-outline" tint={colors.task} soft={colors.taskSoft} />
                <StatCard label="Overdue tasks" value={s.tasks_overdue ?? 0} icon="alarm-outline" tint={colors.danger} soft={colors.dangerSoft} />
                <StatCard label="Open blockers" value={s.blockers_open ?? 0} icon="hand-left-outline" tint={colors.warning} soft={colors.warningSoft} />
                <StatCard label="Open feedback" value={s.feedback_open ?? 0} icon="chatbubbles-outline" tint={colors.feedback} soft={colors.feedbackSoft} />
              </View>

              <SectionTitle title="Tasks by status" />
              <Card style={{ gap: spacing.md }}>
                <View style={styles.stack}>
                  {statusEntries.map(([k, n]) => (
                    <View key={k} style={{ width: `${(n / totalTasks) * 100}%`, backgroundColor: STATUS_COLORS[k] }} />
                  ))}
                </View>
                <View style={styles.legend}>
                  {statusEntries.map(([k, n]) => (
                    <View key={k} style={styles.legendItem}>
                      <View style={[styles.swatch, { backgroundColor: STATUS_COLORS[k] }]} />
                      <Text style={type.small}>
                        {taskStatusLabel[k]} <Text style={{ fontFamily: fonts.semibold, color: colors.text }}>{n}</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>

              <SectionTitle title="Headcount" />
              <Card style={{ flexDirection: 'row' }}>
                {(Object.entries(s.headcount ?? {}) as [Role, number][]).map(([r, n]) => (
                  <View key={r} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 22, color: colors.text }}>{n}</Text>
                    <Text style={type.small}>{roleLabel[r]}</Text>
                  </View>
                ))}
              </Card>
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stack: { flexDirection: 'row', height: 14, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: '#F0EDE6' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
});
