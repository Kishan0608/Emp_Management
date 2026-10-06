import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View, Pressable, type LayoutChangeEvent } from 'react-native';

import { Banner, Button, IconTile, Sheet, type IconName } from '@/components/ui';
import {
  attendanceStatusLabel,
  attendanceStatusTone,
  formatClockTime,
  formatDayLabel,
  formatDuration,
  leaveTypeLabel,
  toneColors,
} from '@/lib/format';
import type { AttendanceRecord, AttendanceStatus, Holiday } from '@/lib/types';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const STATUS_BG: Record<AttendanceStatus, string> = { present: colors.success, half_day: colors.warning, absent: colors.danger, leave: colors.info };

/** Festive violet, kept apart from the status colours so a holiday is never mistaken for leave. */
export const HOLIDAY_COLOR = '#7C3AED';
export const HOLIDAY_SOFT = '#F3EEFF';

interface Cell {
  day: number | null;
  dateStr: string | null;
}

function buildMonthGrid(monthKeyStr: string): Cell[] {
  const first = new Date(`${monthKeyStr}T00:00:00`);
  const year = first.getFullYear();
  const monthIdx = first.getMonth();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const startWeekday = new Date(year, monthIdx, 1).getDay();
  const cells: Cell[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, dateStr: null });
  return cells;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Someone who came in on a holiday shows as worked; anything else that day is the holiday. */
const workedOn = (r: AttendanceRecord | null) => !!r?.clock_in_at;

export function holidayMap(holidays: Holiday[] | null | undefined): Map<string, Holiday> {
  return new Map((holidays ?? []).map((h) => [h.holiday_date, h]));
}

