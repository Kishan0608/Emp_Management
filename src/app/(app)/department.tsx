import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TaskCard } from '@/components/cards';
import { Banner, ChoiceChips, EmptyState, ListSkeleton, PageHeader, Screen, StatCard } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { isTaskDone } from '@/lib/format';
import { useMe } from '@/providers/AuthProvider';
import { useOrganization } from '@/providers/OrganizationProvider';
import { colors, spacing } from '@/theme/tokens';

type Tab = 'all' | 'open' | 'overdue' | 'done';

/** Full page of one department's tasks, opened from the Tasks card on Home. Boss only. */
export default function DepartmentTasks() {
  const { name = '' } = useLocalSearchParams<{ name?: string }>();
  const { me, isBoss } = useMe();
  const { selectedOrgId } = useOrganization();
  const [tab, setTab] = useState<Tab>('all');

  const allTasks = useLoad(() => (isBoss ? api.tasks('all', me.id, selectedOrgId) : Promise.resolve([])), [isBoss, selectedOrgId]);
  const departments = useLoad(() => api.departments(selectedOrgId), [selectedOrgId]);
  const directory = useLoad(() => api.directory(selectedOrgId), [selectedOrgId]);

  const today = new Date().toISOString().slice(0, 10);

  // Same matching as the Home card counts: by department id, by the assignee's department, or by name in the description.
  const deptTasks = useMemo(() => {
    const target = name.trim().toLowerCase();
    const deptId = (departments.data ?? []).find((d) => d.name.trim().toLowerCase() === target)?.id;
    const userDept = new Map<string, string>();
    (directory.data ?? []).forEach((u) => {
      if (u.department_id) userDept.set(u.id, u.department_id);
    });
    return (allTasks.data ?? []).filter((t) => {
      const taskDeptId = t.assignee?.department_id || userDept.get(t.assignee_id);
      if (deptId && taskDeptId === deptId) return true;
      const assignee = (directory.data ?? []).find((u) => u.id === t.assignee_id);
      if (assignee?.department?.trim().toLowerCase() === target) return true;
      return !!t.description?.toLowerCase().includes(target);
    });
  }, [name, departments.data, allTasks.data, directory.data]);

  const counts = useMemo(() => {
    const done = deptTasks.filter((t) => isTaskDone(t.status)).length;
    const overdue = deptTasks.filter((t) => !isTaskDone(t.status) && !!t.due_date && t.due_date < today).length;
    return { total: deptTasks.length, done, open: deptTasks.length - done, overdue };
  }, [deptTasks, today]);

  const visible = useMemo(
    () =>
      deptTasks.filter((t) => {
        const done = isTaskDone(t.status);
        const overdue = !done && !!t.due_date && t.due_date < today;
        if (tab === 'done') return done;
        if (tab === 'overdue') return overdue;
        if (tab === 'open') return !done;
        return true;
      }),
    [deptTasks, tab, today]
  );

  const refreshing = allTasks.refreshing || departments.refreshing || directory.refreshing;
  const refresh = () => {
    allTasks.refresh();
    departments.refresh();
    directory.refresh();
  };

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={refresh}
      header={<PageHeader title={name || 'Department'} subtitle={`${counts.total} ${counts.total === 1 ? 'task' : 'tasks'}`} />}>
      {allTasks.error && <Banner tone="danger">{allTasks.error}</Banner>}

      {!isBoss ? (
        <EmptyState icon="lock-closed-outline" title="Access restricted" body="Only the Boss can view department tasks." />
      ) : allTasks.loading ? (
        <ListSkeleton rows={4} />
      ) : (
        <View style={{ gap: spacing.lg }}>
          <View style={styles.grid}>
            <StatCard label="Total" value={counts.total} icon="layers-outline" tint={colors.brand} soft={colors.brandSoft} />
            <StatCard label="Done" value={counts.done} icon="checkmark-done-outline" tint={colors.success} soft={colors.successSoft} />
            <StatCard label="Open" value={counts.open} icon="time-outline" tint={colors.info} soft={colors.infoSoft} />
            <StatCard label="Overdue" value={counts.overdue} icon="alarm-outline" tint={colors.danger} soft={colors.dangerSoft} />
          </View>

          <ChoiceChips
            options={[
              { value: 'all', label: 'All' },
              { value: 'open', label: 'Open' },
              { value: 'overdue', label: 'Overdue' },
              { value: 'done', label: 'Done' },
            ]}
            value={tab}
            onChange={setTab}
          />

          {visible.length === 0 ? (
            <EmptyState
              icon="checkbox-outline"
              title="No tasks here"
              body={counts.total === 0 ? `No tasks are assigned to ${name} yet.` : `No tasks match the "${tab}" filter.`}
            />
          ) : (
            visible.map((t, i) => <TaskCard key={t.id} task={t} index={i} showAssignee />)
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
