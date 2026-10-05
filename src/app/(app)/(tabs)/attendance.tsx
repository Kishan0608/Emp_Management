import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AttendanceCalendar, AttendanceDayDetailSheet } from '@/components/attendance';
import { Avatar, Badge, Banner, Button, Card, EmptyState, HeroHeader, ListSkeleton, Screen, SectionTitle, Segmented, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { attendanceStatusLabel, attendanceStatusTone, formatDayLabel as fmtDay, formatINR, monthKey, monthLabel, payableLabel, roleLabel, shiftMonth } from '@/lib/format';
import type { AttendanceNextAction, AttendanceRecord } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, spacing, type } from '@/theme/tokens';

const ACTION: Record<AttendanceNextAction, { label: string; icon: keyof typeof Ionicons.glyphMap; fn: keyof typeof api }> = {
  clock_in: { label: 'Clock In', icon: 'log-in-outline', fn: 'clockIn' },
  break_start: { label: 'Start Break', icon: 'cafe-outline', fn: 'breakStart' },
  break_end: { label: 'End Break', icon: 'play-outline', fn: 'breakEnd' },
  clock_out: { label: 'Clock Out', icon: 'log-out-outline', fn: 'clockOut' },
  done: { label: 'Done for today', icon: 'checkmark-done-outline', fn: 'attendanceToday' },
};

type AttendanceView = 'self' | 'employees';

export default function AttendanceTab() {
  const { isBoss, isHR } = useMe();
  const canSeeCompany = isBoss || isHR;
  const [view, setView] = useState<AttendanceView>('self');
  const [month, setMonth] = useState(() => monthKey());
  const [q, setQ] = useState('');
  const [selectedDay, setSelectedDay] = useState<{ dateStr: string; record: AttendanceRecord | null } | null>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const today = useLoad(() => api.attendanceToday());
  const history = useLoad(() => api.myAttendance(month), [month]);
  const overview = useLoad(() => (canSeeCompany && view === 'employees' ? api.attendanceOverview(month) : Promise.resolve([])), [month, view]);

  const t = today.data;
  const h = history.data;
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (overview.data ?? []).filter((r) => !term || `${r.full_name} ${r.department ?? ''}`.toLowerCase().includes(term));
  }, [overview.data, q]);

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

  const refreshing = view === 'self' ? today.refreshing : overview.refreshing;
  const onRefresh = () => {
    if (view === 'self') {
      today.refresh();
      history.refresh();
    } else {
      overview.refresh();
    }
  };

  return (
    <>
      <Screen
        refreshing={refreshing}
        onRefresh={onRefresh}
        header={<HeroHeader title="Attendance" subtitle={view === 'self' ? 'Clock in, breaks, clock out' : 'All employees · salary'} />}>
        <View style={{ gap: spacing.lg }}>
        {canSeeCompany && (
          <Segmented
            options={[
              { value: 'self', label: 'Self' },
              { value: 'employees', label: 'Employees' },
            ]}
            value={view}
            onChange={setView}
          />
        )}

        {view === 'self' && today.error && <Banner tone="danger">{today.error}</Banner>}
        {view === 'employees' && overview.error && <Banner tone="danger">{overview.error}</Banner>}

        {view === 'self' &&
          (!t ? (
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
          ))}

        <View style={styles.monthRow}>
          <Ionicons name="chevron-back" size={20} color={colors.text} onPress={() => setMonth((m) => shiftMonth(m, -1))} />
          <Text style={type.h3}>{monthLabel(month)}</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.text} onPress={() => setMonth((m) => shiftMonth(m, 1))} />
        </View>

        {view === 'self' ? (
          <>
            {h && (
              <View style={styles.summary}>
                <Summary label="Present" value={h.summary.present} color={colors.success} />
                <Summary label="Half day" value={h.summary.half_day} color={colors.warning} />
                <Summary label="Absent" value={h.summary.absent} color={colors.danger} />
                <Summary label="Late" value={h.summary.late} color={colors.textSecondary} />
              </View>
            )}

            <SectionTitle title="Calendar" />
            {history.loading ? (
              <ListSkeleton rows={4} />
            ) : (
              <Card>
                <AttendanceCalendar month={month} records={h?.records ?? []} onSelectDay={(dateStr, record) => setSelectedDay({ dateStr, record })} />
              </Card>
            )}
          </>
        ) : (
          <>
            <TextField
              icon="search"
              placeholder="Search people or department"
              value={q}
              onChangeText={setQ}
              autoCapitalize="none"
              right={
                q.length > 0 ? (
                  <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Clear search">
                    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                  </Pressable>
                ) : undefined
              }
            />
            {overview.loading ? (
              <ListSkeleton rows={5} />
            ) : rows.length === 0 ? (
              <Card>
                <EmptyState icon="calendar-outline" title="No one to show" body="No employees match this search." />
              </Card>
            ) : (
              <View style={{ gap: spacing.md }}>
                {rows.map((r) => (
                  <Card key={r.user_id} onPress={() => router.push(`/admin/attendance/${r.user_id}?month=${month}` as Href)} style={{ gap: spacing.md }}>
                    <View style={styles.top}>
                      <Avatar name={r.full_name} id={r.user_id} size={44} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={type.h3} numberOfLines={1}>
                          {r.full_name}
                        </Text>
                        <Text style={type.small} numberOfLines={1}>
                          {[roleLabel[r.role], r.department].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </View>

                    <View style={styles.statsRow}>
                      <Stat label="Present" value={r.present} color={colors.success} />
                      <Stat label="Half day" value={r.half_day} color={colors.warning} />
                      <Stat label="Absent" value={r.absent} color={colors.danger} />
                      <Stat label="Late" value={r.late} color={colors.textSecondary} />
                    </View>

                    <View style={styles.salaryRow}>
                      <View>
                        <Text style={type.small}>Base salary</Text>
                        <Text style={type.bodyMedium}>{formatINR(r.base_salary)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={type.small}>{payableLabel(month, r.as_of)}</Text>
                        <Text style={[type.bodyMedium, { color: colors.brand }]}>{formatINR(r.payable_salary)}</Text>
                      </View>
                    </View>
                    {(r.absent_days > 0 || r.half_days > 0) && <Badge label={`-${formatINR(r.deduction)} deducted`} tone="warning" />}
                  </Card>
                ))}
              </View>
            )}
          </>
        )}
        </View>
      </Screen>

      <AttendanceDayDetailSheet
        visible={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        dateStr={selectedDay?.dateStr ?? null}
        record={selectedDay?.record ?? null}
        onViewAttachment={async (path) => {
          try {
            await WebBrowser.openBrowserAsync(await api.leaveAttachmentUrl(path));
          } catch (e) {
            toast(errorMessage(e), 'error');
          }
        }}
      />
    </>
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

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 18, color }}>{value}</Text>
      <Text style={[type.small, { fontSize: 11.5 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  todayTop: { flexDirection: 'row', alignItems: 'center' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.sm },
  summary: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md },
  sumItem: { flex: 1, alignItems: 'center', gap: 2 },
  sumValue: { fontFamily: fonts.extrabold, fontSize: 20 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statsRow: { flexDirection: 'row', paddingVertical: spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  salaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
});
