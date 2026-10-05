import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Badge, Banner, Card, EmptyState, ListSkeleton, PageHeader, Screen, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { formatINR, monthKey, monthLabel, roleLabel, shiftMonth } from '@/lib/format';
import { colors, fonts, spacing, type } from '@/theme/tokens';

export default function AttendanceOverview() {
  const [month, setMonth] = useState(() => monthKey());
  const [q, setQ] = useState('');
  const overview = useLoad(() => api.attendanceOverview(month), [month]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (overview.data ?? []).filter((r) => !t || `${r.full_name} ${r.department ?? ''}`.toLowerCase().includes(t));
  }, [overview.data, q]);

  return (
    <Screen
      refreshing={overview.refreshing}
      onRefresh={overview.refresh}
      header={<PageHeader title="Attendance" subtitle="All employees" />}>
      <View style={{ gap: spacing.lg }}>
        {overview.error && <Banner tone="danger">{overview.error}</Banner>}

        <View style={styles.monthRow}>
          <Ionicons name="chevron-back" size={20} color={colors.text} onPress={() => setMonth((m) => shiftMonth(m, -1))} />
          <Text style={type.h3}>{monthLabel(month)}</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.text} onPress={() => setMonth((m) => shiftMonth(m, 1))} />
        </View>

        <TextField icon="search" placeholder="Search people or department" value={q} onChangeText={setQ} autoCapitalize="none" />

        {overview.loading ? (
          <ListSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState icon="calendar-outline" title="No one to show" body="No employees match this search." />
          </Card>
        ) : (
          rows.map((r) => (
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
                  <Text style={type.small}>Payable this month</Text>
                  <Text style={[type.bodyMedium, { color: colors.brand }]}>{formatINR(r.payable_salary)}</Text>
                </View>
              </View>
              {(r.absent_days > 0 || r.half_days > 0) && <Badge label={`-${formatINR(r.deduction)} deducted`} tone="warning" />}
            </Card>
          ))
        )}
      </View>
    </Screen>
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
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statsRow: { flexDirection: 'row', paddingVertical: spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  salaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
});
