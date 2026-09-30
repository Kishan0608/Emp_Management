import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { TaskCard } from '@/components/cards';
import { Banner, Card, ChoiceChips, EmptyState, Fab, HeroHeader, IconButton, ListSkeleton, Screen, Segmented, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { toCsv, shareCsv } from '@/lib/csv';
import { taskStatusLabel, toDateOnly } from '@/lib/format';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, gradients, spacing } from '@/theme/tokens';

type Scope = 'mine' | 'assigned' | 'review' | 'team';
type Filter = 'active' | 'done' | 'all';

export default function Tasks() {
  const { me, isEmployee, isBoss } = useMe();
  const toast = useToast();
  const params = useLocalSearchParams<{ scope?: Scope }>();
  const [scope, setScope] = useState<Scope>(isEmployee ? 'mine' : (params.scope ?? 'mine'));
  const [filter, setFilter] = useState<Filter>('active');
  const [q, setQ] = useState('');

  // Follow deep links like /tasks?scope=review without an effect.
  const [lastParam, setLastParam] = useState(params.scope);
  if (params.scope !== lastParam) {
    setLastParam(params.scope);
    if (params.scope) setScope(isEmployee ? 'mine' : params.scope);
  }

  const { data, loading, refreshing, refresh, error } = useLoad(() => api.tasks(isEmployee ? 'mine' : scope, me.id), [scope, isEmployee]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((t) => {
      const done = t.status === 'approved' || t.status === 'closed';
      if (filter === 'active' && done) return false;
      if (filter === 'done' && !done) return false;
      return !term || t.title.toLowerCase().includes(term) || t.assignee?.full_name.toLowerCase().includes(term);
    });
  }, [data, filter, q]);

  const scopes = isEmployee
    ? []
    : [
        { value: 'mine' as const, label: 'Mine' },
        { value: 'assigned' as const, label: 'Assigned' },
        { value: 'review' as const, label: 'Review' },
        { value: 'team' as const, label: isBoss ? 'All People' : 'My Team' },
      ];

  const exportCsv = async () => {
    try {
      const rows = list.map((t) => ({
        title: t.title,
        status: taskStatusLabel[t.status],
        priority: t.priority,
        assignee: t.assignee?.full_name,
        assigned_by: t.creator?.full_name,
        reviewer: t.reviewer?.full_name,
        due_date: t.due_date,
        created_at: t.created_at,
        approved_at: t.approved_at,
      }));
      await shareCsv(
        `tasks-${scope}-${toDateOnly(new Date())}.csv`,
        toCsv(rows, [
          { key: 'title', label: 'Title' },
          { key: 'status', label: 'Status' },
          { key: 'priority', label: 'Priority' },
          { key: 'assignee', label: 'Assignee' },
          { key: 'assigned_by', label: 'Assigned by' },
          { key: 'reviewer', label: 'Reviewer' },
          { key: 'due_date', label: 'Due date' },
          { key: 'created_at', label: 'Created' },
          { key: 'approved_at', label: 'Approved' },
        ]),
      );
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen
        refreshing={refreshing}
        onRefresh={refresh}
        header={
          <HeroHeader
            title="Tasks"
            subtitle={isEmployee ? 'Tasks assigned to you' : isBoss ? 'All company tasks' : 'Team tasks & reviews'}
            colorsOverride={gradients.task}
            right={<IconButton icon="download-outline" label="Export CSV" color={colors.white} bg="rgba(255,255,255,0.18)" onPress={exportCsv} />}
          />
        }>
        <View style={{ gap: spacing.md }}>
          {!isEmployee && <Segmented options={scopes} value={scope} onChange={setScope} />}
          <TextField icon="search" placeholder={isEmployee ? 'Search my tasks' : 'Search tasks or people'} value={q} onChangeText={setQ} autoCorrect={false} />
          <ChoiceChips
            options={[
              { value: 'active', label: 'Active' },
              { value: 'done', label: 'Completed' },
              { value: 'all', label: 'All' },
            ]}
            value={filter}
            onChange={setFilter}
          />
          {error && <Banner tone="danger">{error}</Banner>}
          {loading ? (
            <ListSkeleton rows={4} />
          ) : list.length === 0 ? (
            <Card>
              <EmptyState
                icon="checkbox-outline"
                title={scope === 'review' ? 'Nothing to review' : 'No tasks here'}
                body={scope === 'mine' ? 'Tasks assigned to you will appear here. You can also add personal to-dos.' : 'Try another filter.'}
              />
            </Card>
          ) : (
            list.map((t, i) => <TaskCard key={t.id} task={t} index={i} showAssignee={scope !== 'mine'} />)
          )}
        </View>
      </Screen>
      {!isEmployee && <Fab label="New task" onPress={() => router.push('/task/new')} />}
    </View>
  );
}
