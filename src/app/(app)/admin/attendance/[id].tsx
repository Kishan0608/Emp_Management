import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { createElement, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AttendanceCalendar, AttendanceDayDetailSheet, HOLIDAY_COLOR } from '@/components/attendance';
import { Banner, Button, Card, ChoiceChips, IconTile, ListSkeleton, PageHeader, Screen, SectionTitle, Segmented, Sheet, TextField, type IconName } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { formatClockTime, formatDayLabel, formatDuration, formatINR, monthKey, monthLabel, payableLabel, roleLabel, shiftMonth } from '@/lib/format';
import type { AttendanceRecord, Holiday, LeaveType } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

/** Platform-aware confirm dialog (native Alert, window.confirm on web) — mirrors the pattern in (tabs)/more.tsx. */
function confirmAction(title: string, message: string, fn: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) fn();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Continue', style: 'destructive', onPress: fn },
  ]);
}

export default function AttendanceDetailScreen() {
  const { id, month: monthParam } = useLocalSearchParams<{ id: string; month?: string }>();
  const { me, isBoss, isHR } = useMe();
  const [month, setMonth] = useState(() => monthParam ?? monthKey());
  const [editing, setEditing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<{ dateStr: string; record: AttendanceRecord | null; holiday: Holiday | null } | null>(null);
  const [editingPunches, setEditingPunches] = useState(false);
  const [markingLeave, setMarkingLeave] = useState(false);
  // iOS will not present a sheet while another is still closing, so the day sheet closes first
  // and the next one opens a moment later (this is why "Approve leave" sometimes did nothing).
  const [dayHidden, setDayHidden] = useState(false);
  const switchSheet = (open: () => void) => {
    setDayHidden(true);
    setTimeout(open, 320);
  };
  const closeAll = () => {
    setEditingPunches(false);
    setMarkingLeave(false);
    setSelectedDay(null);
    setDayHidden(false);
  };
  const toast = useToast();
  const detail = useLoad(() => api.attendanceDetail(id, month), [id, month]);

  const d = detail.data;
  // HR/Boss only, and HR cannot edit its own attendance — mirrors the hr_edit_attendance/hr_mark_leave RPCs' own checks.
  const canEditPunches = (isBoss || isHR) && id !== me.id;

  const openMarkLeave = () => {
    const r = selectedDay?.record;
    const hasPunchData = !!r && r.status !== 'leave' && (r.clock_in_at || r.clock_out_at);
    if (hasPunchData) {
      confirmAction('Overwrite this day?', 'This day already has clock-in/out data. Marking it as leave will clear those punches.', () =>
        switchSheet(() => setMarkingLeave(true)),
      );
    } else {
      switchSheet(() => setMarkingLeave(true));
    }
  };

  const cancelLeave = () => {
    if (!selectedDay) return;
    const dateStr = selectedDay.dateStr;
    confirmAction('Cancel this leave?', 'This removes the leave mark for this day.', async () => {
      try {
        await api.hrCancelLeave(id, dateStr);
        closeAll();
        detail.reload();
        toast('Leave cancelled');
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    });
  };

  const viewAttachment = async (path: string) => {
    try {
      await WebBrowser.openBrowserAsync(await api.leaveAttachmentUrl(path));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <>
      <Screen
        refreshing={detail.refreshing}
        onRefresh={detail.refresh}
        header={<PageHeader title={d?.person.full_name ?? 'Attendance'} subtitle={d ? roleLabel[d.person.role] : undefined} />}>
        <View style={{ gap: spacing.lg }}>
          {detail.error && <Banner tone="danger">{detail.error}</Banner>}

          <View style={styles.monthRow}>
            <Pressable onPress={() => setMonth((m) => shiftMonth(m, -1))} hitSlop={12} accessibilityLabel="Previous month" style={styles.monthBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <Text style={[type.h3, { minWidth: 140, textAlign: 'center' }]}>{monthLabel(month)}</Text>
            <Pressable onPress={() => setMonth((m) => shiftMonth(m, 1))} hitSlop={12} accessibilityLabel="Next month" style={styles.monthBtn}>
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </Pressable>
          </View>

          {!d ? (
            <ListSkeleton rows={2} />
          ) : (
            <>
              <Card style={{ gap: spacing.md }}>
                <View style={styles.salaryTop}>
                  <Text style={type.h2}>Salary</Text>
                  <Button title="Edit" size="sm" variant="outline" icon="create-outline" onPress={() => setEditing(true)} />
                </View>
                <View style={styles.salaryGrid}>
                  <Metric label="Base salary" value={formatINR(d.salary.base_salary)} />
                  <Metric label="Per-day rate" value={formatINR(d.salary.per_day_rate)} />
                  <Metric label="Absent days" value={String(d.salary.absent_days)} />
                  <Metric label="Half days" value={String(d.salary.half_days)} />
                  <Metric label="Paid leave" value={String(d.salary.paid_leave_days ?? 0)} />
                  <Metric
                    label="Unpaid leave"
                    value={String(d.salary.unpaid_leave_days ?? 0)}
                    tone={(d.salary.unpaid_leave_days ?? 0) > 0 ? colors.danger : undefined}
                  />
                  <Metric label="Holidays (paid)" value={String(d.salary.holiday_days ?? d.holidays?.length ?? 0)} tone={HOLIDAY_COLOR} />
                  <Metric label="Deduction" value={`-${formatINR(d.salary.deduction)}`} tone={colors.danger} />
                  <Metric label={payableLabel(month, d.salary.as_of)} value={formatINR(d.salary.payable_salary)} tone={colors.brand} />
                </View>
              </Card>

              <SectionTitle title="Calendar" />
              <Card>
                <AttendanceCalendar
                  month={month}
                  records={d.records}
                  holidays={d.holidays}
                  onSelectDay={(dateStr, record, holiday) => {
                    setDayHidden(false);
                    setSelectedDay({ dateStr, record, holiday });
                  }}
                  allowFutureSelect={canEditPunches}
                />
              </Card>
            </>
          )}
        </View>
      </Screen>

      {editing && d && (
        <EditSalarySheet
          userId={id}
          current={d.salary.base_salary}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            detail.reload();
            toast('Salary updated');
          }}
        />
      )}

      <AttendanceDayDetailSheet
        visible={!!selectedDay && !dayHidden && !editingPunches && !markingLeave}
        onClose={closeAll}
        dateStr={selectedDay?.dateStr ?? null}
        record={selectedDay?.record ?? null}
        holiday={selectedDay?.holiday ?? null}
        canEdit={canEditPunches}
        onEdit={() => switchSheet(() => setEditingPunches(true))}
        onMarkLeave={openMarkLeave}
        onCancelLeave={cancelLeave}
        onViewAttachment={viewAttachment}
      />

      {editingPunches && selectedDay && (
        <PunchEditSheet
          userId={id}
          dateStr={selectedDay.dateStr}
          record={selectedDay.record}
          onClose={closeAll}
          onSaved={() => {
            closeAll();
            detail.reload();
            toast('Attendance updated');
          }}
        />
      )}

      {markingLeave && selectedDay && (
        <MarkLeaveSheet
          userId={id}
          dateStr={selectedDay.dateStr}
          record={selectedDay.record}
          perDayRate={d?.salary.per_day_rate ?? null}
          onClose={closeAll}
          onSaved={() => {
            closeAll();
            detail.reload();
            toast('Leave approved');
          }}
        />
      )}
    </>
  );
}

const PUNCH_FIELDS: { key: keyof Punches; label: string; icon: IconName }[] = [
  { key: 'clock_in_at', label: 'Clock in', icon: 'log-in-outline' },
  { key: 'break_start_at', label: 'Break start', icon: 'cafe-outline' },
  { key: 'break_end_at', label: 'Break end', icon: 'play-outline' },
  { key: 'clock_out_at', label: 'Clock out', icon: 'log-out-outline' },
];

type Punches = { clock_in_at: string | null; break_start_at: string | null; break_end_at: string | null; clock_out_at: string | null };

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Combine an existing punch time-of-day (or 10:00) with the edited day's date, in the device's local time. */
function anchorFor(dateStr: string, existing: string | null): Date {
  const base = new Date(`${dateStr}T00:00:00`);
  if (existing) {
    const e = new Date(existing);
    base.setHours(e.getHours(), e.getMinutes(), 0, 0);
  } else {
    base.setHours(10, 0, 0, 0);
  }
  return base;
}

function withPickedTime(dateStr: string, picked: Date): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return d.toISOString();
}

/** "HH:MM" for the browser's time input. */
function toHHMM(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function punchTimes(p: Punches) {
  const t = (k: keyof Punches) => (p[k] ? new Date(p[k]!).getTime() : null);
  return { ci: t('clock_in_at'), bs: t('break_start_at'), be: t('break_end_at'), co: t('clock_out_at') };
}

/** The same rules the server enforces, checked as HR edits so Save is never a surprise. */
function punchProblem(p: Punches): string | null {
  const { ci, bs, be, co } = punchTimes(p);
  if (ci === null && (bs !== null || be !== null || co !== null)) return 'Add a clock-in time first.';
  if (be !== null && bs === null) return 'Add the break start before the break end.';
  if (bs !== null && ci !== null && bs < ci) return 'Break must start after clock-in.';
  if (bs !== null && be !== null && be <= bs) return 'Break end must be after break start.';
  if (co !== null && ci !== null && co <= ci) return 'Clock-out must be after clock-in.';
  if (co !== null && be !== null && co < be) return 'Clock-out must be after the break ends.';
  return null;
}

function punchTotals(p: Punches): { worked: number | null; breakMins: number | null } {
  const { ci, bs, be, co } = punchTimes(p);
  const breakMins = bs !== null && be !== null && be > bs ? Math.round((be - bs) / 60000) : null;
  const worked = ci !== null && co !== null && co > ci ? Math.max(0, Math.round((co - ci) / 60000) - (breakMins ?? 0)) : null;
  return { worked, breakMins };
}

/** Browser time field: the native picker library has no web build, so web used to have no way to edit. */
function WebTimeInput({ value, onChange, label }: { value: string | null; onChange: (hhmm: string | null) => void; label: string }) {
  return createElement('input', {
    type: 'time',
    value: toHHMM(value),
    'aria-label': label,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value || null),
    style: {
      fontFamily: fonts.semibold,
      fontSize: 15,
      color: colors.text,
      background: colors.surface,
      border: `1.5px solid ${colors.border}`,
      borderRadius: radius.md,
      padding: '8px 10px',
      outline: 'none',
      minWidth: 112,
    },
  });
}

/** HR/Boss only: fix a day's punches when an employee forgot to clock out (or any other punch). */
function PunchEditSheet({
  userId,
  dateStr,
  record,
  onClose,
  onSaved,
}: {
  userId: string;
  dateStr: string;
  record: AttendanceRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [punches, setPunches] = useState<Punches>({
    clock_in_at: record?.clock_in_at ?? null,
    break_start_at: record?.break_start_at ?? null,
    break_end_at: record?.break_end_at ?? null,
    clock_out_at: record?.clock_out_at ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [iosField, setIosField] = useState<keyof Punches | null>(null);

  const problem = punchProblem(punches);
  const { worked, breakMins } = punchTotals(punches);
  const empty = PUNCH_FIELDS.every((f) => !punches[f.key]);

  const setField = (key: keyof Punches, value: string | null) => setPunches((p) => ({ ...p, [key]: value }));

  const openPicker = (key: keyof Punches) => {
    const value = anchorFor(dateStr, punches[key]);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode: 'time',
        value,
        is24Hour: false,
        onValueChange: (_e, picked) => {
          if (picked) setField(key, withPickedTime(dateStr, picked));
        },
      });
    } else {
      setIosField(key);
    }
  };

  const save = async () => {
    if (problem) return toast(problem, 'error');
    setBusy(true);
    try {
      await api.hrEditAttendance(userId, dateStr, punches);
      onSaved();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet visible onClose={onClose} title="Edit attendance" placement="center">
        <View style={styles.sheetBody}>
          <View style={styles.sheetIntro}>
            <IconTile icon="calendar-outline" color={colors.brand} bg={colors.brandSoft} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={type.bodyMedium}>{formatDayLabel(dateStr)}</Text>
              <Text style={type.small}>Correct a missed or wrong punch. The employee is notified.</Text>
            </View>
          </View>

          <View style={styles.punchList}>
            {PUNCH_FIELDS.map((f, i) => {
              const v = punches[f.key];
              return (
                <View key={f.key} style={[styles.punchRow, i > 0 && styles.punchRowBorder]}>
                  <IconTile icon={f.icon} color={v ? colors.brand : colors.textMuted} bg={v ? colors.brandSoft : colors.surfaceAlt} size={36} />
                  <Text style={[type.bodyMedium, { flex: 1, minWidth: 0 }]} numberOfLines={1}>
                    {f.label}
                  </Text>
                  {Platform.OS === 'web' ? (
                    <WebTimeInput
                      label={f.label}
                      value={v}
                      onChange={(hhmm) => setField(f.key, hhmm ? new Date(`${dateStr}T${hhmm}:00`).toISOString() : null)}
                    />
                  ) : (
                    <Pressable
                      onPress={() => openPicker(f.key)}
                      style={({ pressed }) => [styles.timePill, !v && styles.timePillEmpty, pressed && { opacity: 0.7 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Set ${f.label} time`}>
                      <Text style={[styles.timePillText, !v && { color: colors.brand }]}>{v ? formatClockTime(v) : '+ Add'}</Text>
                    </Pressable>
                  )}
                  {v ? (
                    <Pressable onPress={() => setField(f.key, null)} hitSlop={10} accessibilityLabel={`Clear ${f.label}`}>
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </Pressable>
                  ) : (
                    <View style={{ width: 20 }} />
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.totals}>
            <Total label="Worked" value={worked !== null ? formatDuration(worked) : '—'} />
            <View style={styles.totalsDivider} />
            <Total label="Break" value={breakMins !== null ? formatDuration(breakMins) : '—'} />
          </View>

          {problem ? (
            <Banner tone="danger" icon="alert-circle-outline">
              {problem}
            </Banner>
          ) : empty ? (
            <Banner tone="warning" icon="information-circle-outline">
              No punches: a past day saved like this counts as Absent.
            </Banner>
          ) : null}

          <Button title="Save attendance" icon="checkmark" size="lg" loading={busy} disabled={!!problem} onPress={save} />
        </View>
      </Sheet>

      {Platform.OS === 'ios' && (
        <Sheet visible={!!iosField} onClose={() => setIosField(null)} title={`Select ${PUNCH_FIELDS.find((f) => f.key === iosField)?.label ?? 'time'}`}>
          {iosField && (
            <DateTimePicker
              value={anchorFor(dateStr, punches[iosField])}
              mode="time"
              display="spinner"
              accentColor={colors.brand}
              themeVariant="light"
              onValueChange={(_e, picked) => {
                if (picked && iosField) setField(iosField, withPickedTime(dateStr, picked));
              }}
            />
          )}
          <Button title="Done" size="lg" onPress={() => setIosField(null)} style={{ marginTop: spacing.md }} />
        </Sheet>
      )}
    </>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={styles.totalValue}>{value}</Text>
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

type Attachment = { uri: string; name: string; mimeType?: string | null };
type PayMode = 'auto' | 'paid' | 'unpaid';

const LEAVE_TYPES: { value: LeaveType; label: string; icon: IconName; tint: string }[] = [
  { value: 'sick', label: 'Sick', icon: 'medkit-outline', tint: colors.danger },
  { value: 'casual', label: 'Casual', icon: 'cafe-outline', tint: colors.brand },
  { value: 'emergency', label: 'Emergency', icon: 'alert-circle-outline', tint: colors.warning },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle-outline', tint: colors.info },
];

/** HR/Boss only: approve (or edit) a day as leave: choose the type and whether it is paid. */
function MarkLeaveSheet({
  userId,
  dateStr,
  record,
  perDayRate,
  onClose,
  onSaved,
}: {
  userId: string;
  dateStr: string;
  record: AttendanceRecord | null;
  perDayRate: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editingLeave = record?.status === 'leave';
  const [leaveType, setLeaveType] = useState<LeaveType>(record?.leave_type ?? 'casual');
  const [payMode, setPayMode] = useState<PayMode>(
    editingLeave && record?.leave_paid != null ? (record.leave_paid ? 'paid' : 'unpaid') : 'auto',
  );
  const [reason, setReason] = useState(record?.leave_reason ?? '');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [keepExisting, setKeepExisting] = useState(!!record?.leave_attachment_path);
  const [busy, setBusy] = useState(false);
  const balance = useLoad(() => api.leaveBalance(userId, Number(dateStr.slice(0, 4))), [userId, dateStr]);
  const b = balance.data;

  // This day's own paid leave is already counted in "used"; don't count it twice when editing.
  const usedOthers = b ? b.used - (editingLeave && record?.leave_paid ? 1 : 0) : 0;
  const autoPaid = !b || usedOthers < b.quota;
  const willBePaid = payMode === 'auto' ? autoPaid : payMode === 'paid';
  const deduction = perDayRate ? formatINR(perDayRate) : null;

  const pickAttachment = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.[0]) return;
    const f = res.assets[0];
    if ((f.size ?? 0) > 10 * 1024 * 1024) return toast('Files must be under 10 MB', 'error');
    setAttachment({ uri: f.uri, name: f.name, mimeType: f.mimeType });
    setKeepExisting(false);
  };

  const save = async () => {
    if (reason.trim() === '') return toast('Add a reason for the leave', 'error');
    setBusy(true);
    try {
      const path = attachment ? await api.uploadLeaveAttachment(userId, attachment) : keepExisting ? (record?.leave_attachment_path ?? null) : null;
      await api.hrMarkLeave(userId, dateStr, reason.trim(), path, leaveType, payMode === 'auto' ? null : payMode === 'paid');
      onSaved();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible onClose={onClose} title={editingLeave ? 'Edit leave' : 'Approve leave'} placement="center">
      <View style={styles.sheetBody}>
        <View style={styles.sheetIntro}>
          <IconTile icon="airplane-outline" color={colors.info} bg={colors.infoSoft} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={type.bodyMedium}>{formatDayLabel(dateStr)}</Text>
            <Text style={type.small}>Any punches on this day are replaced by the leave.</Text>
          </View>
        </View>

        {b && (
          <View style={styles.quotaCard}>
            <View style={styles.quotaTop}>
              <Text style={type.small}>Paid leave this year</Text>
              <Text style={[type.bodyMedium, { color: b.remaining > 0 ? colors.success : colors.danger }]}>
                {b.remaining > 0 ? `${b.remaining} of ${b.quota} left` : 'Quota used up'}
              </Text>
            </View>
            <View style={styles.quotaTrack}>
              <View
                style={[
                  styles.quotaFill,
                  { width: `${Math.min(100, (b.used / Math.max(1, b.quota)) * 100)}%`, backgroundColor: b.remaining > 0 ? colors.brand : colors.danger },
                ]}
              />
            </View>
          </View>
        )}

        <ChoiceChips label="Leave type" options={LEAVE_TYPES} value={leaveType} onChange={setLeaveType} />

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.fieldLabel}>Pay</Text>
          <Segmented<PayMode>
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'paid', label: 'Paid' },
              { value: 'unpaid', label: 'Unpaid' },
            ]}
            value={payMode}
            onChange={setPayMode}
          />
          <View style={[styles.payNote, { backgroundColor: willBePaid ? colors.successSoft : colors.warningSoft }]}>
            <Ionicons name={willBePaid ? 'checkmark-circle' : 'remove-circle'} size={18} color={willBePaid ? colors.success : colors.warning} />
            <Text style={[type.small, { flex: 1, color: colors.text }]}>
              {willBePaid
                ? `Paid: no salary deduction${payMode === 'auto' ? ' (within the yearly quota)' : ''}.`
                : `Unpaid: ${deduction ? `${deduction} deducted` : 'deducted'} from this month's salary${payMode === 'auto' ? ' (quota used up)' : ''}.`}
            </Text>
          </View>
        </View>

        <TextField label="Reason" value={reason} onChangeText={setReason} multiline placeholder="e.g. Fever, doctor advised rest" />

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.fieldLabel}>Attachment (optional)</Text>
          {attachment || keepExisting ? (
            <View style={styles.fileRow}>
              <IconTile icon="document-attach-outline" color={colors.brand} bg={colors.brandSoft} size={36} />
              <Text style={[type.bodyMedium, { flex: 1 }]} numberOfLines={1}>
                {attachment ? attachment.name : 'Current attachment'}
              </Text>
              <Pressable onPress={() => (attachment ? setAttachment(null) : setKeepExisting(false))} hitSlop={10} accessibilityLabel="Remove attachment">
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={pickAttachment} style={({ pressed }) => [styles.dropzone, pressed && { opacity: 0.7 }]} accessibilityRole="button">
              <Ionicons name="cloud-upload-outline" size={22} color={colors.brand} />
              <Text style={[type.bodyMedium, { color: colors.brand }]}>Attach a file</Text>
              <Text style={type.small}>Medical certificate or similar, up to 10 MB</Text>
            </Pressable>
          )}
        </View>

        <Button title={editingLeave ? 'Save leave' : 'Approve leave'} icon="checkmark" size="lg" loading={busy} onPress={save} />
      </View>
    </Sheet>
  );
}

function EditSalarySheet({ userId, current, onClose, onSaved }: { userId: string; current: number | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [salary, setSalary] = useState(current?.toString() ?? '');
  const [busy, setBusy] = useState(false);

  return (
    <Sheet visible onClose={onClose} title="Monthly salary" placement="center">
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <TextField label="Salary / month (₹)" value={salary} onChangeText={setSalary} keyboardType="numeric" autoFocus />
        <Button
          title="Save salary"
          loading={busy}
          disabled={salary.trim() === '' || Number.isNaN(Number(salary))}
          onPress={async () => {
            setBusy(true);
            try {
              await api.setSalary(userId, Number(salary));
              onSaved();
            } catch (e) {
              toast(errorMessage(e), 'error');
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </Sheet>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={type.small}>{label}</Text>
      <Text style={[type.bodyMedium, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  monthBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  // two columns on phones, more as the screen widens
  metric: { flexBasis: '45%', flexGrow: 1, minWidth: 120, gap: 2 },
  salaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  salaryGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg, columnGap: spacing.md },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.lg },
  sheetIntro: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fieldLabel: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.text },
  punchList: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  punchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  punchRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  timePill: { minWidth: 96, alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.brandSoft },
  timePillEmpty: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.brand, borderStyle: 'dashed' },
  timePillText: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.text },
  totals: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  totalsDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  totalValue: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  quotaCard: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  quotaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quotaTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  quotaFill: { height: 8, borderRadius: 4 },
  payNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  dropzone: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
  },
});
