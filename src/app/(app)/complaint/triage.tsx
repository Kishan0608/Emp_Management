import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Badge, Banner, Button, Card, EmptyState, ListSkeleton, PageHeader, PromptSheet, Screen, Segmented } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { complaintCategoryLabel, formatDate, roleLabel, triageLabel, triageTone } from '@/lib/format';
import type { HrComplaint, TriageStatus } from '@/lib/types';
import { useToast } from '@/providers/ToastProvider';
import { colors, radius, spacing, type } from '@/theme/tokens';

const RESULTS: { value: Exclude<TriageStatus, 'pending'>; label: string; help: string }[] = [
  { value: 'credible', label: 'Credible', help: 'Specific and plausible. Counts toward the person’s record.' },
  { value: 'duplicate', label: 'Duplicate', help: 'Same incident already reported. Won’t count again.' },
  { value: 'unsubstantiated', label: 'Unsubstantiated', help: 'Too vague to act on. Won’t count.' },
  { value: 'malicious', label: 'Malicious', help: 'Appears to be a false or targeted report. Won’t count.' },
];

export default function Triage() {
  const toast = useToast();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const list = useLoad(() => api.hrComplaints(tab === 'pending' ? 'pending' : undefined), [tab]);
  const [target, setTarget] = useState<{ c: HrComplaint; status: Exclude<TriageStatus, 'pending'> } | null>(null);

  return (
    <>
      <Screen refreshing={list.refreshing} onRefresh={list.refresh} header={<PageHeader title="Triage inbox" subtitle="HR case handler" />}>
        <View style={{ gap: spacing.md }}>
          <Banner tone="info" title="You see text, never the author">
            No author is stored, so nobody can reveal one. Every time you open this list, the views are recorded in the audit log. Complaints about you are routed to another handler.
          </Banner>
          <Segmented
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'all', label: 'All' },
            ]}
            value={tab}
            onChange={setTab}
          />
          {list.error && <Banner tone="danger">{list.error}</Banner>}
          {list.loading ? (
            <ListSkeleton rows={3} />
          ) : (list.data ?? []).length === 0 ? (
            <Card>
              <EmptyState icon="file-tray-outline" title="Inbox zero" body="No complaints waiting for triage." />
            </Card>
          ) : (
            (list.data ?? []).map((c, i) => (
              <Animated.View key={c.id} entering={FadeInDown.delay(i * 40)}>
                <Card style={{ gap: spacing.md }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <Badge label={triageLabel[c.triage_status]} tone={triageTone[c.triage_status]} />
                    <Badge label={complaintCategoryLabel[c.category]} />
                    <Badge label={`Received ${formatDate(c.received_date)}`} icon="calendar-outline" />
                  </View>
                  <Text style={type.small}>
                    About <Text style={type.smallMedium}>{c.target_name}</Text> · {roleLabel[c.target_role]}
                  </Text>
                  <Text style={[type.body, styles.quote]}>{c.description}</Text>
                  {c.triage_note && <Text style={type.small}>Note: {c.triage_note}</Text>}
                  <View style={styles.actions}>
                    {RESULTS.map((r) => (
                      <Button
                        key={r.value}
                        title={r.label}
                        size="sm"
                        variant={r.value === 'credible' ? 'danger' : 'outline'}
                        style={{ flexGrow: 1 }}
                        onPress={() => setTarget({ c, status: r.value })}
                      />
                    ))}
                  </View>
                </Card>
              </Animated.View>
            ))
          )}
        </View>
      </Screen>

      {target && (
        <PromptSheet
          visible
          onClose={() => setTarget(null)}
          title={`Mark as ${triageLabel[target.status].toLowerCase()}`}
          message={RESULTS.find((r) => r.value === target.status)?.help}
          placeholder="Internal note (optional)"
          confirmLabel="Save"
          required={false}
          onConfirm={async (note) => {
            try {
              await api.triage(target.c.id, target.status, note);
              toast('Triage saved');
              setTarget(null);
              list.reload();
            } catch (e) {
              toast(errorMessage(e), 'error');
            }
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  quote: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderLeftWidth: 3, borderLeftColor: colors.complaint },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
