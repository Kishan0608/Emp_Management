import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { TaskCard } from '@/components/cards';
import { CountTiles, leadsTeam, PeopleGroup, pendingOf } from '@/components/TaskPeople';
import { Banner, Card, ChoiceChips, EmptyState, HeaderAddButton, HeroHeader, ListSkeleton, Screen } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { isTaskDone, sortTasks } from '@/lib/format';
import type { TaskTeam } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, gradients, radius, shadow, spacing } from '@/theme/tokens';

type Scope = 'mine' | 'assigned' | 'team';
type Filter = 'all' | 'active' | 'done';

export default function Tasks() {
  const { me, isEmployee, isBoss } = useMe();
  const toast = useToast();
  const params = useLocalSearchParams<{ scope?: Scope }>();
  const [scope, setScope] = useState<Scope>(isEmployee ? 'mine' : (params.scope ?? 'mine'));
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  // Follow deep links like /tasks?scope=review without an effect.
  const [lastParam, setLastParam] = useState(params.scope);
  if (params.scope !== lastParam) {
    setLastParam(params.scope);
    if (params.scope) setScope(isEmployee ? 'mine' : params.scope);
  }

  const people = scope === 'team' && !isEmployee;
  const { data, loading, refreshing, refresh, error } = useLoad(
    () => (people ? Promise.resolve([]) : api.tasks(isEmployee ? 'mine' : scope, me.id)),
    [scope, isEmployee]
  );
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

  const scopes: {
    value: Scope;
    label: string;
    sublabel: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
  }[] = isEmployee
    ? []
    : [
        {
          value: 'mine',
          label: 'Mine',
          sublabel: 'Tasks assigned to you',
          icon: 'person-outline',
          color: colors.brand,
        },
        {
          value: 'assigned',
          label: 'Assigned',
          sublabel: 'Tasks you delegated to others',
          icon: 'paper-plane-outline',
          color: colors.info,
        },
        {
          value: 'team',
          label: isBoss ? 'All People' : 'My Team',
          sublabel: isBoss ? 'All company employees' : 'Your direct team members',
          icon: 'people-outline',
          color: colors.warning,
        },
      ];

  const searchPlaceholder = isEmployee
    ? 'Search my tasks…'
    : scope === 'team'
      ? 'Search team members…'
      : scope === 'assigned'
        ? 'Search assigned tasks…'
        : 'Search my tasks…';

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
            right={
              !isEmployee ? (
                <HeaderAddButton label="New task" icon="add" onPress={() => router.push('/task/new')} />
              ) : undefined
            }
          />
        }>
        <View style={{ gap: spacing.md }}>
          {/* SEARCH & FILTER ROW */}
          <View style={{ position: 'relative', zIndex: 20 }}>
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={searchPlaceholder}
                  placeholderTextColor={colors.textMuted}
                  value={q}
                  onChangeText={setQ}
                  onFocus={() => setFilterOpen(false)}
                  autoCorrect={false}
                />
                {q.length > 0 && (
                  <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Clear search">
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>

              {!isEmployee && (
                <Pressable
                  onPress={() => setFilterOpen((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel="Filter scope"
                  style={({ pressed }) => [
                    styles.filterIconBtn,
                    filterOpen && styles.filterIconBtnActive,
                    pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] },
                  ]}>
                  <Ionicons
                    name={filterOpen ? 'funnel' : 'funnel-outline'}
                    size={18}
                    color={filterOpen ? colors.brand : colors.text}
                  />
                  {scope !== 'mine' && <View style={styles.filterActiveDot} />}
                </Pressable>
              )}
            </View>

            {/* ATTACHED SCOPE DROPDOWN LIST */}
            {filterOpen && !isEmployee && (
              <View style={styles.filterDropdown}>
                {scopes.map((s, idx) => {
                  const active = s.value === scope;
                  return (
                    <Pressable
                      key={s.value}
                      onPress={() => {
                        setScope(s.value);
                        setFilterOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.filterOption,
                        active && styles.filterOptionActive,
                        pressed && styles.filterOptionPressed,
                        idx < scopes.length - 1 && styles.filterOptionBorder,
                      ]}>
                      <View style={[styles.filterOptionIcon, { backgroundColor: active ? s.color + '20' : colors.surfaceAlt }]}>
                        <Ionicons name={s.icon} size={18} color={active ? s.color : colors.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.filterOptionTitle, active && { color: s.color, fontFamily: fonts.bold }]}>
                          {s.label}
                        </Text>
                        <Text style={styles.filterOptionSubtitle}>{s.sublabel}</Text>
                      </View>
                      {active && <Ionicons name="checkmark-circle" size={18} color={s.color} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* STATUS FILTER CHIPS (All / Active / Completed) */}
          {scope !== 'team' && (
            <ChoiceChips
              options={[
                { value: 'all', label: 'All' },
                { value: 'active', label: 'Active' },
                { value: 'done', label: 'Completed' },
              ]}
              value={filter}
              onChange={setFilter}
            />
          )}

          {/* TEAM VIEW OR TASK LIST */}
          {people ? (
            <TeamView team={team.data} loading={team.loading} error={team.error} q={q} isBoss={isBoss} />
          ) : (
            <>
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
    </View>
  );
}

/** Boss: managers & HR first, then anyone reporting straight to the Boss. Managers / HR: their own team. */
function TeamView({ team, loading, error, q, isBoss }: { team: TaskTeam | null; loading: boolean; error: string | null; q: string; isBoss: boolean }) {
  const term = q.trim().toLowerCase();
  const all = team?.members ?? [];
  const members = all.filter((m) => !term || `${m.full_name} ${m.job_title ?? ''}`.toLowerCase().includes(term));
  const leaders = members.filter((m) => m.role === 'manager' || m.role === 'hr');
  const others = members.filter((m) => m.role !== 'manager' && m.role !== 'hr');
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

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14.5,
    color: colors.text,
    paddingVertical: 0,
  },
  filterIconBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterIconBtnActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  filterActiveDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  filterDropdown: {
    marginTop: 6,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadow.md,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  filterOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterOptionActive: {
    backgroundColor: colors.brandSoft,
  },
  filterOptionPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  filterOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterOptionTitle: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text,
  },
  filterOptionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
