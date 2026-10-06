import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';

import { HOLIDAY_COLOR, HOLIDAY_SOFT } from '@/components/attendance';
import { DateInput } from '@/components/DateInput';
import { Banner, Button, Card, ChoiceChips, EmptyState, ListSkeleton, PageHeader, Screen, SelectField, Sheet, TextField, type IconName } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { dayKey, holidayKindLabel } from '@/lib/format';
import type { Holiday, HolidayKind } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useOrganization } from '@/providers/OrganizationProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

const KINDS: { value: HolidayKind; label: string; icon: IconName; tint: string }[] = [
  { value: 'festival', label: 'Festival', icon: 'sparkles-outline', tint: HOLIDAY_COLOR },
  { value: 'national', label: 'National', icon: 'flag-outline', tint: colors.info },
  { value: 'company', label: 'Company', icon: 'business-outline', tint: colors.brand },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle-outline', tint: colors.textSecondary },
];
const ALL = '__all';

/** Consecutive days with the same name and company shown as one entry ("Diwali · 31 Oct – 2 Nov"). */
interface HolidayGroup {
  key: string;
  name: string;
  kind: HolidayKind;
  organization_id: string | null;
  organization: string | null;
  from: string;
  to: string;
  ids: string[];
}

function groupHolidays(list: Holiday[]): HolidayGroup[] {
  const sorted = [...list].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
  const groups: HolidayGroup[] = [];
  for (const h of sorted) {
    const last = groups[groups.length - 1];
    const nextDay = last ? dayKey(new Date(new Date(`${last.to}T00:00:00`).getTime() + 86_400_000)) : null;
    if (last && last.name === h.name && last.organization_id === h.organization_id && nextDay === h.holiday_date) {
      last.to = h.holiday_date;
      last.ids.push(h.id);
    } else {
      groups.push({
        key: h.id,
        name: h.name,
        kind: h.kind,
        organization_id: h.organization_id,
        organization: h.organization ?? null,
        from: h.holiday_date,
        to: h.holiday_date,
        ids: [h.id],
      });
    }
  }
  return groups;
}

const d = (key: string) => new Date(`${key}T00:00:00`);
const fmtShort = (key: string) => d(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const rangeLabel = (g: HolidayGroup) => (g.from === g.to ? d(g.from).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : `${fmtShort(g.from)} – ${fmtShort(g.to)} · ${g.ids.length} days`);
const daysUntil = (key: string) => Math.round((d(key).getTime() - d(dayKey()).getTime()) / 86_400_000);

function confirmAction(title: string, message: string, fn: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) fn();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Keep', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: fn },
  ]);
}

