import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  AppText,
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Divider,
  EmptyState,
  HeroHeader,
  IconTile,
  ListRow,
  ListSkeleton,
  PromptSheet,
  Screen,
  SectionTitle,
} from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { caseStageLabel, flagLabel, flagTone, formatDate } from '@/lib/format';
import type { ComplaintOverviewRow } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, gradients, radius, spacing, type } from '@/theme/tokens';

export default function Complaints() {
  const { isBoss, isHR, isCaseHandler, is_committee, settings } = useMe();
  const toast = useToast();
  const seesOverview = isBoss || isCaseHandler;
  const quota = useLoad(() => api.myQuota());
  const overview = useLoad(() => (seesOverview ? api.complaintOverview() : Promise.resolve([] as ComplaintOverviewRow[])), [seesOverview]);
  const cases = useLoad(() => api.cases());
  const mine = useLoad(() => api.myConfidential());
  const [openFor, setOpenFor] = useState<ComplaintOverviewRow | null>(null);

  const refresh = () => {
    quota.refresh();
    overview.refresh();
    cases.refresh();
    mine.refresh();
  };

  const openCases = (cases.data ?? []).filter((c) => !c.closed_at);
  const closedCases = (cases.data ?? []).filter((c) => c.closed_at);

  return (
    <>
      <Screen
        refreshing={quota.refreshing}
        onRefresh={refresh}
        header={
          <HeroHeader
            title={seesOverview ? 'Integrity' : 'Complaints'}
            subtitle={seesOverview ? 'Numbers only · identities are never stored' : 'Speak up safely'}
            colorsOverride={gradients.complaint}
          />
        }>
        <View style={{ gap: spacing.md }}>
          {/* Everyone can raise a concern */}
          <SectionTitle title="Raise a concern" />
          <Animated.View entering={FadeInDown.duration(300)}>
            <Card onPress={() => router.push('/complaint/new')} style={styles.option}>
              <IconTile icon="eye-off" color={colors.complaint} bg={colors.complaintSoft} size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.h3}>Anonymous complaint</Text>
                <Text style={type.small}>About a colleague&apos;s conduct or work. Your identity is never stored.</Text>
                {quota.data && (
                  <Text style={[type.small, { color: colors.complaint, fontFamily: fonts.medium, marginTop: 4 }]}>
                    {quota.data.limit - quota.data.used} of {quota.data.limit} left this month
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Card>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(60).duration(300)}>
            <Card onPress={() => router.push('/complaint/confidential')} style={styles.option}>
              <IconTile icon="lock-closed" color={colors.accent} bg="#F3EEFE" size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.h3}>Sexual harassment (POSH)</Text>
                <Text style={type.small}>Confidential, not anonymous. Only the Internal Committee can read it.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Card>
          </Animated.View>

          {(mine.data ?? []).length > 0 && (
            <>
              <SectionTitle title="My confidential reports" />
              <Card padded={false}>
                {(mine.data ?? []).map((r, i) => (
                  <View key={r.id}>
                    {i > 0 && <Divider inset={16} />}
                    <ListRow
                      title={r.target_name ? `About ${r.target_name}` : 'Report'}
                      subtitle={`Filed ${formatDate(r.created_at)}`}
                      right={<Badge label={r.committee_status.replace('_', ' ')} tone={r.committee_status === 'resolved' ? 'success' : 'info'} />}
                    />
                  </View>
                ))}
              </Card>
            </>
          )}

          {/* HR case handler & committee tools */}
          {(isCaseHandler || is_committee) && <SectionTitle title="Your desk" />}
          {isCaseHandler && (
            <Card onPress={() => router.push('/complaint/triage')} style={styles.option}>
              <IconTile icon="file-tray-full" color={colors.complaint} bg={colors.complaintSoft} />
              <View style={{ flex: 1 }}>
                <Text style={type.h3}>Triage inbox</Text>
                <Text style={type.small}>Read complaint text and tag each one. Every view is logged.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Card>
          )}
          {is_committee && (
            <Card onPress={() => router.push('/complaint/committee')} style={styles.option}>
              <IconTile icon="people-circle" color={colors.accent} bg="#F3EEFE" />
              <View style={{ flex: 1 }}>
                <Text style={type.h3}>Internal Committee inbox</Text>
                <Text style={type.small}>Confidential POSH reports.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Card>
          )}

          {/* Boss / handler: numbers only */}
          {seesOverview && (
            <>
              <SectionTitle title="Complaint counts" />
              <Banner tone="info" title="What you can see">
                {`Totals per person only. No text and no author. Yellow at ${settings.yellow_threshold}+ and red at ${settings.red_threshold}+ different people in ${settings.window_days} days. Complaints HR marks duplicate, unsubstantiated or malicious don't count.`}
              </Banner>
              {overview.error && <Banner tone="danger">{overview.error}</Banner>}
              {overview.loading ? (
                <ListSkeleton rows={3} />
              ) : (overview.data ?? []).length === 0 ? (
                <Card>
                  <EmptyState icon="shield-checkmark-outline" title="No complaints on record" />
                </Card>
              ) : (
                (overview.data ?? []).map((r, i) => (
                  <Animated.View key={r.target_id} entering={FadeInDown.delay(i * 40)}>
                    <FlagCard row={r} red={settings.red_threshold} onOpen={() => setOpenFor(r)} isBoss={isBoss} />
                  </Animated.View>
                ))
              )}
            </>
          )}

          {/* Cases: Boss/HR see all; an employee sees their own after notice */}
          {(isBoss || isHR || openCases.length + closedCases.length > 0) && (
            <>
              <SectionTitle title="Disciplinary cases" />
              {openCases.length + closedCases.length === 0 ? (
                <AppText variant="small">No cases.</AppText>
              ) : (
                <Card padded={false}>
                  {[...openCases, ...closedCases].map((c, i) => (
                    <View key={c.id}>
                      {i > 0 && <Divider inset={64} />}
                      <ListRow
                        onPress={() => router.push(`/case/${c.id}`)}
                        left={<Avatar name={c.target?.full_name} id={c.target_id} />}
                        title={c.target?.full_name ?? 'Employee'}
                        subtitle={`${caseStageLabel[c.stage]} · opened ${formatDate(c.opened_at)}`}
                        right={c.closed_at ? <Badge label={c.terminated_at ? 'Terminated' : 'Closed'} /> : <Badge label="Open" tone="warning" />}
                      />
                    </View>
                  ))}
                </Card>
              )}
            </>
          )}
        </View>
      </Screen>

      {openFor && (
        <PromptSheet
          visible
          onClose={() => setOpenFor(null)}
          title={`Open a case: ${openFor.full_name}`}
          message="Opening a case starts a preliminary inquiry. HR gathers independent evidence first; the employee is only notified when a show-cause notice is issued. An anonymous complaint alone is never enough to act on."
          placeholder="Summary of the concern (no complainant details)"
          confirmLabel="Open case"
          minLength={10}
          onConfirm={async (summary) => {
            try {
              const id = await api.openCase(openFor.target_id, summary);
              toast('Case opened');
              setOpenFor(null);
              router.push(`/case/${id}`);
            } catch (e) {
              toast(errorMessage(e), 'error');
            }
          }}
        />
      )}
    </>
  );
}

