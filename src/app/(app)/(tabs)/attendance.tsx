import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AttendanceCalendar, AttendanceDayDetailSheet, HOLIDAY_COLOR, HOLIDAY_SOFT } from '@/components/attendance';
import { HolidaysButton } from '@/components/HolidaysButton';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  HeroHeader,
  ListSkeleton,
  Screen,
  SectionTitle,
  Segmented,
  TextField,
} from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import {
  attendanceStatusLabel,
  attendanceStatusTone,
  formatDayLabel as fmtDay,
  formatINR,
  monthKey,
  monthLabel,
  payableLabel,
  roleLabel,
  shiftMonth,
} from '@/lib/format';
import type { AttendanceNextAction, AttendanceRecord, Holiday } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

const ACTION: Record<AttendanceNextAction, { label: string; icon: keyof typeof Ionicons.glyphMap; fn: keyof typeof api }> = {
  clock_in: { label: 'Clock In', icon: 'log-in-outline', fn: 'clockIn' },
  break_start: { label: 'Start Break', icon: 'cafe-outline', fn: 'breakStart' },
  break_end: { label: 'End Break', icon: 'play-outline', fn: 'breakEnd' },
  clock_out: { label: 'Clock Out', icon: 'log-out-outline', fn: 'clockOut' },
  done: { label: 'Done for today', icon: 'checkmark-done-outline', fn: 'attendanceToday' },
};

type AttendanceView = 'self' | 'employees';
type SelectedDay = { dateStr: string; record: AttendanceRecord | null; holiday: Holiday | null };

