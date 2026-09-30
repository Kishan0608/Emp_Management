import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Badge, Card, ChoiceChips, Divider, EmptyState, ListSkeleton, PageHeader, Screen } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { formatDateTime, type Tone } from '@/lib/format';
import { spacing, type } from '@/theme/tokens';

const GROUPS: { value: string; label: string; match: (a: string) => boolean }[] = [
  { value: 'all', label: 'All', match: () => true },
  { value: 'auth', label: 'Sign-ins', match: (a) => a.startsWith('auth.') },
  { value: 'access', label: 'Access changes', match: (a) => a.startsWith('visibility.') || a.startsWith('user.') || a.startsWith('settings.') },
];

function tone(action: string): Tone {
  if (action.startsWith('visibility') || action.startsWith('user') || action.startsWith('settings')) return 'brand';
  if (action.startsWith('auth')) return 'info';
  return 'neutral';
}

export default function Audit() {
  const logs = useLoad(() => api.auditLogs(300));
  const [group, setGroup] = useState('all');
  const list = useMemo(() => (logs.data ?? []).filter((l) => GROUPS.find((g) => g.value === group)!.match(l.action)), [logs.data, group]);

  return (
    <Screen refreshing={logs.refreshing} onRefresh={logs.refresh} header={<PageHeader title="Audit log" subtitle="Read-only · kept per retention setting" />}>
      <View style={{ gap: spacing.md }}>
        <ChoiceChips options={GROUPS.map(({ value, label }) => ({ value, label }))} value={group} onChange={setGroup} />
        {logs.loading ? (
          <ListSkeleton rows={6} />
        ) : list.length === 0 ? (
          <Card>
            <EmptyState icon="receipt-outline" title="No entries" />
          </Card>
        ) : (
          <Card padded={false}>
            {list.map((l, i) => (
              <View key={l.id}>
                {i > 0 && <Divider inset={16} />}
                <View style={{ padding: spacing.md, paddingHorizontal: spacing.lg, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Badge label={l.action} tone={tone(l.action)} />
                    <Text style={[type.small, { marginLeft: 'auto' }]}>{formatDateTime(l.created_at)}</Text>
                  </View>
                  <Text style={type.bodyMedium}>{l.actor?.full_name ?? 'System'}</Text>
                  {Object.keys(l.meta ?? {}).length > 0 && (
                    <Text style={[type.small, { fontSize: 12 }]} numberOfLines={3}>
                      {JSON.stringify(l.meta)}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}
