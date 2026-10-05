import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Banner, Card, ChoiceChips, Divider, ListSkeleton, PageHeader, Screen, SectionTitle, Segmented, SelectField, SwitchRow } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { fieldLabel, roleLabel } from '@/lib/format';
import type { Role, VisibilityField } from '@/lib/types';
import { useToast } from '@/providers/ToastProvider';
import { useOrganization } from '@/providers/OrganizationProvider';
import { colors, spacing, type } from '@/theme/tokens';

const FIELDS = Object.keys(fieldLabel) as VisibilityField[];
const FIELD_HELP: Record<VisibilityField, string> = {
  contact: 'Phone, personal email, address, joining date',
  salary: 'Monthly salary',
  attendance: 'Attendance percentage',
  task_history: 'Task stats and timeline (manager always sees own team’s tasks)',
  performance: 'Performance rating',
};

type Override = 'inherit' | 'allow' | 'deny';

export default function Visibility() {
  const toast = useToast();
  const { selectedOrgId } = useOrganization();
  const rules = useLoad(() => api.visibilityRules());
  const people = useLoad(() => api.directory(selectedOrgId), [selectedOrgId]);
  const [mode, setMode] = useState<'role' | 'person'>('role');
  const [role, setRole] = useState<Exclude<Role, 'boss'>>('hr');
  const [person, setPerson] = useState<string | null>(null);

  const roleRule = (r: Role, f: VisibilityField) => rules.data?.find((x) => x.viewer_role === r && x.field_name === f)?.allowed ?? false;
  const personRule = (id: string, f: VisibilityField): Override => {
    const r = rules.data?.find((x) => x.viewer_id === id && x.field_name === f);
    return r ? (r.allowed ? 'allow' : 'deny') : 'inherit';
  };
  const selected = useMemo(() => people.data?.find((p) => p.id === person), [people.data, person]);

  const setRoleField = async (f: VisibilityField, allowed: boolean) => {
    try {
      await api.setVisibility({ role }, f, allowed);
      toast(`${roleLabel[role]} · ${fieldLabel[f]}: ${allowed ? 'visible' : 'hidden'}`);
      rules.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const setPersonField = async (f: VisibilityField, v: Override) => {
    if (!person) return;
    try {
      if (v === 'inherit') await api.clearPersonVisibility(person, f);
      else await api.setVisibility({ id: person }, f, v === 'allow');
      toast('Saved');
      rules.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <Screen refreshing={rules.refreshing} onRefresh={rules.refresh} header={<PageHeader title="Visibility settings" subtitle="Who can see which employee details" />}>
      <View style={{ gap: spacing.md }}>
        <Banner tone="info" title="Default is hidden">
          People always see their own details. You (Boss) see everything. Everyone else sees a field only if you allow it here. A rule for a person overrides the rule for their role. Every change is logged.
        </Banner>
        <Segmented
          options={[
            { value: 'role', label: 'By role' },
            { value: 'person', label: 'By person' },
          ]}
          value={mode}
          onChange={setMode}
        />

        {rules.loading ? (
          <ListSkeleton rows={3} />
        ) : mode === 'role' ? (
          <>
            <ChoiceChips
              options={(['hr', 'manager', 'employee'] as const).map((r) => ({ value: r, label: roleLabel[r] }))}
              value={role}
              onChange={setRole}
            />
            <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
              {FIELDS.map((f, i) => (
                <View key={f}>
                  {i > 0 && <Divider />}
                  <SwitchRow label={fieldLabel[f]} description={FIELD_HELP[f]} value={roleRule(role, f)} onChange={(v) => setRoleField(f, v)} />
                </View>
              ))}
            </Card>
          </>
        ) : (
          <>
            <SelectField
              label="Person"
              icon="person-outline"
              value={person}
              onChange={setPerson}
              options={(people.data ?? []).filter((p) => p.is_active && p.role !== 'boss').map((p) => ({ value: p.id, label: p.full_name, sublabel: roleLabel[p.role] }))}
            />
            {selected && (
              <>
                <SectionTitle title={`Overrides for ${selected.full_name.split(' ')[0]}`} />
                {FIELDS.map((f) => {
                  const current = personRule(selected.id, f);
                  const inherited = roleRule(selected.role, f);
                  return (
                    <Card key={f} style={{ gap: spacing.sm }}>
                      <Text style={type.bodyMedium}>{fieldLabel[f]}</Text>
                      <Text style={type.small}>
                        {`${roleLabel[selected.role]} default: `}
                        <Text style={{ color: inherited ? colors.success : colors.textMuted }}>{inherited ? 'visible' : 'hidden'}</Text>
                      </Text>
                      <ChoiceChips
                        value={current}
                        onChange={(v) => setPersonField(f, v)}
                        options={[
                          { value: 'inherit', label: 'Use role default' },
                          { value: 'allow', label: 'Allow', tint: colors.success },
                          { value: 'deny', label: 'Deny', tint: colors.danger },
                        ]}
                      />
                    </Card>
                  );
                })}
              </>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