export default function AttendanceTab() {
  const { isBoss, isHR, organization } = useMe();
  const canSeeCompany = isBoss || isHR;
  const { width } = useWindowDimensions();
  const twoCol = width >= 720;
  const [view, setView] = useState<AttendanceView>('self');
  const [month, setMonth] = useState(() => monthKey());
  const [q, setQ] = useState('');
  const [selectedDay, setSelectedDay] = useState<SelectedDay | null>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const today = useLoad(() => api.attendanceToday());
  // Companies on a punching machine do not clock in the app; their attendance is imported.
  const companyId = organization?.id;
  const source = useLoad(() => (companyId ? api.orgAttendanceSource(companyId) : Promise.resolve(null)), [companyId]);
  const machine = source.data?.attendance_source === 'machine';
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

  const holidayToday = t?.holiday ?? null;
  const onLeaveToday = t?.record?.status === 'leave';

  return (
    <>
      <Screen
        refreshing={refreshing}
        onRefresh={onRefresh}
        header={
          <HeroHeader
            title="Attendance"
            subtitle={view === 'self' ? 'Clock in, breaks, clock out' : 'All employees · salary'}
            right={<HolidaysButton onPress={() => router.push('/holidays' as Href)} />}
          />
        }>
        <View style={{ gap: spacing.lg }}>
          {canSeeCompany && (
            <Segmented
              options={[
                { value: 'self', label: 'My attendance' },
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
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={type.h2}>Today</Text>
                    <Text style={type.small}>{fmtDay(new Date().toISOString().slice(0, 10))}</Text>
                  </View>
                  {holidayToday && !t.record?.clock_in_at ? (
                    <Badge label="Holiday" tone="info" icon="sparkles" />
                  ) : (
                    t.record?.status && <Badge label={attendanceStatusLabel[t.record.status]} tone={attendanceStatusTone[t.record.status]} />
                  )}
                  {t.record?.is_late && !t.record.status && <Badge label="Late" tone="warning" />}
                </View>

                {holidayToday && (
                  <View style={styles.holidayToday}>
                    <View style={styles.holidayTodayIcon}>
                      <Ionicons name="sparkles" size={20} color={colors.white} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.holidayTodayName} numberOfLines={2}>
                        {holidayToday.name}
                      </Text>
                    </View>
                  </View>
                )}

                {onLeaveToday && !holidayToday && (
                  <Banner tone="info" icon="airplane-outline">
                    You are on approved leave today.
                  </Banner>
                )}

                {machine ? (
                  <Banner tone="info" icon="hardware-chip-outline">
                    Your company records attendance from the punching machine. No need to clock in the app.
                  </Banner>
                ) : (
                  t.next_action !== 'done' && (
                    <Button title={ACTION[t.next_action].label} icon={ACTION[t.next_action].icon} loading={busy} onPress={punch} full />
                  )
                )}

                {t.late_count_this_month > 0 && (
                  <Banner tone={t.late_count_this_month >= t.thresholds.warning_limit ? 'danger' : 'warning'} icon="alert-circle-outline">
                    {t.late_count_this_month >= t.thresholds.warning_limit
                      ? `Late ${t.late_count_this_month} time(s) this month. Any further late day is automatically Half Day.`
                      : `Late ${t.late_count_this_month} of ${t.thresholds.warning_limit} this month before late days become Half Day.`}
                  </Banner>
                )}
              </Card>
            ))}

          <View style={styles.monthRow}>
            <Pressable onPress={() => setMonth((m) => shiftMonth(m, -1))} hitSlop={12} accessibilityLabel="Previous month" style={styles.monthBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <Text style={[type.h3, { minWidth: 140, textAlign: 'center' }]}>{monthLabel(month)}</Text>
            <Pressable onPress={() => setMonth((m) => shiftMonth(m, 1))} hitSlop={12} accessibilityLabel="Next month" style={styles.monthBtn}>
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </Pressable>
          </View>

          {view === 'self' ? (
            <>
              {h && (
                <View style={styles.summary}>
                  <Summary label="Present" value={h.summary.present} color={colors.success} />
                  <Summary label="Half day" value={h.summary.half_day} color={colors.warning} />
                  <Summary label="Absent" value={h.summary.absent} color={colors.danger} />
                  <Summary label="Leave" value={h.summary.leave ?? h.records.filter((r) => r.status === 'leave').length} color={colors.info} />
                  <Summary label="Holiday" value={h.summary.holiday ?? h.holidays?.length ?? 0} color={HOLIDAY_COLOR} />
                  <Summary label="Late" value={h.summary.late} color={colors.textSecondary} />
                </View>
              )}

              <SectionTitle title="Calendar" />
              {history.loading ? (
                <ListSkeleton rows={4} />
              ) : (
                <Card>
                  <AttendanceCalendar
                    month={month}
                    records={h?.records ?? []}
                    holidays={h?.holidays}
                    onSelectDay={(dateStr, record, holiday) => setSelectedDay({ dateStr, record, holiday })}
                  />
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
                <View style={[styles.cards, twoCol && styles.cardsTwo]}>
                  {rows.map((r) => {
                    const deducted = r.deduction > 0;
                    return (
                      <Card
                        key={r.user_id}
                        onPress={() => router.push(`/admin/attendance/${r.user_id}?month=${month}` as Href)}
                        style={[styles.personCard, twoCol && styles.personCardTwo]}>
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
                          <Stat label="Half" value={r.half_day} color={colors.warning} />
                          <Stat label="Absent" value={r.absent} color={colors.danger} />
                          <Stat label="Leave" value={r.leave ?? r.paid_leave_days + r.unpaid_leave_days} color={colors.info} />
                          <Stat label="Holiday" value={r.holiday_days ?? 0} color={HOLIDAY_COLOR} />
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
                        {deducted && <Badge label={`-${formatINR(r.deduction)} deducted`} tone="warning" />}
                      </Card>
                    );
                  })}
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
        holiday={selectedDay?.holiday ?? null}
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
  // Three per row on phones; all six in one row once the screen is wide enough (matches twoCol above).
  const { width } = useWindowDimensions();
  return (
    <View style={[styles.sumItem, { flexBasis: width >= 720 ? '16.66%' : '33.33%' }]}>
      <Text style={[styles.sumValue, { color }]}>{value}</Text>
      <Text style={type.small} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', minWidth: 0 }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 17, color }}>{value}</Text>
      <Text style={[type.small, { fontSize: 11 }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  todayTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  holidayToday: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: HOLIDAY_SOFT },
  holidayTodayIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: HOLIDAY_COLOR, alignItems: 'center', justifyContent: 'center' },
  holidayTodayName: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginTop: spacing.xs },
  monthBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  // 3 per row on phones, all 6 in one row once there is room
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  sumItem: { flexGrow: 1, minWidth: 90, alignItems: 'center', gap: 2 },
  sumValue: { fontFamily: fonts.extrabold, fontSize: 20 },
  cards: { gap: spacing.md },
  cardsTwo: { flexDirection: 'row', flexWrap: 'wrap' },
  personCard: { gap: spacing.md },
  personCardTwo: { flexBasis: '48%', flexGrow: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statsRow: { flexDirection: 'row', paddingVertical: spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  salaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: spacing.md },
});
