import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { TaskCard } from '@/components/cards';
import { CountTiles, leadsTeam, PeopleGroup, pendingOf } from '@/components/TaskPeople';
import { Banner, Card, ChoiceChips, EmptyState, Fab, HeroHeader, IconButton, ListSkeleton, Screen, Segmented, TextField } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { toCsv, shareCsv } from '@/lib/csv';
import { isTaskDone, sortTasks, taskStatusLabel, toDateOnly } from '@/lib/format';
import type { TaskTeam } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, gradients, spacing } from '@/theme/tokens';

type Scope = 'mine' | 'assigned' | 'team';
type Filter = 'active' | 'done' | 'all';

export default function Tasks() {
  const { me, isEmployee, isBoss } = useMe();
  const toast = useToast();
  const params = useLocalSearchParams<{ scope?: Scope }>();
  const [scope, setScope] = useState<Scope>(isEmployee ? 'mine' : (params.scope ?? 'mine'));
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  // Follow deep links like /tasks?scope=review without an effect.
  const [lastParam, setLastParam] = useState(params.scope);
  if (params.scope !== lastParam) {
    setLastParam(params.scope);
    if (params.scope) setScope(isEmployee ? 'mine' : params.scope);
  }

  const people = scope === 'team' && !isEmployee;
  const { data, loading, refreshing, refresh, error } = useLoad(() => (people ? Promise.resolve([]) : api.tasks(isEmployee ? 'mine' : scope, me.id)), [scope, isEmployee]);
  const team = useLoad(() => (people ? api.taskTeam() : Promise.resolve(null)), [people]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return sortTasks(data ?? []).filter((t) => {
      const done = isTaskDone(t.status);
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
        refreshing={people ? team.refreshing : refreshing}
        onRefresh={people ? team.refresh : refresh}
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
          {people ? (
            <TeamView team={team.data} loading={team.loading} error={team.error} q={q} setQ={setQ} isBoss={isBoss} />
          ) : (
          <>
          <TextField icon="search" placeholder={isEmployee ? 'Search my tasks' : 'Search tasks or people'} value={q} onChangeText={setQ} autoCorrect={false} />
          <ChoiceChips
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'done', label: 'Completed' },
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
                title="No tasks here"
                body={scope === 'mine' ? 'Tasks assigned to you will appear here. You can also add personal to-dos.' : 'Try another filter.'}
              />
            </Card>
          ) : (
            list.map((t, i) => <TaskCard key={t.id} task={t} index={i} showAssignee={scope !== 'mine'} />)
          )}
          </>
          )}
        </View>
      </Screen>
      {!isEmployee && <Fab label="New task" onPress={() => router.push('/task/new')} />}
    </View>
  );
}

/** Boss: managers & HR first, then anyone reporting straight to the Boss. Managers / HR: their own team. */
function TeamView({ team, loading, error, q, setQ, isBoss }: { team: TaskTeam | null; loading: boolean; error: string | null; q: string; setQ: (v: string) => void; isBoss: boolean }) {
  const term = q.trim().toLowerCase();
  const members = (team?.members ?? []).filter((m) => !term || `${m.full_name} ${m.job_title ?? ''}`.toLowerCase().includes(term));
  const leaders = members.filter((m) => m.role === 'manager' || m.role === 'hr');
  const others = members.filter((m) => m.role !== 'manager' && m.role !== 'hr');
  const all = team?.members ?? [];
  const pending = all.reduce((n, m) => n + pendingOf(m), 0);
  const total = all.reduce((n, m) => n + m.total + (leadsTeam(m) ? m.team_pending : 0), 0);
  const done = all.reduce((n, m) => n + m.done, 0);
  const overdue = all.reduce((n, m) => n + m.overdue, 0);

  return (
    <>
      {error && <Banner tone="danger">{error}</Banner>}
      {loading || !team ? (
        <ListSkeleton rows={4} />
      ) : all.length === 0 ? (
        <Card>
          <EmptyState icon="people-outline" title={isBoss ? 'No managers or HR yet' : 'No one reports to you yet'} body="People appear here once their manager is set." />
        </Card>
      ) : (
        <>
          <Card style={{ gap: spacing.sm }}>
            <CountTiles total={total} pending={pending} done={done} overdue={overdue} />
          </Card>
          {all.length > 5 && <TextField icon="search" placeholder="Search people" value={q} onChangeText={setQ} autoCorrect={false} />}
          {team.is_top ? (
            <>
              <PeopleGroup title="Managers & HR" members={leaders} />
              <PeopleGroup title="Other employees" members={others} offset={leaders.length} />
            </>
          ) : (
            <PeopleGroup title="Your team" members={[...leaders, ...others]} />
          )}
          {members.length === 0 && <EmptyState icon="search" title="No one found" body="Try another name." />}
        </>
      )}
    </>
  );
}
