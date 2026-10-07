import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, EmptyState, ListSkeleton, PageHeader, Screen, SectionTitle, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { formatClockTime } from '@/lib/format';
import type { MyLocationAlert } from '@/lib/types';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

const PROBLEM: Record<MyLocationAlert['kind'], { title: string; fix: string; icon: keyof typeof Ionicons.glyphMap }> = {
  sharing_off: {
    title: 'Location sharing is off',
    fix: 'It is your office time. Turn location sharing back on so your manager can see you are working.',
    icon: 'eye-off-outline',
  },
  gps_off: {
    title: 'GPS is off on your phone',
    fix: 'Turn on Location / GPS in your phone settings, and keep SKFL on "Allow all the time".',
    icon: 'locate-outline',
  },
  no_update: {
    title: "SKFL can't see your location",
    fix: 'Check that GPS and mobile data are on, then open SKFL once. If your phone saves battery, set SKFL to "Unrestricted".',
    icon: 'cloud-offline-outline',
  },
};

const REASONS = ['No network here', 'Phone charging / battery low', 'In a client meeting'];

/** When the manager / HR will be told (their set minutes after this notice), if the location does not come back first. */
function escalatesAt(a: MyLocationAlert): Date | null {
  if (a.escalated_at || a.resolved_at || !a.employee_notified_at) return null;
  return new Date(new Date(a.employee_notified_at).getTime() + a.escalate_after_min * 60_000);
}

export default function LocationAlertScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const alert = useLoad(() => api.myLocationAlert(id), [id]);
  // Tapping a reason only selects it; "Send reason" submits the selected or typed one.
  const [choice, setChoice] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [sending, setSending] = useState(false);

  const a = alert.data;
  const reason = other.trim() || choice;

  const pick = (r: string) => {
    setChoice(r);
    setOther('');
  };
  const typeOther = (text: string) => {
    setOther(text);
    if (text.trim()) setChoice(null);
  };

  const sendReason = async () => {
    if (!a || !reason || reason.length < 2 || sending) return;
    setSending(true);
    try {
      await api.locationAlertReason(a.id, reason);
      toast('Reason sent. It will be shown to your manager and HR');
      setChoice(null);
      setOther('');
      alert.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen refreshing={alert.refreshing} onRefresh={alert.refresh} header={<PageHeader title="Location alert" />}>
      {alert.loading ? (
        <ListSkeleton rows={3} />
      ) : alert.error || !a ? (
        <Card>
          <EmptyState icon="navigate-outline" title="Alert not found" body={alert.error ?? 'It may have been closed already.'} />
        </Card>
      ) : (
        <View style={styles.wrap}>
          <Status a={a} />

          <Card style={styles.problem}>
            <View style={styles.problemHead}>
              <View style={styles.problemIcon}>
                <Ionicons name={PROBLEM[a.kind].icon} size={22} color={colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.problemTitle}>{PROBLEM[a.kind].title}</Text>
                <Text style={styles.problemSince}>Since {formatClockTime(a.started_at)}</Text>
              </View>
            </View>
            {!a.resolved_at && (
              <>
                <Text style={styles.fix}>{PROBLEM[a.kind].fix}</Text>
                {a.kind === 'sharing_off' ? (
                  <Button title="Turn on location sharing" icon="navigate" full onPress={() => router.push('/more')} />
                ) : a.kind === 'gps_off' ? (
                  <Button title="Open phone settings" icon="settings-outline" full onPress={() => Linking.openSettings().catch(() => {})} />
                ) : null}
              </>
            )}
          </Card>

          {a.reason ? (
            <>
              <SectionTitle title="Your reason" />
              <SentReason a={a} />
            </>
          ) : !a.resolved_at ? (
            <>
              <SectionTitle title="Can't fix it right now?" />
              <Card style={styles.reasons}>
                <Text style={styles.reasonHint}>
                  {a.escalated_at
                    ? 'Your manager and HR were already told. Your reason will be sent to them.'
                    : 'Tell your manager why. Your reason will be shown in the alert they receive.'}
                </Text>
                {REASONS.map((r) => {
                  const selected = choice === r;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => pick(r)}
                      disabled={sending}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      style={({ pressed }) => [styles.reason, selected && styles.reasonSelected, pressed && { opacity: 0.85 }]}>
                      <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>{r}</Text>
                      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.brand : colors.textMuted} />
                    </Pressable>
                  );
                })}
                <TextField placeholder="Other reason…" value={other} onChangeText={typeOther} maxLength={200} editable={!sending} />
                <Text style={styles.onceNote}>{"You can send one reason. It can't be changed after sending."}</Text>
                <Button
                  title="Send reason"
                  icon="send"
                  disabled={!reason || reason.length < 2 || sending}
                  loading={sending}
                  onPress={sendReason}
                />
              </Card>
            </>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

/** The reason that was sent: shown instead of the menu, and it can't be changed. */
function SentReason({ a }: { a: MyLocationAlert }) {
  const at = escalatesAt(a);
  const outcome = a.escalated_at
    ? 'Sent to your manager and HR'
    : a.resolved_at
      ? 'Not sent: your location came back first'
      : at
        ? `Will be sent to your manager and HR at ${formatClockTime(at.toISOString())} with the alert`
        : 'Will be sent to your manager and HR with the alert';
  return (
    <Card style={styles.sent}>
      <View style={styles.sentRow}>
        <View style={styles.sentIcon}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.success} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.sentReason}>“{a.reason}”</Text>
          <Text style={styles.sentMeta}>Sent at {formatClockTime(a.reason_at)}</Text>
        </View>
        <Ionicons name="checkmark-circle" size={20} color={colors.success} />
      </View>
      <View style={styles.sentOutcome}>
        <Ionicons name="information-circle-outline" size={15} color={colors.textSecondary} />
        <Text style={styles.sentOutcomeText}>{outcome}</Text>
      </View>
    </Card>
  );
}

function Status({ a }: { a: MyLocationAlert }) {
  if (a.resolved_at) {
    return (
      <Banner tone="success" icon="checkmark-circle" title="Fixed">
        {`Your location is updating again (${formatClockTime(a.resolved_at)}).`}
      </Banner>
    );
  }
  if (a.escalated_at) {
    return (
      <Banner tone="danger" title="Your manager and HR were told">
        {`They were notified at ${formatClockTime(a.escalated_at)}. Fix it as soon as you can.`}
      </Banner>
    );
  }
  const at = escalatesAt(a);
  return (
    <Banner tone="warning" title="Fix it to avoid an alert">
      {at
        ? `Your manager and HR will be told at ${formatClockTime(at.toISOString())} unless your location comes back first.`
        : 'Your manager and HR will be told if this is not fixed soon.'}
    </Banner>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: spacing.lg },
  problem: { gap: spacing.md },
  problemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  problemIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  problemTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.text },
  problemSince: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  fix: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  reasons: { gap: spacing.sm },
  reasonHint: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginBottom: 4 },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reasonSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  reasonText: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  reasonTextSelected: { fontFamily: fonts.semibold, color: colors.brandDeep },
  onceNote: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  sent: { gap: spacing.sm },
  sentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sentIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentReason: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  sentMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  sentOutcome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sentOutcomeText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary, flex: 1 },
});
