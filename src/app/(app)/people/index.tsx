import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Avatar, Badge, Button, Card, ChoiceChips, Divider, EmptyState, ListRow, ListSkeleton, PageHeader, Screen, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { roleLabel } from '@/lib/format';
import type { Role } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { spacing } from '@/theme/tokens';

export default function People() {
  const { isBoss } = useMe();
  const people = useLoad(() => api.directory());
  const depts = useLoad(() => api.departments());
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | 'all'>('all');

  const deptName = useMemo(() => new Map((depts.data ?? []).map((d) => [d.id, d.name])), [depts.data]);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (people.data ?? []).filter(
      (p) =>
        (isBoss || p.is_active) &&
        (role === 'all' || p.role === role) &&
        (!term || p.full_name.toLowerCase().includes(term) || (p.job_title ?? '').toLowerCase().includes(term) || p.email.includes(term)),
    );
  }, [people.data, q, role, isBoss]);

  return (
    <Screen
      refreshing={people.refreshing}
      onRefresh={people.refresh}
      header={
        <PageHeader
          title="People"
          subtitle={`${list.length} ${list.length === 1 ? 'person' : 'people'}`}
          right={isBoss ? <Button title="Invite" size="sm" icon="person-add-outline" onPress={() => router.push('/people/invite')} /> : undefined}
        />
      }>
      <View style={{ gap: spacing.md }}>
        <TextField icon="search" placeholder="Search by name, title or email" value={q} onChangeText={setQ} autoCapitalize="none" />
        <ChoiceChips
          value={role}
          onChange={setRole}
          options={[
            { value: 'all', label: 'All' },
            { value: 'boss', label: 'Boss' },
            { value: 'hr', label: 'HR' },
            { value: 'manager', label: 'Managers' },
            { value: 'employee', label: 'Employees' },
          ]}
        />
        {people.loading ? (
          <ListSkeleton rows={6} />
        ) : list.length === 0 ? (
          <Card>
            <EmptyState icon="people-outline" title="No one found" />
          </Card>
        ) : (
          <Card padded={false}>
            {list.map((p, i) => (
              <View key={p.id}>
                {i > 0 && <Divider inset={68} />}
                <ListRow
                  onPress={() => router.push(`/people/${p.id}`)}
                  left={<Avatar name={p.full_name} id={p.id} size={40} />}
                  title={p.full_name}
                  subtitle={[p.job_title, p.department_id ? deptName.get(p.department_id) : null].filter(Boolean).join(' · ') || p.email}
                  right={p.is_active ? <Badge label={roleLabel[p.role]} tone={p.role === 'boss' ? 'brand' : p.role === 'hr' ? 'info' : 'neutral'} /> : <Badge label="Inactive" tone="danger" />}
                />
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}
