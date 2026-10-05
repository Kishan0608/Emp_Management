import { StyleSheet, Text, View, Pressable } from 'react-native';

import { Banner, Button, IconTile, Sheet, type IconName } from '@/components/ui';
import { attendanceStatusLabel, attendanceStatusTone, formatClockTime, formatDayLabel, formatDuration, toneColors } from '@/lib/format';
import type { AttendanceRecord, AttendanceStatus } from '@/lib/types';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const STATUS_BG: Record<AttendanceStatus, string> = { present: colors.success, half_day: colors.warning, absent: colors.danger, leave: colors.info };

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

/** A month grid where each day is colored by attendance status; tap a day to see its punch timeline. */
export function AttendanceCalendar({
  month,
  records,
  onSelectDay,
  allowFutureSelect,
}: {
  month: string;
  records: AttendanceRecord[];
  onSelectDay: (dateStr: string, record: AttendanceRecord | null) => void;
  /** HR/Boss only: lets them open future days too, to mark leave ahead of time. Self-service stays blocked on the future. */
  allowFutureSelect?: boolean;
}) {
  const byDate = new Map(records.map((r) => [r.work_date, r]));
  const cells = buildMonthGrid(month);
  const today = todayStr();

  return (
    <View style={styles.calendar}>
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
          const isFuture = cell.dateStr > today;
          const isToday = cell.dateStr === today;
          const bg = record?.status ? STATUS_BG[record.status] : isFuture ? 'transparent' : colors.surfaceAlt;
          const fg = record?.status ? colors.white : isFuture ? colors.textMuted : colors.textSecondary;
          return (
            <View key={i} style={styles.cellSlot}>
              <Pressable
                disabled={isFuture && !allowFutureSelect}
                onPress={() => onSelectDay(cell.dateStr!, record)}
                style={[styles.cell, { backgroundColor: bg }, isToday && styles.cellToday]}>
                <Text style={[styles.cellText, { color: fg }]}>{cell.day}</Text>
              </Pressable>
              {record?.is_late && <View style={styles.lateDot} />}
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        <LegendItem color={colors.success} label="Present" />
        <LegendItem color={colors.warning} label="Half day" />
        <LegendItem color={colors.danger} label="Absent" />
        <LegendItem color={colors.info} label="Leave" />
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

/** Shows one day's punch timeline (clock in, break start/end, clock out) when a calendar day is tapped. */
export function AttendanceDayDetailSheet({
  visible,
  onClose,
  dateStr,
  record,
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
  /** HR/Boss only: lets them fix punches and mark/cancel leave. Never shown to Manager or Employee. */
  canEdit?: boolean;
  onEdit?: () => void;
  onMarkLeave?: () => void;
  onCancelLeave?: () => void;
  onViewAttachment?: (path: string) => void;
}) {
  const isLeave = record?.status === 'leave';
  const isFuture = !!dateStr && dateStr > todayStr();
  return (
    <Sheet visible={visible} onClose={onClose} title={dateStr ? formatDayLabel(dateStr) : 'Day'}>
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }}>
        {canEdit && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {!isLeave && !isFuture && <Button title="Edit punches" size="sm" variant="outline" icon="create-outline" onPress={onEdit} />}
            <Button title={isLeave ? 'Edit leave' : 'Mark leave'} size="sm" variant="outline" icon="airplane-outline" onPress={onMarkLeave} />
            {isLeave && <Button title="Cancel leave" size="sm" variant="outline" icon="close-circle-outline" onPress={onCancelLeave} />}
          </View>
        )}

        {record?.status && (
          <View style={[styles.statusPill, { backgroundColor: toneColors[attendanceStatusTone[record.status]].bg }]}>
            <Text style={[styles.statusPillText, { color: toneColors[attendanceStatusTone[record.status]].fg }]}>
              {attendanceStatusLabel[record.status]}
            </Text>
          </View>
        )}

        {!record ? (
          <Text style={type.small}>No record for this day.</Text>
        ) : isLeave ? (
          <>
            <Banner tone={record.leave_paid ? 'info' : 'warning'} icon={record.leave_paid ? 'checkmark-circle-outline' : 'alert-circle-outline'}>
              {record.leave_paid ? 'Paid leave — within the annual quota.' : 'Unpaid leave — exceeds the annual quota, deducted from salary.'}
            </Banner>
            {record.leave_reason && <DetailRow icon="document-text-outline" label="Reason" value={record.leave_reason} />}
            {record.leave_attachment_path && (
              <Pressable
                style={styles.detailRow}
                onPress={() => onViewAttachment?.(record.leave_attachment_path!)}
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
            <DetailRow icon="log-in-outline" label="Clock in" value={formatClockTime(record.clock_in_at)} />
            <DetailRow icon="cafe-outline" label="Break start" value={formatClockTime(record.break_start_at)} />
            <DetailRow icon="play-outline" label="Break end" value={formatClockTime(record.break_end_at)} />
            <DetailRow icon="log-out-outline" label="Clock out" value={formatClockTime(record.clock_out_at)} />

            {record.is_late && (
              <Banner tone="warning" icon="alert-circle-outline">
                {`Clocked in late${record.late_minutes ? ` by ${formatDuration(record.late_minutes)}` : ''}.`}
              </Banner>
            )}
            {record.half_day_reason === 'late_streak' && (
              <Banner tone="danger" icon="warning-outline">
                Marked Half Day — the 4th+ late arrival this month.
              </Banner>
            )}
            {record.half_day_reason === 'early_clockout' && (
              <Banner tone="warning" icon="time-outline">
                Marked Half Day — clocked out before the cutoff.
              </Banner>
            )}
            {record.auto_closed && <Banner tone="info">This day was auto-closed by the system (a punch was missing).</Banner>}
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

const CELL_SIZE = 40;

const styles = StyleSheet.create({
  calendar: { gap: spacing.md },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellSlot: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 },
  cell: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: CELL_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  cellToday: { borderWidth: 2, borderColor: colors.brand },
  cellText: { fontFamily: fonts.semibold, fontSize: 14 },
  lateDot: { position: 'absolute', bottom: 2, width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.brand },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center', marginTop: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 5 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textSecondary },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  statusPillText: { fontFamily: fonts.semibold, fontSize: 12.5 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
