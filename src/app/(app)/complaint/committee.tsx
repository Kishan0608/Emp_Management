import { StyleSheet, Text, View } from 'react-native';

import { Badge, Banner, Card, ChoiceChips, EmptyState, ListSkeleton, PageHeader, Screen } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { ConfidentialReport } from '@/lib/types';
import { useToast } from '@/providers/ToastProvider';
import { colors, radius, spacing, type } from '@/theme/tokens';

const STATUSES: { value: ConfidentialReport['committee_status']; label: string }[] = [
  { value: 'received', label: 'Received' },
  { value: 'under_inquiry', label: 'Under inquiry' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

export default function Committee() {
  const toast = useToast();
  const list = useLoad(() => api.committeeReports());

  return (
    <Screen refreshing={list.refreshing} onRefresh={list.refresh} header={<PageHeader title="Internal Committee" subtitle="Confidential POSH reports" />}>
      <View style={{ gap: spacing.md }}>
        <Banner tone="warning" title="Strictly confidential">
          Do not share these details outside the committee. Reports about you are hidden from you. Every time you open this inbox, it is recorded in the audit log.
        </Banner>
        {list.error && <Banner tone="danger">{list.error}</Banner>}
        {list.loading ? (
          <ListSkeleton rows={2} />
        ) : (list.data ?? []).length === 0 ? (
          <Card>
            <EmptyState icon="lock-closed-outline" title="No reports" />
          </Card>
        ) : (
          (list.data ?? []).map((r) => (
            <Card key={r.id} style={{ gap: spacing.md }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Badge label={`From ${r.reporter_name}`} tone="brand" icon="person-outline" />
                {r.target_name && <Badge label={`About ${r.target_name}`} tone="danger" />}
                <Badge label={`Incident ${formatDate(r.incident_date)}`} icon="calendar-outline" />
              </View>
              <Text style={[type.body, styles.quote]}>{r.statement}</Text>
              <Text style={type.small}>Filed {formatDate(r.created_at)}</Text>
              <ChoiceChips
                label="Status"
                options={STATUSES}
                value={r.committee_status}
                onChange={async (s) => {
                  try {
                    await api.committeeUpdate(r.id, s);
                    toast('Status updated. The reporter was notified.');
                    list.reload();
                  } catch (e) {
                    toast(errorMessage(e), 'error');
                  }
                }}
              />
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  quote: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderLeftWidth: 3, borderLeftColor: colors.accent },
});
