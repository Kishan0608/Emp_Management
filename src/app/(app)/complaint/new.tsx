import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { AppText, Banner, Button, Card, ChoiceChips, PageHeader, Screen, SelectField, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { complaintCategoryLabel, roleLabel } from '@/lib/format';
import type { ComplaintCategory } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { colors, fonts, spacing, type } from '@/theme/tokens';

type Cat = ComplaintCategory | 'harassment';

export default function NewComplaint() {
  const { me } = useMe();
  const people = useLoad(() => api.directory());
  const quota = useLoad(() => api.myQuota());
  const [target, setTarget] = useState<string | null>(null);
  const [category, setCategory] = useState<Cat | null>(null);
  const [text, setText] = useState('');
  const [ctx, setCtx] = useState<{ group_size: number; small_group: boolean; min_group_size: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    setCtx(null);
    if (target) api.targetContext(target).then(setCtx).catch(() => {});
  }, [target]);

  useEffect(() => {
    if (category === 'harassment') router.replace('/complaint/confidential');
  }, [category]);

  const options = useMemo(
    () =>
      (people.data ?? [])
        .filter((p) => p.is_active && p.id !== me.id)
        .map((p) => ({ value: p.id, label: p.full_name, sublabel: [roleLabel[p.role], p.job_title].filter(Boolean).join(' · ') })),
    [people.data, me.id],
  );

  const left = quota.data ? quota.data.limit - quota.data.used : null;

  const submit = async () => {
    setError(null);
    if (!target) return setError('Choose who this is about.');
    if (!category || category === 'harassment') return setError('Choose a category.');
    if (text.trim().length < 20) return setError('Describe what happened (at least 20 characters).');
    setBusy(true);
    try {
      const res = await api.submitComplaint({ target_id: target, category, description: text.trim() });
      setDone(res.remaining);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (done !== undefined) {
    return (
      <Screen header={<PageHeader title="Complaint received" />}>
        <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.huge }}>
          <Animated.View entering={ZoomIn.springify()} style={styles.okCircle}>
            <Ionicons name="shield-checkmark" size={40} color={colors.white} />
          </Animated.View>
          <AppText variant="h1" style={{ textAlign: 'center' }}>
            Received anonymously
          </AppText>
          <AppText variant="body" color={colors.textSecondary} style={{ textAlign: 'center', maxWidth: 360 }}>
            Your complaint was saved without your name, account, device or time. HR will review it. Nobody can see that it came from you.
          </AppText>
          {done != null && <AppText variant="small">{`You can file ${done} more this month.`}</AppText>}
          <Button title="Done" onPress={() => router.back()} style={{ marginTop: spacing.md, minWidth: 180 }} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      keyboard
      header={<PageHeader title="Anonymous complaint" subtitle={left != null ? `${left} left this month` : undefined} />}
      footer={<Button title="Submit anonymously" icon="eye-off" size="lg" variant="danger" loading={busy} disabled={left === 0} onPress={submit} />}>
      <View style={{ gap: spacing.lg }}>
        <Card style={styles.promise}>
          <Ionicons name="finger-print" size={26} color={colors.success} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={type.h3}>How your identity is protected</Text>
            {[
              'Your name, account, device, IP address and exact time are never stored with the complaint.',
              'The Boss sees only how many complaints someone has received.',
              'Only the HR case handler reads the text, and every view is logged.',
            ].map((l) => (
              <View key={l} style={{ flexDirection: 'row', gap: 8 }}>
                <Ionicons name="checkmark" size={16} color={colors.success} style={{ marginTop: 2 }} />
                <Text style={[type.small, { flex: 1 }]}>{l}</Text>
              </View>
            ))}
          </View>
        </Card>

        {left === 0 && <Banner tone="warning">You have reached this month&apos;s limit. It resets on the 1st.</Banner>}
        {error && <Banner tone="danger">{error}</Banner>}

        <Card style={{ gap: spacing.lg }}>
          <SelectField label="Who is this about?" icon="person-outline" placeholder="Choose a person" options={options} value={target} onChange={setTarget} />
          {ctx?.small_group && (
            <Banner tone="warning" title="Small team">
              {`This person's team has only ${ctx.group_size} other people. They may be able to guess who filed this from the details.`}
            </Banner>
          )}
          <ChoiceChips
            label="Category"
            value={category}
            onChange={setCategory}
            options={[
              ...(Object.keys(complaintCategoryLabel) as ComplaintCategory[]).map((c) => ({ value: c as Cat, label: complaintCategoryLabel[c] })),
              { value: 'harassment' as const, label: 'Sexual harassment →', tint: colors.accent, icon: 'lock-closed-outline' as const },
            ]}
          />
        </Card>

        <Card style={{ gap: spacing.md }}>
          <TextField
            label="What happened?"
            value={text}
            onChangeText={setText}
            multiline
            counter={4000}
            placeholder="Describe the behaviour, when it happened and its impact. Stick to facts."
          />
          <Banner tone="warning">
            Your writing style and specific details (dates, places, who was present) can identify you. Keep it factual, and avoid details only you would know.
          </Banner>
        </Card>
        <Text style={styles.foot}>False or malicious complaints are tagged by HR and don&apos;t count toward anyone&apos;s record.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  promise: { flexDirection: 'row', gap: spacing.md, backgroundColor: '#F4FBF6', borderColor: colors.success + '33' },
  okCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  foot: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
