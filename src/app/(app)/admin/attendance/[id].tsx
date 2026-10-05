import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AttendanceCalendar, AttendanceDayDetailSheet } from '@/components/attendance';
import { Banner, Button, Card, IconTile, ListSkeleton, PageHeader, Screen, SectionTitle, Sheet, TextField, type IconName } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { formatClockTime, formatINR, monthKey, monthLabel, payableLabel, roleLabel, shiftMonth } from '@/lib/format';
import type { AttendanceRecord } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, spacing, type } from '@/theme/tokens';

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
  const [selectedDay, setSelectedDay] = useState<{ dateStr: string; record: AttendanceRecord | null } | null>(null);
  const [editingPunches, setEditingPunches] = useState(false);
  const [markingLeave, setMarkingLeave] = useState(false);
  const toast = useToast();
  const detail = useLoad(() => api.attendanceDetail(id, month), [id, month]);

  const d = detail.data;
  // HR/Boss only, and HR cannot edit its own attendance — mirrors the hr_edit_attendance/hr_mark_leave RPCs' own checks.
  const canEditPunches = (isBoss || isHR) && id !== me.id;

  const openMarkLeave = () => {
    const r = selectedDay?.record;
    const hasPunchData = !!r && r.status !== 'leave' && (r.clock_in_at || r.clock_out_at);
    if (hasPunchData) {
      confirmAction('Overwrite this day?', 'This day already has clock-in/out data. Marking it as leave will clear those punches.', () => setMarkingLeave(true));
    } else {
      setMarkingLeave(true);
    }
  };

  const cancelLeave = () => {
    if (!selectedDay) return;
    const dateStr = selectedDay.dateStr;
    confirmAction('Cancel this leave?', 'This removes the leave mark for this day.', async () => {
      try {
        await api.hrCancelLeave(id, dateStr);
        setSelectedDay(null);
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
            <Ionicons name="chevron-back" size={20} color={colors.text} onPress={() => setMonth((m) => shiftMonth(m, -1))} />
            <Text style={type.h3}>{monthLabel(month)}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text} onPress={() => setMonth((m) => shiftMonth(m, 1))} />
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
                  <Metric label="Deduction" value={`-${formatINR(d.salary.deduction)}`} tone={colors.danger} />
                  <Metric label={payableLabel(month, d.salary.as_of)} value={formatINR(d.salary.payable_salary)} tone={colors.brand} />
                </View>
              </Card>

              <SectionTitle title="Calendar" />
              <Card>
                <AttendanceCalendar
                  month={month}
                  records={d.records}
                  onSelectDay={(dateStr, record) => setSelectedDay({ dateStr, record })}
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
        visible={!!selectedDay && !editingPunches && !markingLeave}
        onClose={() => setSelectedDay(null)}
        dateStr={selectedDay?.dateStr ?? null}
        record={selectedDay?.record ?? null}
        canEdit={canEditPunches}
        onEdit={() => setEditingPunches(true)}
        onMarkLeave={openMarkLeave}
        onCancelLeave={cancelLeave}
        onViewAttachment={viewAttachment}
      />

      {editingPunches && selectedDay && (
        <PunchEditSheet
          userId={id}
          dateStr={selectedDay.dateStr}
          record={selectedDay.record}
          onClose={() => {
            setEditingPunches(false);
            setSelectedDay(null);
          }}
          onSaved={() => {
            setEditingPunches(false);
            setSelectedDay(null);
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
          onClose={() => {
            setMarkingLeave(false);
            setSelectedDay(null);
          }}
          onSaved={() => {
            setMarkingLeave(false);
            setSelectedDay(null);
            detail.reload();
            toast('Leave marked');
          }}
        />
      )}
    </>
  );
}

const PUNCH_FIELDS: { key: 'clock_in_at' | 'break_start_at' | 'break_end_at' | 'clock_out_at'; label: string; icon: IconName }[] = [
  { key: 'clock_in_at', label: 'Clock in', icon: 'log-in-outline' },
  { key: 'break_start_at', label: 'Break start', icon: 'cafe-outline' },
  { key: 'break_end_at', label: 'Break end', icon: 'play-outline' },
  { key: 'clock_out_at', label: 'Clock out', icon: 'log-out-outline' },
];

type Punches = { clock_in_at: string | null; break_start_at: string | null; break_end_at: string | null; clock_out_at: string | null };

/** Combine an existing punch time-of-day (or now) with the edited day's date, in the device's local time. */
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
      <Sheet visible onClose={onClose} title="Edit punches">
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }}>
          <Banner tone="info">Fix a day where an employee forgot to punch — for example a missing clock-out.</Banner>

          {PUNCH_FIELDS.map((f) => (
            <View key={f.key} style={styles.punchRow}>
              <IconTile icon={f.icon} color={colors.brand} bg={colors.brandSoft} size={36} />
              <Pressable style={{ flex: 1 }} onPress={() => openPicker(f.key)} accessibilityRole="button" accessibilityLabel={`Set ${f.label} time`}>
                <Text style={type.small}>{f.label}</Text>
                <Text style={type.bodyMedium}>{punches[f.key] ? formatClockTime(punches[f.key]) : 'Not set — tap to add'}</Text>
              </Pressable>
              {punches[f.key] && (
                <Pressable onPress={() => setField(f.key, null)} hitSlop={10} accessibilityLabel={`Clear ${f.label}`}>
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          ))}

          <Button title="Save punches" loading={busy} onPress={save} />
        </View>
      </Sheet>

      {Platform.OS !== 'android' && (
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

type Attachment = { uri: string; name: string; mimeType?: string | null };

/** HR/Boss only: mark (or edit) a day as leave. Paid up to the annual quota, unpaid (and deducted) beyond it. */
function MarkLeaveSheet({
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
  const [reason, setReason] = useState(record?.leave_reason ?? '');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [keepExisting, setKeepExisting] = useState(!!record?.leave_attachment_path);
  const [busy, setBusy] = useState(false);
  const balance = useLoad(() => api.leaveBalance(userId, Number(dateStr.slice(0, 4))), [userId, dateStr]);
  const b = balance.data;

  const pickAttachment = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.[0]) return;
    const f = res.assets[0];
    if ((f.size ?? 0) > 10 * 1024 * 1024) return toast('Files must be under 10 MB', 'error');
    setAttachment({ uri: f.uri, name: f.name, mimeType: f.mimeType });
    setKeepExisting(false);
  };

  const save = async () => {
    if (reason.trim() === '') return toast('A reason is required', 'error');
    setBusy(true);
    try {
      const path = attachment ? await api.uploadLeaveAttachment(userId, attachment) : keepExisting ? (record?.leave_attachment_path ?? null) : null;
      await api.hrMarkLeave(userId, dateStr, reason.trim(), path);
      onSaved();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible onClose={onClose} title={record?.status === 'leave' ? 'Edit leave' : 'Mark leave'}>
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }}>
        {b && (
          <Banner tone={b.used < b.quota ? 'info' : 'warning'}>
            {`Paid leave used this year: ${b.used} of ${b.quota}. ${
              b.used < b.quota ? `${b.remaining} remaining before further leave becomes unpaid.` : 'Quota reached — this day will be unpaid and deducted.'
            }`}
          </Banner>
        )}

        <TextField label="Reason" value={reason} onChangeText={setReason} multiline placeholder="e.g. Sick leave, family emergency" />

        <View style={{ gap: 6 }}>
          <Text style={type.small}>Attachment (optional)</Text>
          {attachment ? (
            <View style={styles.punchRow}>
              <Text style={[type.bodyMedium, { flex: 1 }]} numberOfLines={1}>
                {attachment.name}
              </Text>
              <Pressable onPress={() => setAttachment(null)} hitSlop={10} accessibilityLabel="Remove attachment">
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : keepExisting ? (
            <View style={styles.punchRow}>
              <Text style={[type.bodyMedium, { flex: 1 }]}>Existing attachment kept</Text>
              <Pressable onPress={() => setKeepExisting(false)} hitSlop={10} accessibilityLabel="Remove attachment">
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : (
            <Button title="Attach file" size="sm" variant="outline" icon="attach-outline" onPress={pickAttachment} style={{ alignSelf: 'flex-start' }} />
          )}
        </View>

        <Button title="Save leave" loading={busy} onPress={save} />
      </View>
    </Sheet>
  );
}

function EditSalarySheet({ userId, current, onClose, onSaved }: { userId: string; current: number | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [salary, setSalary] = useState(current?.toString() ?? '');
  const [busy, setBusy] = useState(false);

  return (
    <Sheet visible onClose={onClose} title="Monthly salary">
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
    <View style={{ minWidth: 110, gap: 2 }}>
      <Text style={type.small}>{label}</Text>
      <Text style={[type.bodyMedium, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  salaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  salaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  punchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