function FlagCard({ row, red, onOpen, isBoss }: { row: ComplaintOverviewRow; red: number; onOpen: () => void; isBoss: boolean }) {
  const pct = Math.min(1, row.distinct_in_window / red);
  const barColor = row.level === 'red' ? colors.danger : row.level === 'yellow' ? colors.warning : colors.info;
  return (
    <Card style={[{ gap: spacing.md }, row.level === 'red' && { borderColor: colors.danger + '55' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar name={row.full_name} id={row.target_id} />
        <View style={{ flex: 1 }}>
          <Text style={type.bodyMedium}>{row.full_name}</Text>
          <Text style={type.small}>{[row.job_title, row.department].filter(Boolean).join(' · ')}</Text>
        </View>
        <Badge label={flagLabel[row.level]} tone={flagTone[row.level]} icon="flag" />
      </View>
      <View style={styles.counts}>
        <Count label="Received" value={row.total_received} />
        <Count label="Different people" value={row.distinct_in_window} tone={barColor} />
        <Count label="Credible" value={row.credible_count} />
        <Count label="Pending triage" value={row.pending_count} />
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: barColor }]} />
      </View>
      {row.open_case_id ? (
        <Button title="View case" size="sm" variant="outline" icon="briefcase-outline" onPress={() => router.push(`/case/${row.open_case_id}`)} />
      ) : row.level === 'red' && isBoss ? (
        <Button title="Open disciplinary case" size="sm" variant="danger" icon="briefcase-outline" onPress={onOpen} />
      ) : null}
    </Card>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 70 }}>
      <Text style={[styles.countValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={[type.small, { fontSize: 12 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  countValue: { fontFamily: fonts.bold, fontSize: 20, color: colors.text },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: '#F0EDE6', overflow: 'hidden' },
  fill: { height: 6, borderRadius: radius.pill },
});
