import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, ListSkeleton, PageHeader, Screen, SectionTitle, StatCard } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { shareCsv, toCsv } from '@/lib/csv';
import { roleLabel, taskStatusLabel, toDateOnly } from '@/lib/format';
import type { Role, TaskStatus } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useOrganization } from '@/providers/OrganizationProvider';
import { useToast } from '@/providers/ToastProvider';
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
  const { me, isBoss } = useMe();
  const { selectedOrgId } = useOrganization();
  const toast = useToast();
  const stats = useLoad(() => api.dashboard(selectedOrgId), [selectedOrgId]);
  const [busy, setBusy] = useState<string | null>(null);
  const s = stats.data;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  const today = toDateOnly(new Date());

  const statusEntries = Object.entries(s?.tasks_by_status ?? {}) as [TaskStatus, number][];
  const totalTasks = statusEntries.reduce((a, [, n]) => a + n, 0) || 1;

  return (
    <Screen refreshing={stats.refreshing} onRefresh={stats.refresh} header={<PageHeader title="Analytics & exports" />}>
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

          <SectionTitle title="Exports (CSV)" />
          <Card style={{ gap: spacing.sm }}>
            <Text style={type.small}>Exports include only what your role can see. Each file opens in Excel or Google Sheets.</Text>
            <Button
              title="Tasks"
              icon="download-outline"
              variant="outline"
              loading={busy === 'tasks'}
              onPress={() =>
                run('tasks', async () => {
                  const rows = await api.tasks('all', me.id);
                  await shareCsv(
                    `tasks-${today}.csv`,
                    toCsv(
                      rows.map((t) => ({ ...t, assignee: t.assignee?.full_name, creator: t.creator?.full_name, reviewer: t.reviewer?.full_name, status: taskStatusLabel[t.status] })),
                      [
                        { key: 'title', label: 'Title' },
                        { key: 'status', label: 'Status' },
                        { key: 'priority', label: 'Priority' },
                        { key: 'assignee', label: 'Assignee' },
                        { key: 'creator', label: 'Assigned by' },
                        { key: 'reviewer', label: 'Reviewer' },
                        { key: 'due_date', label: 'Due' },
                        { key: 'submitted_at', label: 'Submitted' },
                        { key: 'approved_at', label: 'Approved' },
                      ],
                    ),
                  );
                })
              }
            />
            <Button
              title="Feedback & questions"
              icon="download-outline"
              variant="outline"
              loading={busy === 'feedback'}
              onPress={() =>
                run('feedback', async () => {
                  const rows = await api.feedback('all', me.id);
                  await shareCsv(
                    `feedback-${today}.csv`,
                    toCsv(
                      rows.map((f) => ({ ...f, author: f.is_anonymous ? 'Anonymous' : f.author?.full_name })),
                      [
                        { key: 'type', label: 'Type' },
                        { key: 'title', label: 'Title' },
                        { key: 'body', label: 'Details' },
                        { key: 'author', label: 'From' },
                        { key: 'audience', label: 'To' },
                        { key: 'status', label: 'Status' },
                        { key: 'escalation_level', label: 'Escalation' },
                        { key: 'created_at', label: 'Created' },
                      ],
                    ),
                  );
                })
              }
            />
            {isBoss && (
              <>
                <Button
                  title="Audit log"
                  icon="download-outline"
                  variant="outline"
                  loading={busy === 'audit'}
                  onPress={() =>
                    run('audit', async () => {
                      const rows = await api.auditLogs(1000);
                      await shareCsv(
                        `audit-${today}.csv`,
                        toCsv(
                          rows.map((r) => ({ ...r, actor: r.actor?.full_name })),
                          [
                            { key: 'created_at', label: 'When' },
                            { key: 'actor', label: 'Who' },
                            { key: 'action', label: 'Action' },
                            { key: 'entity', label: 'Entity' },
                            { key: 'entity_id', label: 'Entity id' },
                            { key: 'meta', label: 'Details' },
                          ],
                        ),
                      );
                    })
                  }
                />
              </>
            )}
          </Card>
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
