import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Banner, Button, Card, DateField, PageHeader, Screen, SelectField, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/tokens';

/** POSH Act lane: confidential (named) reports readable only by the Internal Committee. */
export default function Confidential() {
  const { me } = useMe();
  const toast = useToast();
  const people = useLoad(() => api.directory());
  const [target, setTarget] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [statement, setStatement] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () => (people.data ?? []).filter((p) => p.is_active && p.id !== me.id).map((p) => ({ value: p.id, label: p.full_name, sublabel: p.job_title })),
    [people.data, me.id],
  );

  const submit = async () => {
    setError(null);
    if (statement.trim().length < 30) return setError('Please describe the incident in your statement.');
    setBusy(true);
    try {
      await api.submitConfidential(target, date, statement.trim());
      toast('Report sent to the Internal Committee');
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      keyboard
      header={<PageHeader title="Confidential report" subtitle="Sexual harassment · POSH Act" />}
      footer={<Button title="Send to Internal Committee" icon="lock-closed" size="lg" loading={busy} onPress={submit} />}>
      <View style={{ gap: spacing.lg }}>
        <Banner tone="info" title="Confidential, not anonymous">
          Under the POSH Act the Internal Committee needs to know who is reporting so it can hold an inquiry. Your name and statement are encrypted and visible only to committee members. They are never shown to the Boss, your manager, or the person you report.
        </Banner>
        {error && <Banner tone="danger">{error}</Banner>}
        <Card style={{ gap: spacing.lg }}>
          <SelectField label="Person involved (optional)" icon="person-outline" allowClear options={options} value={target} onChange={setTarget} />
          <DateField label="Date of incident" value={date} onChange={setDate} hint="Approximate is fine" />
          <TextField
            label="Your statement"
            value={statement}
            onChangeText={setStatement}
            multiline
            counter={6000}
            placeholder="What happened, where, and whether anyone witnessed it."
          />
        </Card>
        <Banner tone="neutral">
          You will get updates on this report in the app. You can also contact a committee member directly.
        </Banner>
      </View>
    </Screen>
  );
}
