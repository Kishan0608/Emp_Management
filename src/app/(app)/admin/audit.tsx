import { useState } from 'react';
import { Text, View } from 'react-native';

import { Badge, Card, ChoiceChips, Divider, EmptyState, ListSkeleton, PageHeader, PAGE_SIZE, Pagination, Screen } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { formatDateTime, type Tone } from '@/lib/format';
import { spacing, type } from '@/theme/tokens';

type Group = 'all' | 'auth' | 'access';
const GROUPS: { value: Group; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'auth', label: 'Sign-ins' },
  { value: 'access', label: 'Access changes' },
];

function tone(action: string): Tone {
  if (action.startsWith('visibility') || action.startsWith('user') || action.startsWith('settings')) return 'brand';
  if (action.startsWith('auth')) return 'info';
  return 'neutral';
}

export default function Audit() {
  const [group, setGroup] = useState<Group>('all');
  const [page, setPage] = useState(0);
  // 20 at a time from the server; the filter runs there too.
  const logs = useLoad(() => api.auditPage(group, page * PAGE_SIZE), [group, page]);
  const list = logs.data?.rows ?? [];

  return (
    <Screen refreshing={logs.refreshing} onRefresh={logs.refresh} header={<PageHeader title="Audit log" subtitle="Read-only · kept per retention setting" />}>
      <View style={{ gap: spacing.md }}>
        <ChoiceChips
          options={GROUPS}
          value={group}
          onChange={(g) => {
            setGroup(g);
            setPage(0);
          }}
        />
        {logs.loading && !logs.data ? (
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
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
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
        <Pagination page={page} total={logs.data?.total ?? 0} onChange={setPage} busy={logs.loading} />
      </View>
    </Screen>
  );
}
