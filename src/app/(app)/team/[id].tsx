import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Avatar, Badge, Banner, Button, Card, Divider, ListRow, ListSkeleton, PageHeader, Screen, SectionTitle } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { dueLabel, formatDate, formatDateTime, priorityLabel, priorityTone, roleLabel, taskStatusLabel, taskStatusTone, timeAgo, toneColors } from '@/lib/format';
import type { TaskPriority, TeamMemberReport } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export default function MemberReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isBoss, isHR } = useMe();
  const report = useLoad(() => api.teamMemberReport(id), [id]);
  const r = report.data;

  if (!r) {
    return <Screen header={<PageHeader title="Team member" />}>{report.error ? <Banner tone="danger">{report.error}</Banner> : <ListSkeleton rows={5} />}</Screen>;
  }

  const { person: p, tasks: t, quality: qy, habits: h } = r;
  const onTime = pct(qy.on_time, t.done);
  const completion = pct(t.done, t.total);
  const rework = pct(qy.reworked, t.total);
  const insights = buildInsights(r, onTime);

  return (
    <Screen refreshing={report.refreshing} onRefresh={report.refresh} header={<PageHeader title="Team member" subtitle={p.full_name} />}>
      <View style={{ gap: spacing.lg }}>
        {/* Identity */}
        <Animated.View entering={FadeInDown.duration(350)}>
          <Card style={{ gap: spacing.md }}>
            <View style={styles.idRow}>
              <Avatar name={p.full_name} id={p.id} size={62} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={type.h2} numberOfLines={1}>
                  {p.full_name}
                </Text>
                <Text style={type.small} numberOfLines={1}>
                  {p.job_title ?? '—'}
                </Text>
                <View style={styles.badges}>
                  <Badge label={roleLabel[p.role]} tone="brand" />
                  {p.department && <Badge label={p.department} icon="business-outline" />}
                  {!p.is_active && <Badge label="Inactive" tone="danger" />}
                </View>
              </View>
            </View>
            <View style={styles.facts}>
              <Fact icon="mail-outline" text={p.email} />
              <Fact icon="calendar-outline" text={p.joined_on ? `Joined ${formatDate(p.joined_on)}` : `On SKFL since ${formatDate(p.member_since)}`} />
              <Fact icon="pulse-outline" text={h.last_active ? `Last active ${timeAgo(h.last_active)}` : 'No task activity yet'} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button title="Assign task" icon="add-circle-outline" size="sm" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/task/new', params: { assignee: p.id } })} />
              <Button title="Full profile" icon="person-outline" size="sm" variant="outline" style={{ flex: 1 }} onPress={() => router.push(`/people/${p.id}`)} />
            </View>
          </Card>
        </Animated.View>

        {/* Scorecard */}
        <Animated.View entering={FadeInDown.delay(60).duration(350)}>
          <View style={styles.rings}>
            <Ring label="Completion" value={completion} color={colors.brand} />
            <Ring label="On time" value={onTime} color={colors.success} />
            <Ring label="Rework" value={rework} color={rework && rework > 20 ? colors.danger : colors.info} invert />
          </View>
        </Animated.View>

        {insights.length > 0 && (
          <Card style={{ gap: spacing.sm }}>
            <Text style={type.caption}>At a glance</Text>
            {insights.map((x) => (
              <View key={x.text} style={styles.insight}>
                <Ionicons name={x.icon} size={16} color={toneColors[x.tone].fg} />
                <Text style={[type.small, { flex: 1, color: colors.text }]}>{x.text}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Task counts */}
        <SectionTitle title="Tasks" action="Team tasks" onAction={() => router.push({ pathname: '/tasks', params: { scope: 'team' } })} />
        <View style={styles.grid}>
          <Tile icon="layers-outline" label="Total" value={t.total} tint={colors.brand} />
          <Tile icon="checkmark-done-outline" label="Done" value={t.done} tint={colors.success} />
          <Tile icon="time-outline" label="Open" value={t.open} tint={colors.info} />
          <Tile icon="alert-circle-outline" label="Overdue" value={t.overdue} tint={t.overdue ? colors.danger : colors.textMuted} />
          <Tile icon="hand-left-outline" label="Blocked" value={t.blocked} tint={t.blocked ? colors.danger : colors.textMuted} />
          <Tile icon="eye-outline" label="To review" value={t.awaiting_review} tint={t.awaiting_review ? colors.warning : colors.textMuted} />
          <Tile icon="calendar-outline" label="Due in 7 days" value={t.due_7d} tint={colors.warning} />
          <Tile icon="trophy-outline" label="Done (30 days)" value={t.done_30d} tint={colors.success} />
        </View>

        {t.open > 0 && (
          <Card style={{ gap: spacing.md }}>
            <Text style={type.caption}>Open work by stage</Text>
            <StackBar
              parts={[
                { label: 'Not started', value: t.not_started, color: colors.borderStrong },
                { label: 'In progress', value: t.in_progress, color: colors.brand },
                { label: 'Blocked', value: t.blocked, color: colors.danger },
                { label: 'In review', value: t.awaiting_review, color: colors.warning },
                { label: 'Returned', value: t.returned, color: colors.accent },
              ]}
            />
            <Divider />
            <Text style={type.caption}>Open work by priority</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {(['urgent', 'high', 'medium', 'low'] as TaskPriority[]).map((k) => (
                <Badge key={k} label={`${priorityLabel[k]} · ${r.priority_open[k]}`} tone={r.priority_open[k] ? priorityTone[k] : 'neutral'} />
              ))}
            </View>
          </Card>
        )}

        {/* Trend */}
        <SectionTitle title="Completed per month" />
        <Card>
          <MonthBars data={r.monthly} />
        </Card>

        {/* Behaviour */}
        <SectionTitle title="Work habits" />
        <Card padded={false}>
          <Habit icon="flash-outline" label="Starts new tasks" value={h.avg_hours_to_accept == null ? '—' : fmtHours(h.avg_hours_to_accept)} hint="Average time to accept" />
          <Divider inset={60} />
          <Habit icon="hourglass-outline" label="Finishes a task" value={qy.avg_days_to_complete == null ? '—' : `${qy.avg_days_to_complete} days`} hint="Average from assigned to approved" />
          <Divider inset={60} />
          <Habit icon="calendar-number-outline" label="Active days" value={`${h.active_days_30d} / 30`} hint="Days with task updates, last 30 days" />
          <Divider inset={60} />
          <Habit icon="refresh-outline" label="Task updates" value={String(h.updates_30d)} hint="Status changes made, last 30 days" />
          <Divider inset={60} />
          <Habit icon="checkmark-circle-outline" label="Delivered on time" value={`${qy.on_time}`} hint={`${qy.late} delivered late`} />
          <Divider inset={60} />
          <Habit icon="arrow-undo-outline" label="Sent back for rework" value={String(qy.reworked)} hint="Tasks returned at least once" />
          <Divider inset={60} />
          <Habit icon="hand-left-outline" label="Got blocked" value={String(h.blocked_times)} hint={`${h.blockers_to_me} blocker${h.blockers_to_me === 1 ? '' : 's'} raised to you`} />
          <Divider inset={60} />
          <Habit icon="chatbubbles-outline" label="Feedback to you" value={String(h.feedback_to_me)} hint="Named feedback, questions and blockers" />
        </Card>

        {(r.performance_rating != null || r.attendance_pct != null) && (
          <>
            <SectionTitle title="Records" />
            <View style={styles.grid}>
              {r.performance_rating != null && <Tile icon="star-outline" label="Performance" value={`${r.performance_rating} / 5`} tint={colors.brand} />}
              {r.attendance_pct != null && <Tile icon="finger-print-outline" label="Attendance" value={`${r.attendance_pct}%`} tint={colors.info} />}
            </View>
          </>
        )}

        {/* Recent tasks */}
        <SectionTitle title="Recent tasks" />
        {r.recent_tasks.length === 0 ? (
          <Card>
            <Text style={type.small}>No tasks assigned yet.</Text>
          </Card>
        ) : (
          <Card padded={false}>
            {r.recent_tasks.map((x, i) => {
              const due = dueLabel(x.due_date, x.status);
              return (
                <View key={x.id}>
                  {i > 0 && <Divider inset={16} />}
                  <ListRow
                    title={x.title}
                    subtitle={[priorityLabel[x.priority], due?.text].filter(Boolean).join(' · ')}
                    right={<Badge label={taskStatusLabel[x.status]} tone={x.overdue ? 'danger' : taskStatusTone[x.status]} />}
                    onPress={() => router.push(`/task/${x.id}`)}
                  />
                </View>
              );
            })}
          </Card>
        )}

        {/* Timeline */}
        {r.timeline.length > 0 && (
          <>
            <SectionTitle title="Activity" />
            <Card style={{ gap: 0 }}>
              {r.timeline.map((e, i) => (
                <View key={`${e.task_id}-${e.created_at}`} style={styles.tlRow}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={[styles.tlDot, { backgroundColor: toneColors[taskStatusTone[e.to_status]].fg }]} />
                    {i < r.timeline.length - 1 && <View style={styles.tlLine} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: spacing.md }}>
                    <Text style={type.smallMedium} numberOfLines={1}>
                      <Text style={{ color: colors.text }}>{taskStatusLabel[e.to_status]}</Text> · {e.title}
                    </Text>
                    {!!e.note && (
                      <Text style={type.small} numberOfLines={2}>
                        “{e.note}”
                      </Text>
                    )}
                    <Text style={styles.tlMeta}>
                      {formatDateTime(e.created_at)}
                      {e.actor ? ` · ${e.actor}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          </>
        )}

        <View style={styles.privacy}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
          <Text style={styles.privacyText}>
            {isBoss || isHR ? 'Complaints and cases are in the Complaints section.' : 'Complaints about people are confidential and handled only by HR and the Boss.'} Viewing this report is recorded in the audit log.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

function buildInsights(r: TeamMemberReport, onTime: number | null) {
  const out: { icon: IconName; text: string; tone: keyof typeof toneColors }[] = [];
  const { tasks: t, habits: h } = r;
  if (t.overdue) out.push({ icon: 'alert-circle', text: `${t.overdue} task${t.overdue === 1 ? ' is' : 's are'} overdue`, tone: 'danger' });
  if (t.blocked) out.push({ icon: 'hand-left', text: `${t.blocked} task${t.blocked === 1 ? ' is' : 's are'} blocked — may need your help`, tone: 'danger' });
  if (t.awaiting_review) out.push({ icon: 'eye', text: `${t.awaiting_review} submitted task${t.awaiting_review === 1 ? '' : 's'} waiting for your review`, tone: 'warning' });
  if (onTime != null && onTime >= 85 && r.quality.on_time >= 3) out.push({ icon: 'trophy', text: `Reliable: ${onTime}% of work delivered on time`, tone: 'success' });
  if (onTime != null && onTime < 60 && t.done >= 3) out.push({ icon: 'trending-down', text: `Only ${onTime}% delivered on time`, tone: 'warning' });
  if (t.open > 0 && h.active_days_30d === 0) out.push({ icon: 'moon', text: 'No task updates in the last 30 days', tone: 'warning' });
  if (t.total === 0) out.push({ icon: 'information-circle', text: 'No tasks yet — assign one to start tracking', tone: 'info' });
  return out;
}

function fmtHours(hrs: number) {
  if (hrs < 1) return `${Math.max(1, Math.round(hrs * 60))} min`;
  if (hrs < 48) return `${Math.round(hrs)} h`;
  return `${Math.round(hrs / 24)} days`;
}

function Fact({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Text style={type.small} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function Ring({ label, value, color, invert }: { label: string; value: number | null; color: string; invert?: boolean }) {
  const v = value ?? 0;
  return (
    <View style={styles.ringCard}>
      <Text style={[styles.ringValue, { color: value == null ? colors.textMuted : color }]}>{value == null ? '—' : `${v}%`}</Text>
      <View style={styles.ringTrack}>
        <View style={{ width: `${v}%`, height: '100%', borderRadius: 3, backgroundColor: color }} />
      </View>
      <Text style={styles.ringLabel}>{label}</Text>
      <Text style={styles.ringHint}>{value == null ? 'No data yet' : invert ? (v <= 10 ? 'Low' : v <= 25 ? 'Some' : 'High') : v >= 80 ? 'Strong' : v >= 50 ? 'Fair' : 'Low'}</Text>
    </View>
  );
}

function Tile({ icon, label, value, tint }: { icon: IconName; label: string; value: number | string; tint: string }) {
  return (
    <View style={styles.tile}>
      <View style={[styles.tileIcon, { backgroundColor: tint + '1A' }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StackBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const shown = parts.filter((p) => p.value > 0);
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.stack}>
        {shown.map((p) => (
          <View key={p.label} style={{ flex: p.value / total, backgroundColor: p.color }} />
        ))}
      </View>
      <View style={styles.legend}>
        {shown.map((p) => (
          <View key={p.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: p.color }]} />
            <Text style={type.small}>
              {p.label} <Text style={{ fontFamily: fonts.bold, color: colors.text }}>{p.value}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MonthBars({ data }: { data: { month: string; done: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.done));
  return (
    <View style={styles.bars}>
      {data.map((d, i) => (
        <View key={`${d.month}-${i}`} style={styles.barCol}>
          <Text style={styles.barNum}>{d.done || ''}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { height: `${(d.done / max) * 100}%`, backgroundColor: i === data.length - 1 ? colors.brand : colors.gold }]} />
          </View>
          <Text style={styles.barLabel}>{d.month}</Text>
        </View>
      ))}
    </View>
  );
}

function Habit({ icon, label, value, hint }: { icon: IconName; label: string; value: string; hint: string }): ReactNode {
  return (
    <View style={styles.habit}>
      <View style={styles.habitIcon}>
        <Ionicons name={icon} size={17} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyMedium}>{label}</Text>
        <Text style={type.small}>{hint}</Text>
      </View>
      <Text style={styles.habitValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  idRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  facts: { gap: 6, paddingTop: spacing.sm, borderTopWidth: 1, borderColor: colors.border },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rings: { flexDirection: 'row', gap: spacing.sm },
  ringCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, gap: 4 },
  ringValue: { fontFamily: fonts.extrabold, fontSize: 24, letterSpacing: -0.5 },
  ringTrack: { alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden', marginVertical: 4 },
  ringLabel: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.text },
  ringHint: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  insight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: '48.5%', flexGrow: 1, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 4 },
  tileIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tileValue: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.text, marginTop: 4 },
  tileLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary },
  stack: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.border, gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 3 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 140 },
  barCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  barNum: { fontFamily: fonts.bold, fontSize: 11.5, color: colors.text, minHeight: 15 },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end', backgroundColor: colors.surfaceAlt, borderRadius: 6, overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 6 },
  barLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.textSecondary },
  habit: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  habitIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  habitValue: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  tlRow: { flexDirection: 'row', gap: spacing.md },
  tlDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  tlLine: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  tlMeta: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  privacy: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingHorizontal: spacing.xs },
  privacyText: { flex: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.textMuted },
});