/** The year's holiday calendar. Everyone can read it; Boss and HR add, rename and remove holidays. */
export default function HolidaysScreen() {
  const { isBoss, isHR } = useMe();
  const canManage = isBoss || isHR;
  const toast = useToast();
  const { width } = useWindowDimensions();
  const twoCol = width >= 720;
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<HolidayGroup | null>(null);
  const list = useLoad(() => api.listHolidays(year), [year]);

  const groups = useMemo(() => groupHolidays(list.data ?? []), [list.data]);
  const today = dayKey();
  const next = groups.find((g) => g.to >= today) ?? null;
  const byMonth = useMemo(() => {
    const m = new Map<string, HolidayGroup[]>();
    for (const g of groups) {
      const k = g.from.slice(0, 7);
      m.set(k, [...(m.get(k) ?? []), g]);
    }
    return [...m.entries()];
  }, [groups]);

  const notSetUp = !!list.error && /list_holidays|schema cache/i.test(list.error);

  return (
    <>
      <Screen
        refreshing={list.refreshing}
        onRefresh={list.refresh}
        header={
          <PageHeader
            title="Holidays"
            subtitle={list.loading ? 'Loading…' : `${year} · ${groups.length} ${groups.length === 1 ? 'holiday' : 'holidays'}`}
            right={canManage && !notSetUp ? <Button title="Add" size="sm" icon="add" onPress={() => setAdding(true)} /> : undefined}
          />
        }>
        <View style={{ gap: spacing.lg }}>
          {notSetUp ? (
            <Banner tone="warning" icon="construct-outline" title="Holidays are not set up yet">
              The server is missing the holidays update. Ask your administrator to apply the latest database migration.
            </Banner>
          ) : (
            list.error && <Banner tone="danger">{list.error}</Banner>
          )}

          <View style={styles.yearRow}>
            <Pressable onPress={() => setYear((y) => y - 1)} hitSlop={12} accessibilityLabel="Previous year" style={styles.yearBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <Text style={type.h2}>{year}</Text>
            <Pressable onPress={() => setYear((y) => y + 1)} hitSlop={12} accessibilityLabel="Next year" style={styles.yearBtn}>
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </Pressable>
          </View>

          {next && (
            <View style={styles.nextCard}>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text style={styles.nextEyebrow}>{next.from <= today ? 'Today' : 'Next holiday'}</Text>
                <Text style={styles.nextName} numberOfLines={2}>
                  {next.name}
                </Text>
                <Text style={styles.nextMeta}>{rangeLabel(next)}</Text>
              </View>
              <View style={styles.countdown}>
                <Text style={styles.countdownValue}>{next.from <= today ? '🎉' : daysUntil(next.from)}</Text>
                <Text style={styles.countdownLabel}>{next.from <= today ? 'enjoy' : daysUntil(next.from) === 1 ? 'day to go' : 'days to go'}</Text>
              </View>
            </View>
          )}

          {list.loading ? (
            <ListSkeleton rows={4} />
          ) : groups.length === 0 && !notSetUp ? (
            <Card>
              <EmptyState
                icon="sparkles-outline"
                title={`No holidays in ${year}`}
                body={canManage ? 'Add festivals and company holidays so nobody is marked absent and salaries are not cut.' : 'Holidays announced by HR appear here.'}
                action={canManage ? <Button title="Add holiday" icon="add" onPress={() => setAdding(true)} /> : undefined}
              />
            </Card>
          ) : (
            byMonth.map(([month, items]) => (
              <View key={month} style={{ gap: spacing.sm }}>
                <Text style={styles.monthTitle}>{d(`${month}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
                <View style={[styles.grid, twoCol && styles.gridTwo]}>
                  {items.map((g) => (
                    <HolidayRow key={g.key} group={g} past={g.to < today} wide={twoCol} onPress={canManage ? () => setEditing(g) : undefined} />
                  ))}
                </View>
              </View>
            ))
          )}

          {groups.length > 0 && (
            <Text style={[type.small, { textAlign: 'center' }]}>Holidays are paid days. Nobody is marked absent and no leave is used.</Text>
          )}
        </View>
      </Screen>

      {adding && (
        <AddHolidaySheet
          onClose={() => setAdding(false)}
          onSaved={(days, holidayYear) => {
            setAdding(false);
            toast(days === 1 ? 'Holiday added · employees notified' : `${days} holiday days added · employees notified`);
            if (holidayYear !== year) setYear(holidayYear);
            else list.reload();
          }}
        />
      )}
      {editing && (
        <EditHolidaySheet
          group={editing}
          onClose={() => setEditing(null)}
          onDone={(msg) => {
            setEditing(null);
            list.reload();
            toast(msg);
          }}
        />
      )}
    </>
  );
}

function HolidayRow({ group, past, wide, onPress }: { group: HolidayGroup; past: boolean; wide: boolean; onPress?: () => void }) {
  const kind = KINDS.find((k) => k.value === group.kind) ?? KINDS[0];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, wide && styles.rowWide, past && { opacity: 0.55 }, pressed && { opacity: 0.8 }]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${group.name}, ${rangeLabel(group)}`}>
      <View style={[styles.dateTile, { backgroundColor: past ? colors.textMuted : HOLIDAY_COLOR }]}>
        <Text style={styles.dateDay}>{Number(group.from.slice(8, 10))}</Text>
        <Text style={styles.dateMonth}>{d(group.from).toLocaleDateString(undefined, { month: 'short' })}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={type.bodyMedium} numberOfLines={1}>
          {group.name}
        </Text>
        <Text style={type.small} numberOfLines={1}>
          {rangeLabel(group)}
        </Text>
        <View style={styles.tags}>
          <View style={[styles.tag, { backgroundColor: kind.tint + '18' }]}>
            <Ionicons name={kind.icon} size={11} color={kind.tint} />
            <Text style={[styles.tagText, { color: kind.tint }]}>{holidayKindLabel[group.kind]}</Text>
          </View>
          <View style={[styles.tag, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.tagText, { color: colors.textSecondary }]}>{group.organization ?? 'All companies'}</Text>
          </View>
        </View>
      </View>
      {onPress && <Ionicons name="create-outline" size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

function AddHolidaySheet({ onClose, onSaved }: { onClose: () => void; onSaved: (days: number, year: number) => void }) {
  const { isBoss, organization } = useMe();
  const { organizations } = useOrganization();
  const toast = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<HolidayKind>('festival');
  const [from, setFrom] = useState<string | null>(null);
  const [multi, setMulti] = useState(false);
  const [to, setTo] = useState<string | null>(null);
  const [scope, setScope] = useState<string>(ALL);
  const [busy, setBusy] = useState(false);

  const days = from ? (multi && to && to >= from ? Math.round((d(to).getTime() - d(from).getTime()) / 86_400_000) + 1 : 1) : 0;
  const problem =
    name.trim().length < 2
      ? 'Give the holiday a name.'
      : !from
        ? 'Pick the date.'
        : multi && !to
          ? 'Pick the last day.'
          : multi && to && to < from
            ? 'The last day is before the first day.'
            : days > 31
              ? 'A holiday can span at most 31 days.'
              : null;

  const save = async () => {
    if (problem) return toast(problem, 'error');
    setBusy(true);
    try {
      const n = await api.addHoliday({
        name: name.trim(),
        from: from!,
        to: multi ? to : null,
        kind,
        organizationId: isBoss ? (scope === ALL ? null : scope) : null, // HR: the server scopes it to their company
      });
      onSaved(n, Number(from!.slice(0, 4)));
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible onClose={onClose} title="Add holiday" placement="center">
      <View style={styles.sheetBody}>
        <TextField label="Holiday name" value={name} onChangeText={setName} placeholder="e.g. Diwali, Independence Day" maxLength={80} autoFocus />
        <ChoiceChips label="Type" options={KINDS} value={kind} onChange={setKind} />

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyMedium}>More than one day</Text>
            <Text style={type.small}>For festivals like Diwali that run over several days</Text>
          </View>
          <Switch value={multi} onValueChange={setMulti} trackColor={{ true: colors.brand, false: colors.borderStrong }} thumbColor={colors.white} />
        </View>

        <View style={styles.dates}>
          <View style={{ flex: 1, minWidth: 200 }}>
            <DateInput label={multi ? 'First day' : 'Date'} value={from} onChange={setFrom} />
          </View>
          {multi && (
            <View style={{ flex: 1, minWidth: 200 }}>
              <DateInput label="Last day" value={to} onChange={setTo} min={from} />
            </View>
          )}
        </View>

        {isBoss ? (
          <SelectField
            label="Applies to"
            icon="business-outline"
            value={scope}
            onChange={(v) => setScope(v ?? ALL)}
            options={[{ value: ALL, label: 'All companies' }, ...organizations.map((o) => ({ value: o.id, label: o.name }))]}
          />
        ) : (
          <View style={styles.scopeNote}>
            <Ionicons name="business-outline" size={16} color={colors.textSecondary} />
            <Text style={type.small}>Applies to {organization?.name ?? 'your company'}</Text>
          </View>
        )}

        <View style={styles.impact}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={[type.small, { flex: 1, color: colors.text }]}>
            {days > 1 ? `${days} paid days` : 'A paid day'} for everyone in scope: nobody is marked absent, no leave is used, and salary is not cut.
            Employees get a notification.
          </Text>
        </View>

        <Button title={days > 1 ? `Add ${days} days` : 'Add holiday'} icon="checkmark" size="lg" loading={busy} disabled={!!problem} onPress={save} />
      </View>
    </Sheet>
  );
}

function EditHolidaySheet({ group, onClose, onDone }: { group: HolidayGroup; onClose: () => void; onDone: (msg: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState(group.name);
  const [kind, setKind] = useState<HolidayKind>(group.kind);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  const save = async () => {
    if (name.trim().length < 2) return toast('Give the holiday a name.', 'error');
    setBusy('save');
    try {
      for (const id of group.ids) await api.updateHoliday(id, name.trim(), kind);
      onDone('Holiday updated');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = () =>
    confirmAction(
      `Delete ${group.name}?`,
      group.ids.length > 1 ? `All ${group.ids.length} days become normal working days again.` : 'This day becomes a normal working day again.',
      async () => {
        setBusy('delete');
        try {
          for (const id of group.ids) await api.deleteHoliday(id);
          onDone('Holiday deleted');
        } catch (e) {
          toast(errorMessage(e), 'error');
        } finally {
          setBusy(null);
        }
      },
    );

  return (
    <Sheet visible onClose={onClose} title="Edit holiday" placement="center">
      <View style={styles.sheetBody}>
        <View style={styles.editIntro}>
          <Ionicons name="calendar-outline" size={18} color={HOLIDAY_COLOR} />
          <Text style={[type.bodyMedium, { flex: 1 }]}>{rangeLabel(group)}</Text>
        </View>
        <TextField label="Holiday name" value={name} onChangeText={setName} maxLength={80} />
        <ChoiceChips label="Type" options={KINDS} value={kind} onChange={setKind} />
        <Button title="Save changes" icon="checkmark" size="lg" loading={busy === 'save'} disabled={!!busy} onPress={save} />
        <Button title="Delete holiday" icon="trash-outline" variant="outline" loading={busy === 'delete'} disabled={!!busy} onPress={remove} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  yearBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  nextCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: HOLIDAY_COLOR },
  nextEyebrow: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.8)' },
  nextName: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.white },
  nextMeta: { fontFamily: fonts.medium, fontSize: 13.5, color: 'rgba(255,255,255,0.9)' },
  countdown: { alignItems: 'center', minWidth: 72, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.16)' },
  countdownValue: { fontFamily: fonts.extrabold, fontSize: 26, color: colors.white },
  countdownLabel: { fontFamily: fonts.medium, fontSize: 11, color: 'rgba(255,255,255,0.85)' },
  monthTitle: { fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.textSecondary },
  grid: { gap: spacing.sm },
  gridTwo: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  rowWide: { flexBasis: '48%', flexGrow: 1 },
  dateTile: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontFamily: fonts.extrabold, fontSize: 19, color: colors.white, lineHeight: 21 },
  dateMonth: { fontFamily: fonts.semibold, fontSize: 11, color: 'rgba(255,255,255,0.88)', textTransform: 'uppercase' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  tagText: { fontFamily: fonts.semibold, fontSize: 11 },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.lg },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  scopeNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  impact: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: HOLIDAY_SOFT },
  editIntro: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: HOLIDAY_SOFT },
});
