import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TaskCard } from '@/components/cards';
import { PeopleGroup } from '@/components/TaskPeople';
import { Avatar, Banner, Card, ChoiceChips, EmptyState, ListSkeleton, PageHeader, Screen } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { isTaskDone, roleLabel, sortTasks } from '@/lib/format';
import type { Task } from '@/lib/types';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

type View_ = 'mine' | 'given' | 'team';
type Show = 'all' | 'active' | 'done';

const count = (list: Task[] | null) => {
  const l = list ?? [];
  const done = l.filter((t) => isTaskDone(t.status)).length;
  return { all: l.length, active: l.length - done, done };
};

/**
 * One person's work:
 *   1. who they are, and two cards — "their tasks" and "tasks they assigned"
 *   2. the chosen list, with All / Active / Completed and proper sorting
 *   3. their team (managers and HR only) — tap to go a level deeper
 */
export default function PersonTasks() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const team = useLoad(() => api.taskTeam(id), [id]);
  const tasks = useLoad(() => api.personTasks(id), [id]);
  const given = useLoad(() => api.tasksGivenBy(id), [id]);
  const [view, setView] = useState<View_>('mine');
  const [show, setShow] = useState<Show>('all');

  const p = team.data?.leader;
  // Employees never show a team, even if someone is set to report to them.
  const members = p?.role === 'employee' ? [] : (team.data?.members ?? []);
  const first = p?.full_name.split(' ')[0] ?? '';

  const mine = count(tasks.data);
  const gave = count(given.data);
  const hasGiven = gave.all > 0;
  const current = view === 'given' && hasGiven ? given : tasks;
  const c = view === 'given' && hasGiven ? gave : mine;

  const list = useMemo(
    () => sortTasks(current.data ?? []).filter((t) => (show === 'all' ? true : show === 'done' ? isTaskDone(t.status) : !isTaskDone(t.status))),
    [current.data, show],
  );
  const overdue = (tasks.data ?? []).filter((t) => !isTaskDone(t.status) && !!t.due_date && t.due_date < new Date().toISOString().slice(0, 10)).length;

  const choose = (v: View_) => {
    setView(v);
    setShow('all');
  };
  const refresh = () => {
    team.refresh();
    tasks.refresh();
    given.refresh();
  };

  return (
    <Screen
      refreshing={team.refreshing || tasks.refreshing || given.refreshing}
      onRefresh={refresh}
      header={<PageHeader title={p?.full_name ?? 'Tasks'} subtitle={p ? [roleLabel[p.role], p.job_title].filter(Boolean).join(' · ') : undefined} />}>
      <View style={{ gap: spacing.lg }}>
        {(team.error || tasks.error) && <Banner tone="danger">{team.error ?? tasks.error}</Banner>}

        {!p ? (
          <ListSkeleton rows={2} />
        ) : (
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Avatar name={p.full_name} id={p.id} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={type.h2} numberOfLines={1}>
                  {p.full_name}
                </Text>
                <Text style={type.small}>{members.length > 0 ? `Leads ${members.length} ${members.length === 1 ? 'person' : 'people'}` : hasGiven ? 'Choose which tasks to see' : 'Tasks assigned to them'}</Text>
              </View>
              {members.length > 0 && (
                <Pressable
                  onPress={() => choose(view === 'team' ? 'mine' : 'team')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: view === 'team' }}
                  accessibilityLabel={`${first}'s team, ${members.length} ${members.length === 1 ? 'person' : 'people'}`}
                  style={({ pressed }) => [styles.teamBtn, view === 'team' && styles.teamBtnOn, pressed && { opacity: 0.85 }]}>
                  <Ionicons name="people" size={20} color={view === 'team' ? colors.white : colors.brand} />
                  <View style={[styles.teamBadge, view === 'team' && { backgroundColor: colors.white }]}>
                    <Text style={[styles.teamBadgeText, view === 'team' && { color: colors.brand }]}>{members.length}</Text>
                  </View>
                </Pressable>
              )}
            </View>

            {hasGiven ? (
              <View style={styles.pickRow}>
                <PickCard
                  on={view === 'mine'}
                  icon="clipboard-outline"
                  title={`${first}'s tasks`}
                  value={mine.all}
                  sub={`${mine.active} active · ${mine.done} done`}
                  onPress={() => choose('mine')}
                />
                {hasGiven && (
                  <PickCard
                    on={view === 'given'}
                    icon="paper-plane-outline"
                    title={`Assigned by ${first}`}
                    value={gave.all}
                    sub={`${gave.active} active · ${gave.done} done`}
                    onPress={() => choose('given')}
                  />
                )}
              </View>
            ) : null}

            {overdue > 0 && (
              <View style={styles.lateBar}>
                <Ionicons name="alert-circle" size={15} color={colors.danger} />
                <Text style={styles.lateText}>
                  {`${overdue} of ${first}'s tasks ${overdue === 1 ? 'is' : 'are'} past the due date`}
                </Text>
              </View>
            )}
          </Card>
        )}

        {view === 'team' ? (
          <PeopleGroup title={`${first ? `${first}'s` : 'Their'} team`} members={members} />
        ) : (
        <>
        {/* the chosen list */}
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.listTitle}>{view === 'given' && hasGiven ? `Tasks ${first} assigned` : `${first ? `${first}'s` : 'Their'} tasks`}</Text>
          <ChoiceChips
            options={[
              { value: 'all', label: `All · ${c.all}` },
              { value: 'active', label: `Active · ${c.active}` },
              { value: 'done', label: `Completed · ${c.done}` },
            ]}
            value={show}
            onChange={setShow}
          />
        </View>
        {current.loading ? (
          <ListSkeleton rows={3} />
        ) : list.length === 0 ? (
          <Card>
            <EmptyState
              icon={show === 'done' ? 'checkmark-done-outline' : 'checkbox-outline'}
              title={show === 'active' ? 'Nothing active' : show === 'done' ? 'Nothing completed yet' : 'No tasks yet'}
              body={show === 'active' ? 'All caught up.' : 'Try another filter.'}
            />
          </Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {list.map((t, i) => (
              <TaskCard key={t.id} task={t} index={i} showAssignee={view === 'given'} />
            ))}
          </View>
        )}
        </>
        )}

        <Text style={[type.small, { color: colors.textMuted, textAlign: 'center' }]}>Personal to-dos are private and not counted.</Text>
      </View>
    </Screen>
  );
}

function PickCard({ on, icon, title, value, sub, onPress }: { on: boolean; icon: keyof typeof Ionicons.glyphMap; title: string; value: number; sub: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [styles.pick, on && styles.pickOn, pressed && { opacity: 0.88 }]}>
      <View style={styles.pickTop}>
        <View style={[styles.pickIcon, on && { backgroundColor: colors.brand }]}>
          <Ionicons name={icon} size={15} color={on ? colors.white : colors.brand} />
        </View>
        <Text style={[styles.pickValue, on && { color: colors.brand }]}>{value}</Text>
      </View>
      <Text style={[styles.pickTitle, on && { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.pickSub} numberOfLines={1}>
        {sub}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pickRow: { flexDirection: 'row', gap: spacing.sm },
  pick: { flex: 1, gap: 4, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  pickOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  pickTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  pickValue: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  pickTitle: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.textSecondary },
  pickSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  teamBtn: { width: 48, height: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandTint, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  teamBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  teamBadge: { position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.surface },
  teamBadgeText: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.white },
  listTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  lateBar: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  lateText: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.danger },
});
