import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar, Badge, Banner, Card, Divider, EmptyState, ListRow, ListSkeleton, PageHeader, Screen, Segmented, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { roleLabel } from '@/lib/format';
import type { Role } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useOrganization } from '@/providers/OrganizationProvider';
import { colors, spacing } from '@/theme/tokens';

export default function People() {
  const { isBoss } = useMe();
  const { selectedOrg, selectedOrgId } = useOrganization();
  const people = useLoad(() => api.directory(isBoss ? selectedOrgId : null), [selectedOrgId]);
  const depts = useLoad(() => api.departments(isBoss ? selectedOrgId : null), [selectedOrgId]);
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | 'all'>('all');

  const deptName = useMemo(() => new Map((depts.data ?? []).map((d) => [d.id, d.name])), [depts.data]);
  const counts = useMemo(() => {
    const c = { all: 0, boss: 0, hr: 0, manager: 0, employee: 0 };
    for (const p of people.data ?? []) {
      if (!isBoss && p.is_active === false) continue;
      c.all++;
      if (p.role && c[p.role] !== undefined) {
        c[p.role]++;
      }
    }
    return c;
  }, [people.data, isBoss]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (people.data ?? []).filter(
      (p) =>
        (isBoss || p.is_active !== false) &&
        (role === 'all' || p.role === role) &&
        (!term ||
          p.full_name.toLowerCase().includes(term) ||
          (p.job_title ?? '').toLowerCase().includes(term) ||
          (p.email ?? '').toLowerCase().includes(term) ||
          (p.department ?? '').toLowerCase().includes(term) ||
          (p.department_id ? (deptName.get(p.department_id) ?? '').toLowerCase().includes(term) : false)),
    );
  }, [people.data, q, role, isBoss, deptName]);

  const handleRefresh = () => {
    people.refresh();
    depts.refresh();
  };

  return (
    <Screen
      refreshing={people.refreshing}
      onRefresh={handleRefresh}
      header={
        <PageHeader
          title="People"
          subtitle={
            people.loading
              ? 'Loading…'
              : selectedOrg
                ? `${selectedOrg.name} · ${list.length} ${list.length === 1 ? 'person' : 'people'}`
                : `${list.length} ${list.length === 1 ? 'person' : 'people'}`
          }
        />
      }>
      <View style={{ gap: spacing.md }}>
        <TextField
          icon="search"
          placeholder="Search by name, title or email"
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
          right={
            q.length > 0 ? (
              <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            ) : undefined
          }
        />
        <Segmented
          scroll
          value={role}
          onChange={setRole}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'boss', label: 'Boss', count: counts.boss },
            { value: 'hr', label: 'HR', count: counts.hr },
            { value: 'manager', label: 'Managers', count: counts.manager },
            { value: 'employee', label: 'Employees', count: counts.employee },
          ]}
        />

        {people.error && <Banner tone="danger">{people.error}</Banner>}

        {people.loading ? (
          <ListSkeleton rows={6} />
        ) : list.length === 0 ? (
          <Card>
            <EmptyState
              icon={q ? 'search' : 'people-outline'}
              title={q ? 'No matching people found' : 'No one found'}
              body={q ? `No one matches "${q}". Try another name or title.` : 'No employees found in this category.'}
            />
          </Card>
        ) : (
          <Card padded={false}>
            {list.map((p, i) => {
              const dept = p.department || (p.department_id ? deptName.get(p.department_id) : null);
              return (
                <View key={p.id}>
                  {i > 0 && <Divider inset={68} />}
                  <ListRow
                    onPress={() => router.push(`/people/${p.id}`)}
                    left={<Avatar name={p.full_name} id={p.id} size={40} />}
                    title={p.full_name}
                    subtitle={[p.job_title, dept].filter(Boolean).join(' · ') || p.email}
                    right={
                      p.is_active !== false ? (
                        <Badge label={roleLabel[p.role]} tone={p.role === 'boss' ? 'brand' : p.role === 'hr' ? 'info' : 'neutral'} />
                      ) : (
                        <Badge label="Inactive" tone="danger" />
                      )
                    }
                  />
                </View>
              );
            })}
          </Card>
        )}
      </View>
    </Screen>
  );
}
