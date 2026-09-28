import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Banner, Button, Card, Divider, ListRow, PageHeader, Screen, SectionTitle, SwitchRow, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import type { AppSettings } from '@/lib/types';
import { useAuth, useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/tokens';

type NumKey = Exclude<keyof AppSettings, 'company_name' | 'require_mfa_admins'>;

const NUMBERS: { key: NumKey; label: string; hint: string }[] = [
  { key: 'yellow_threshold', label: 'Yellow flag at', hint: 'Different people complaining within the window' },
  { key: 'red_threshold', label: 'Red flag at', hint: 'Unlocks opening a disciplinary case' },
  { key: 'window_days', label: 'Counting window (days)', hint: 'Complaints older than this stop counting' },
  { key: 'monthly_complaint_quota', label: 'Complaints per person per month', hint: 'Limits misuse' },
  { key: 'min_group_size', label: 'Small-team warning below', hint: 'Warn about anonymity in small teams' },
  { key: 'blocker_hr_hours', label: 'Escalate blockers to HR after (hours)', hint: '' },
  { key: 'blocker_boss_hours', label: 'Escalate blockers to Boss after (hours)', hint: '' },
  { key: 'session_timeout_minutes', label: 'Sign out after inactivity (minutes)', hint: '' },
  { key: 'retention_complaint_days', label: 'Keep complaints for (days)', hint: 'Then deleted automatically' },
  { key: 'retention_audit_days', label: 'Keep audit logs for (days)', hint: '' },
];

export default function Settings() {
  const { settings } = useMe();
  const { refresh } = useAuth();
  const toast = useToast();
  const depts = useLoad(() => api.departments());
  const [name, setName] = useState(settings.company_name);
  const [nums, setNums] = useState<Record<NumKey, string>>(() => Object.fromEntries(NUMBERS.map((n) => [n.key, String(settings[n.key])])) as Record<NumKey, string>);
  const [mfa, setMfa] = useState(settings.require_mfa_admins);
  const [newDept, setNewDept] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMfa(settings.require_mfa_admins);
  }, [settings.require_mfa_admins]);

  const save = async () => {
    const patch: Partial<AppSettings> = { company_name: name.trim(), require_mfa_admins: mfa };
    for (const n of NUMBERS) {
      const v = Number(nums[n.key]);
      if (!Number.isInteger(v) || v < 1) return toast(`${n.label}: enter a whole number above 0`, 'error');
      (patch as Record<string, number>)[n.key] = v;
    }
    if ((patch.red_threshold ?? 0) <= (patch.yellow_threshold ?? 0)) return toast('Red must be higher than yellow', 'error');
    setBusy(true);
    try {
      await api.updateSettings(patch);
      toast('Settings saved');
      await refresh();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboard header={<PageHeader title="Company settings" />} footer={<Button title="Save settings" size="lg" loading={busy} onPress={save} />}>
      <View style={{ gap: spacing.md }}>
        <Card>
          <TextField label="Company name" value={name} onChangeText={setName} />
        </Card>

        <SectionTitle title="Complaints & escalation" />
        <Card style={{ gap: spacing.lg }}>
          {NUMBERS.map((n) => (
            <TextField
              key={n.key}
              label={n.label}
              hint={n.hint || undefined}
              value={nums[n.key]}
              onChangeText={(t) => setNums({ ...nums, [n.key]: t.replace(/\D/g, '') })}
              keyboardType="number-pad"
            />
          ))}
        </Card>

        <SectionTitle title="Security" />
        <Card>
          <SwitchRow label="Require two-factor for Boss and HR" description="Strongly recommended. Their actions are refused without it." value={mfa} onChange={setMfa} />
          {!mfa && <Banner tone="danger">Turning this off weakens protection of salary and complaint data.</Banner>}
        </Card>

        <SectionTitle title="Departments" />
        <Card padded={false}>
          {(depts.data ?? []).map((d, i) => (
            <View key={d.id}>
              {i > 0 && <Divider inset={16} />}
              <ListRow title={d.name} />
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <TextField placeholder="New department" value={newDept} onChangeText={setNewDept} />
            </View>
            <Button
              title="Add"
              variant="secondary"
              disabled={newDept.trim().length < 2}
              onPress={async () => {
                try {
                  await api.createDepartment(newDept);
                  setNewDept('');
                  depts.reload();
                  toast('Department added');
                } catch (e) {
                  toast(errorMessage(e), 'error');
                }
              }}
            />
          </View>
        </Card>
      </View>
    </Screen>
  );
}
