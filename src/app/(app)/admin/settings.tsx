import { useState } from 'react';
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
  { key: 'min_group_size', label: 'Small-team warning below', hint: 'Warn about anonymous feedback in small teams' },
  { key: 'blocker_hr_hours', label: 'Escalate blockers to HR after (hours)', hint: '' },
  { key: 'blocker_boss_hours', label: 'Escalate blockers to Boss after (hours)', hint: '' },
  { key: 'retention_audit_days', label: 'Keep audit logs for (days)', hint: '' },
];

export default function Settings() {
  const { settings } = useMe();
  const { refresh } = useAuth();
  const toast = useToast();
  const depts = useLoad(() => api.departments());
  const orgs = useLoad(() => api.allOrganizations());
  const [name, setName] = useState(settings.company_name);
  const [nums, setNums] = useState<Record<NumKey, string>>(() => Object.fromEntries(NUMBERS.map((n) => [n.key, String(settings[n.key])])) as Record<NumKey, string>);
  const [mfa, setMfa] = useState(settings.require_mfa_admins);
  const [newDept, setNewDept] = useState('');
  const [newOrg, setNewOrg] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const patch: Partial<AppSettings> = { company_name: name.trim(), require_mfa_admins: mfa };
    for (const n of NUMBERS) {
      const v = Number(nums[n.key]);
      if (!Number.isInteger(v) || v < 1) return toast(`${n.label}: enter a whole number above 0`, 'error');
      (patch as Record<string, number>)[n.key] = v;
    }
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
          <TextField label="Default Company / App Name" value={name} onChangeText={setName} />
        </Card>

        {/* Organizations & Companies */}
        <SectionTitle title="Organizations & Companies" />
        <Card padded={false}>
          {(orgs.data ?? []).map((o, i) => (
            <View key={o.id}>
              {i > 0 && <Divider inset={16} />}
              <ListRow
                title={o.name}
                subtitle={o.is_active ? 'Active company' : 'Inactive'}
              />
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <TextField placeholder="Add new company name" value={newOrg} onChangeText={setNewOrg} />
            </View>
            <Button
              title="Add"
              variant="secondary"
              disabled={newOrg.trim().length < 2}
              onPress={async () => {
                try {
                  await api.createOrganization(newOrg);
                  setNewOrg('');
                  orgs.reload();
                  toast('Company added');
                } catch (e) {
                  toast(errorMessage(e), 'error');
                }
              }}
            />
          </View>
        </Card>

        <SectionTitle title="Feedback & escalation" />
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
          {!mfa && <Banner tone="danger">Turning this off weakens protection of salary and personal data.</Banner>}
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
