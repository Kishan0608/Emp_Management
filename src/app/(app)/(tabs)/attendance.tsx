import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, Banner, Button, Card, Divider, EmptyState, HeroHeader, ListSkeleton, Screen, SectionTitle } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { attendanceStatusLabel, attendanceStatusTone, formatClockTime as fmtTime, formatDayLabel as fmtDay, monthKey, monthLabel, shiftMonth } from '@/lib/format';
import type { AttendanceNextAction, AttendanceRecord } from '@/lib/types';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, spacing, type } from '@/theme/tokens';

const ACTION: Record<AttendanceNextAction, { label: string; icon: keyof typeof Ionicons.glyphMap; fn: keyof typeof api }> = {
  clock_in: { label: 'Clock In', icon: 'log-in-outline', fn: 'clockIn' },
  break_start: { label: 'Start Break', icon: 'cafe-outline', fn: 'breakStart' },
  break_end: { label: 'End Break', icon: 'play-outline', fn: 'breakEnd' },
  clock_out: { label: 'Clock Out', icon: 'log-out-outline', fn: 'clockOut' },
  done: { label: 'Done for today', icon: 'checkmark-done-outline', fn: 'attendanceToday' },
};

export default function AttendanceTab() {
  const [month, setMonth] = useState(() => monthKey());
  const today = useLoad(() => api.attendanceToday());
  const history = useLoad(() => api.myAttendance(month), [month]);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const t = today.data;
  const h = history.data;

  const punch = async () => {
    if (!t || t.next_action === 'done') return;
    setBusy(true);
    try {
      const fn = ACTION[t.next_action].fn as 'clockIn' | 'breakStart' | 'breakEnd' | 'clockOut';
      const next = await api[fn]();
      today.setData(next);
      history.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      refreshing={today.refreshing}
      onRefresh={() => { today.refresh(); history.refresh(); }}
      header={<HeroHeader title="Attendance" subtitle="Clock in, breaks, clock out" />}>
      <View style={{ gap: spacing.lg }}>
        {today.error && <Banner tone="danger">{today.error}</Banner>}

        {!t ? (
          <ListSkeleton rows={1} />
        ) : (
          <Card style={{ gap: spacing.md }}>
            <View style={styles.todayTop}>
              <View style={{ flex: 1 }}>
                <Text style={type.h2}>Today</Text>
                <Text style={type.small}>{fmtDay(new Date().toISOString().slice(0, 10))}</Text>
              </View>
              {t.record?.status && <Badge label={attendanceStatusLabel[t.record.status]} tone={attendanceStatusTone[t.record.status]} />}
              {t.record?.is_late && !t.record.status && <Badge label="Late" tone="warning" />}
            </View>

            <View style={styles.punchRow}>
              <Punch label="Clock in" value={fmtTime(t.record?.clock_in_at ?? null)} />
              <Punch label="Break" value={`${fmtTime(t.record?.break_start_at ?? null)} – ${fmtTime(t.record?.break_end_at ?? null)}`} />
              <Punch label="Clock out" value={fmtTime(t.record?.clock_out_at ?? null)} />
            </View>

            {t.next_action !== 'done' && (
              <Button title={ACTION[t.next_action].label} icon={ACTION[t.next_action].icon} loading={busy} onPress={punch} full />
            )}

            {t.late_count_this_month > 0 && (
              <Banner tone={t.late_count_this_month >= t.thresholds.warning_limit ? 'danger' : 'warning'} icon="alert-circle-outline">
                {t.late_count_this_month >= t.thresholds.warning_limit
                  ? `Late ${t.late_count_this_month} time(s) this month — any further late day is automatically Half Day.`
                  : `Late ${t.late_count_this_month} of ${t.thresholds.warning_limit} this month before late days become Half Day.`}
              </Banner>
            )}
          </Card>
        )}

        <View style={styles.monthRow}>
          <Ionicons name="chevron-back" size={20} color={colors.text} onPress={() => setMonth((m) => shiftMonth(m, -1))} />
          <Text style={type.h3}>{monthLabel(month)}</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.text} onPress={() => setMonth((m) => shiftMonth(m, 1))} />
        </View>

        {h && (
          <View style={styles.summary}>
            <Summary label="Present" value={h.summary.present} color={colors.success} />
            <Summary label="Half day" value={h.summary.half_day} color={colors.warning} />
            <Summary label="Absent" value={h.summary.absent} color={colors.danger} />
            <Summary label="Late" value={h.summary.late} color={colors.textSecondary} />
          </View>
        )}

        <SectionTitle title="Day by day" />
        {history.loading ? (
          <ListSkeleton rows={4} />
        ) : !h || h.records.length === 0 ? (
          <Card>
            <EmptyState icon="calendar-outline" title="No records yet" body="Nothing punched for this month." />
          </Card>
        ) : (
          <Card padded={false}>
            {h.records.map((r, i) => (
              <View key={r.id}>
                {i > 0 && <Divider inset={16} />}
                <DayRow record={r} />
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}

function Punch({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={type.small}>{label}</Text>
      <Text style={type.bodyMedium}>{value}</Text>
    </View>
  );
}

function Summary({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.sumItem}>
      <Text style={[styles.sumValue, { color }]}>{value}</Text>
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

function DayRow({ record }: { record: AttendanceRecord }) {
  return (
    <View style={styles.dayRow}>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyMedium}>{fmtDay(record.work_date)}</Text>
        <Text style={type.small}>
          {fmtTime(record.clock_in_at)} – {fmtTime(record.clock_out_at)}
          {record.is_late ? ' · Late' : ''}
          {record.auto_closed ? ' · Auto-closed' : ''}
        </Text>
      </View>
      {record.status && <Badge label={attendanceStatusLabel[record.status]} tone={attendanceStatusTone[record.status]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  todayTop: { flexDirection: 'row', alignItems: 'center' },
  punchRow: { flexDirection: 'row', gap: spacing.md },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.sm },
  summary: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md },
  sumItem: { flex: 1, alignItems: 'center', gap: 2 },
  sumValue: { fontFamily: fonts.extrabold, fontSize: 20 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
});
