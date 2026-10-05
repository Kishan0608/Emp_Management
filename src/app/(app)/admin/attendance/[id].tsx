import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, Banner, Button, Card, Divider, EmptyState, ListSkeleton, PageHeader, Screen, SectionTitle, Sheet, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { attendanceStatusLabel, attendanceStatusTone, formatClockTime, formatDayLabel, formatINR, monthKey, monthLabel, roleLabel, shiftMonth } from '@/lib/format';
import type { AttendanceRecord } from '@/lib/types';
import { useToast } from '@/providers/ToastProvider';
import { colors, spacing, type } from '@/theme/tokens';

export default function AttendanceDetailScreen() {
  const { id, month: monthParam } = useLocalSearchParams<{ id: string; month?: string }>();
  const [month, setMonth] = useState(() => monthParam ?? monthKey());
  const [editing, setEditing] = useState(false);
  const toast = useToast();
  const detail = useLoad(() => api.attendanceDetail(id, month), [id, month]);

  const d = detail.data;

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
                  <Metric label="Deduction" value={`-${formatINR(d.salary.deduction)}`} tone={colors.danger} />
                  <Metric label="Payable" value={formatINR(d.salary.payable_salary)} tone={colors.brand} />
                </View>
              </Card>

              <SectionTitle title="Day by day" />
              {d.records.length === 0 ? (
                <Card>
                  <EmptyState icon="calendar-outline" title="No records" body="Nothing punched for this month." />
                </Card>
              ) : (
                <Card padded={false}>
                  {d.records.map((r, i) => (
                    <View key={r.id}>
                      {i > 0 && <Divider inset={16} />}
                      <DayRow record={r} />
                    </View>
                  ))}
                </Card>
              )}
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
    </>
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

function DayRow({ record }: { record: AttendanceRecord }) {
  return (
    <View style={styles.dayRow}>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyMedium}>{formatDayLabel(record.work_date)}</Text>
        <Text style={type.small}>
          {formatClockTime(record.clock_in_at)} – {formatClockTime(record.clock_out_at)}
          {record.is_late ? ' · Late' : ''}
          {record.half_day_reason === 'late_streak' ? ' · 4th+ late this month' : ''}
          {record.auto_closed ? ' · Auto-closed' : ''}
        </Text>
      </View>
      {record.status && <Badge label={attendanceStatusLabel[record.status]} tone={attendanceStatusTone[record.status]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  salaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  salaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
});
