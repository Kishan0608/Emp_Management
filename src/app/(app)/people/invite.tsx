import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppText, Banner, Button, Card, ChoiceChips, PageHeader, Screen, SelectField, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { roleLabel } from '@/lib/format';
import type { Role } from '@/lib/types';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

export default function Invite() {
  const toast = useToast();
  const people = useLoad(() => api.directory());
  const depts = useLoad(() => api.departments());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('employee');
  const [dept, setDept] = useState<string | null>(null);
  const [manager, setManager] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.invite({ email: email.trim(), full_name: name.trim(), role, department_id: dept, manager_id: manager, job_title: title.trim() });
      setResult({ email: email.trim().toLowerCase(), password: res.temp_password });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Screen header={<PageHeader title="Invitation ready" />}>
        <Card style={{ gap: spacing.lg }}>
          <AppText variant="h2">Share these sign-in details privately</AppText>
          <AppText variant="small">The one-time password is shown only once. The person must change it at first sign-in and read the privacy notice.</AppText>
          <View style={styles.cred}>
            <Text style={styles.credLabel}>Email</Text>
            <Text style={styles.credValue} selectable>
              {result.email}
            </Text>
            <Text style={[styles.credLabel, { marginTop: spacing.md }]}>One-time password</Text>
            <Text style={[styles.credValue, { letterSpacing: 1 }]} selectable>
              {result.password}
            </Text>
          </View>
          <Button
            title="Copy details"
            icon="copy-outline"
            variant="secondary"
            onPress={async () => {
              await Clipboard.setStringAsync(`Email: ${result.email}\nOne-time password: ${result.password}`);
              toast('Copied', 'info');
            }}
          />
          <Button title="Done" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen keyboard header={<PageHeader title="Invite a person" subtitle="Accounts are invite-only" />} footer={<Button title="Create account" icon="person-add" size="lg" loading={busy} onPress={submit} />}>
      <View style={{ gap: spacing.lg }}>
        {error && <Banner tone="danger">{error}</Banner>}
        <Card style={{ gap: spacing.lg }}>
          <TextField label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
          <TextField label="Work email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" icon="mail-outline" />
          <TextField label="Job title" value={title} onChangeText={setTitle} />
        </Card>
        <Card style={{ gap: spacing.lg }}>
          <ChoiceChips
            label="Role"
            value={role}
            onChange={setRole}
            hint="Start with the lowest role that fits. You can promote later."
            options={(['employee', 'manager', 'hr', 'boss'] as Role[]).map((r) => ({ value: r, label: roleLabel[r] }))}
          />
          <SelectField label="Department" allowClear value={dept} onChange={setDept} options={(depts.data ?? []).map((d) => ({ value: d.id, label: d.name }))} />
          <SelectField
            label="Manager"
            allowClear
            value={manager}
            onChange={setManager}
            options={(people.data ?? []).filter((p) => p.is_active && p.role !== 'employee').map((p) => ({ value: p.id, label: p.full_name, sublabel: roleLabel[p.role] }))}
          />
        </Card>
        {(role === 'boss' || role === 'hr') && <Banner tone="info">This role must set up two-factor authentication at first sign-in.</Banner>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cred: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  credLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  credValue: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text, marginTop: 4 },
});