/** A month grid where each day is coloured by attendance status; tap a day to see its details. */
export function AttendanceCalendar({
  month,
  records,
  holidays,
  onSelectDay,
  allowFutureSelect,
}: {
  month: string;
  records: AttendanceRecord[];
  holidays?: Holiday[] | null;
  onSelectDay: (dateStr: string, record: AttendanceRecord | null, holiday: Holiday | null) => void;
  /** HR/Boss only: lets them open future days too, to mark leave ahead of time. Self-service stays blocked on the future. */
  allowFutureSelect?: boolean;
}) {
  const byDate = new Map(records.map((r) => [r.work_date, r]));
  const hByDate = holidayMap(holidays);
  const cells = buildMonthGrid(month);
  const today = todayStr();
  // Size cells from the real width so the grid fits a small phone and grows on tablets / web.
  const [width, setWidth] = useState(0);
  const cellSize = width ? Math.max(30, Math.min(48, Math.floor(width / 7) - 6)) : 40;

  return (
    <View style={styles.calendar} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((cell, i) => {
          if (!cell.dateStr) return <View key={i} style={styles.cellSlot} />;
          const record = byDate.get(cell.dateStr) ?? null;
          const holiday = hByDate.get(cell.dateStr) ?? null;
          const isFuture = cell.dateStr > today;
          const isToday = cell.dateStr === today;
          const showHoliday = !!holiday && !workedOn(record);
          const bg = showHoliday
            ? HOLIDAY_COLOR
            : record?.status
              ? STATUS_BG[record.status]
              : isFuture
                ? 'transparent'
                : colors.surfaceAlt;
          const fg = showHoliday || record?.status ? colors.white : isFuture ? colors.textMuted : colors.textSecondary;
          return (
            <View key={i} style={styles.cellSlot}>
              <Pressable
                // Holidays can always be opened, so everyone can read the festival name ahead of time.
                disabled={isFuture && !allowFutureSelect && !holiday}
                onPress={() => onSelectDay(cell.dateStr!, record, holiday)}
                accessibilityLabel={holiday ? `${cell.day}, ${holiday.name}` : String(cell.day)}
                style={[
                  styles.cell,
                  { width: cellSize, height: cellSize, borderRadius: cellSize / 2, backgroundColor: bg },
                  isToday && styles.cellToday,
                ]}>
                <Text style={[styles.cellText, { color: fg }]}>{cell.day}</Text>
              </Pressable>
              {showHoliday ? (
                <Ionicons name="sparkles" size={9} color={HOLIDAY_COLOR} style={styles.cellMark} />
              ) : (
                record?.is_late && <View style={styles.lateDot} />
              )}
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        <LegendItem color={colors.success} label="Present" />
        <LegendItem color={colors.warning} label="Half day" />
        <LegendItem color={colors.danger} label="Absent" />
        <LegendItem color={colors.info} label="Leave" />
        <LegendItem color={HOLIDAY_COLOR} label="Holiday" />
        <LegendItem color={colors.brand} label="Late" dot />
      </View>

    </View>
  );
}

function LegendItem({ color, label, dot }: { color: string; label: string; dot?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={dot ? [styles.legendDot, { backgroundColor: color }] : [styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

/** Shows one day: the holiday, the leave, or the punch timeline, plus HR/Boss actions. */
export function AttendanceDayDetailSheet({
  visible,
  onClose,
  dateStr,
  record,
  holiday,
  canEdit,
  onEdit,
  onMarkLeave,
  onCancelLeave,
  onViewAttachment,
}: {
  visible: boolean;
  onClose: () => void;
  dateStr: string | null;
  record: AttendanceRecord | null;
  holiday?: Holiday | null;
  /** HR/Boss only: lets them fix punches and mark/cancel leave. Never shown to Manager or Employee. */
  canEdit?: boolean;
  onEdit?: () => void;
  onMarkLeave?: () => void;
  onCancelLeave?: () => void;
  onViewAttachment?: (path: string) => void;
}) {
  const isFuture = !!dateStr && dateStr > todayStr();
  const worked = workedOn(record);
  // On a holiday the day is the holiday, unless the person actually came in.
  const effective = holiday && !worked ? null : record;
  const isLeave = effective?.status === 'leave';

  return (
    <Sheet visible={visible} onClose={onClose} title={dateStr ? formatDayLabel(dateStr) : 'Day'} placement="center">
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }}>
        {holiday && (
          <View style={styles.holidayCard}>
            <View style={styles.holidayIcon}>
              <Ionicons name="sparkles" size={22} color={colors.white} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.holidayName}>{holiday.name}</Text>
            </View>
          </View>
        )}

        {canEdit && (
          <View style={styles.actions}>
            {!isLeave && !isFuture && (
              <Button title={worked || !holiday ? 'Edit attendance' : 'Add work punches'} size="sm" variant="outline" icon="create-outline" onPress={onEdit} />
            )}
            {!holiday && (
              <Button title={isLeave ? 'Edit leave' : 'Approve leave'} size="sm" variant="outline" icon="airplane-outline" onPress={onMarkLeave} />
            )}
            {isLeave && !holiday && <Button title="Cancel leave" size="sm" variant="outline" icon="close-circle-outline" onPress={onCancelLeave} />}
          </View>
        )}

        {holiday && worked && <Banner tone="info" icon="briefcase-outline">Came in to work on this holiday.</Banner>}

        {effective?.status && !(holiday && !worked) && (
          <View style={[styles.statusPill, { backgroundColor: toneColors[attendanceStatusTone[effective.status]].bg }]}>
            <Text style={[styles.statusPillText, { color: toneColors[attendanceStatusTone[effective.status]].fg }]}>
              {attendanceStatusLabel[effective.status]}
            </Text>
          </View>
        )}

        {holiday && !worked ? null : !effective ? (
          <Text style={type.small}>{isFuture ? 'Nothing planned for this day yet.' : 'No record for this day.'}</Text>
        ) : isLeave ? (
          <>
            <Banner tone={effective.leave_paid ? 'success' : 'warning'} icon={effective.leave_paid ? 'checkmark-circle-outline' : 'alert-circle-outline'}>
              {`${effective.leave_type ? `${leaveTypeLabel[effective.leave_type]} leave` : 'Leave'} · ${
                effective.leave_paid ? 'Paid, no salary deduction.' : 'Unpaid, deducted from salary.'
              }`}
            </Banner>
            {effective.leave_reason && <DetailRow icon="document-text-outline" label="Reason" value={effective.leave_reason} />}
            {effective.leave_attachment_path && (
              <Pressable
                style={styles.detailRow}
                onPress={() => onViewAttachment?.(effective.leave_attachment_path!)}
                accessibilityRole="button"
                accessibilityLabel="View attachment">
                <IconTile icon="attach-outline" color={colors.brand} bg={colors.brandSoft} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={type.small}>Attachment</Text>
                  <Text style={[type.bodyMedium, { color: colors.brand }]}>View file</Text>
                </View>
              </Pressable>
            )}
          </>
        ) : (
          <>
            <View style={styles.timeline}>
              <DetailRow icon="log-in-outline" label="Clock in" value={formatClockTime(effective.clock_in_at)} />
              <DetailRow icon="cafe-outline" label="Break start" value={formatClockTime(effective.break_start_at)} />
              <DetailRow icon="play-outline" label="Break end" value={formatClockTime(effective.break_end_at)} />
              <DetailRow icon="log-out-outline" label="Clock out" value={formatClockTime(effective.clock_out_at)} />
            </View>
            {effective.worked_minutes != null && (
              <Text style={[type.small, { textAlign: 'center' }]}>Worked {formatDuration(effective.worked_minutes)}</Text>
            )}

            {effective.is_late && (
              <Banner tone="warning" icon="alert-circle-outline">
                {`Clocked in late${effective.late_minutes ? ` by ${formatDuration(effective.late_minutes)}` : ''}.`}
              </Banner>
            )}
            {effective.half_day_reason === 'late_streak' && (
              <Banner tone="danger" icon="warning-outline">
                Marked Half Day: the 4th+ late arrival this month.
              </Banner>
            )}
            {effective.half_day_reason === 'early_clockout' && (
              <Banner tone="warning" icon="time-outline">
                Marked Half Day: clocked out before the cutoff.
              </Banner>
            )}
            {effective.auto_closed && <Banner tone="info">This day was auto-closed by the system (a punch was missing).</Banner>}
          </>
        )}
      </View>
    </Sheet>
  );
}

function DetailRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <IconTile icon={icon} color={colors.brand} bg={colors.brandSoft} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={type.small}>{label}</Text>
        <Text style={type.bodyMedium}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  calendar: { gap: spacing.md },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellSlot: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 },
  cell: { alignItems: 'center', justifyContent: 'center' },
  cellToday: { borderWidth: 2, borderColor: colors.brand },
  cellText: { fontFamily: fonts.semibold, fontSize: 14 },
  cellMark: { position: 'absolute', bottom: -1 },
  lateDot: { position: 'absolute', bottom: 2, width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.brand },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center', marginTop: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 5 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textSecondary },
  holidayCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: HOLIDAY_SOFT },
  holidayIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: HOLIDAY_COLOR, alignItems: 'center', justifyContent: 'center' },
  holidayName: { fontFamily: fonts.bold, fontSize: 17, color: colors.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeline: { gap: spacing.md },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  statusPillText: { fontFamily: fonts.semibold, fontSize: 12.5 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
