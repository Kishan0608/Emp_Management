import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar,
  Badge,
  Card,
  ChoiceChips,
  Divider,
  EmptyState,
  ListSkeleton,
  PageHeader,
  Screen,
  SectionTitle,
  Segmented,
  SwitchRow,
} from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { fieldLabel, roleLabel } from '@/lib/format';
import type { Role, VisibilityField } from '@/lib/types';
import { useOrganization } from '@/providers/OrganizationProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

const FIELDS = Object.keys(fieldLabel) as VisibilityField[];
const FIELD_HELP: Record<VisibilityField, string> = {
  contact: 'Phone, personal email, address, joining date',
  salary: 'Monthly salary',
  attendance: 'Attendance percentage',
  task_history: 'Task stats and timeline (manager always sees own team’s tasks)',
  performance: 'Performance rating',
};

type Override = 'inherit' | 'allow' | 'deny';

export default function Visibility() {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { selectedOrgId } = useOrganization();
  const rules = useLoad(() => api.visibilityRules());
  const people = useLoad(() => api.directory(selectedOrgId), [selectedOrgId]);
  const [mode, setMode] = useState<'role' | 'person'>('role');
  const [role, setRole] = useState<Exclude<Role, 'boss'>>('hr');
  const [person, setPerson] = useState<string | null>(null);

  // Search modal state for person selector
  const [personSearchOpen, setPersonSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const eligiblePeople = useMemo(() => {
    return (people.data ?? []).filter((p) => p.is_active && p.role !== 'boss');
  }, [people.data]);

  const selected = useMemo(() => people.data?.find((p) => p.id === person), [people.data, person]);

  const filteredPeople = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return eligiblePeople;
    return eligiblePeople.filter((p) => {
      const nameMatch = p.full_name.toLowerCase().includes(q);
      const phoneMatch = p.phone
        ? p.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '')) || p.phone.toLowerCase().includes(q)
        : false;
      const titleMatch = (p.job_title ?? '').toLowerCase().includes(q);
      const emailMatch = (p.email ?? '').toLowerCase().includes(q);
      const deptMatch = (p.department ?? '').toLowerCase().includes(q);
      return nameMatch || phoneMatch || titleMatch || emailMatch || deptMatch;
    });
  }, [eligiblePeople, searchQuery]);

  const roleRule = (r: Role, f: VisibilityField) => rules.data?.find((x) => x.viewer_role === r && x.field_name === f)?.allowed ?? false;
  const personRule = (id: string, f: VisibilityField): Override => {
    const r = rules.data?.find((x) => x.viewer_id === id && x.field_name === f);
    return r ? (r.allowed ? 'allow' : 'deny') : 'inherit';
  };

  const setRoleField = async (f: VisibilityField, allowed: boolean) => {
    try {
      await api.setVisibility({ role }, f, allowed);
      toast(`${roleLabel[role]} · ${fieldLabel[f]}: ${allowed ? 'visible' : 'hidden'}`);
      rules.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const setPersonField = async (f: VisibilityField, v: Override) => {
    if (!person) return;
    try {
      if (v === 'inherit') await api.clearPersonVisibility(person, f);
      else await api.setVisibility({ id: person }, f, v === 'allow');
      toast('Saved');
      rules.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <>
      <Screen
        refreshing={rules.refreshing}
        onRefresh={rules.refresh}
        header={<PageHeader title="Visibility settings" subtitle="Who can see which employee details" />}>
        <View style={{ gap: spacing.md }}>
          <Segmented
            options={[
              { value: 'role', label: 'By role' },
              { value: 'person', label: 'By person' },
            ]}
            value={mode}
            onChange={setMode}
          />

          {rules.loading ? (
            <ListSkeleton rows={3} />
          ) : mode === 'role' ? (
            <>
              <ChoiceChips
                options={(['hr', 'manager', 'employee'] as const).map((r) => ({ value: r, label: roleLabel[r] }))}
                value={role}
                onChange={setRole}
              />
              <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
                {FIELDS.map((f, i) => (
                  <View key={f}>
                    {i > 0 && <Divider />}
                    <SwitchRow label={fieldLabel[f]} description={FIELD_HELP[f]} value={roleRule(role, f)} onChange={(v) => setRoleField(f, v)} />
                  </View>
                ))}
              </Card>
            </>
          ) : (
            <>
              {/* Professional Person Selector Card */}
              <Card style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionBadgeIcon}>
                    <Ionicons name="person" size={16} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionHeaderTitle}>Select Person</Text>
                    <Text style={styles.sectionHeaderSubtitle}>Configure custom visibility overrides</Text>
                  </View>
                </View>

                {selected ? (
                  <Pressable
                    onPress={() => setPersonSearchOpen(true)}
                    style={({ pressed }) => [
                      styles.selectedPersonCard,
                      pressed && { opacity: 0.9, backgroundColor: colors.brandSoft },
                    ]}>
                    <Avatar name={selected.full_name} id={selected.id} size={48} />
                    <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                      <View style={styles.personTopRow}>
                        <Text style={styles.personName} numberOfLines={1}>
                          {selected.full_name}
                        </Text>
                        <View style={styles.changePersonBtn}>
                          <Ionicons name="swap-horizontal" size={13} color={colors.brand} />
                          <Text style={styles.changePersonText}>Change</Text>
                        </View>
                      </View>

                      <View style={styles.personMetaRow}>
                        <Badge
                          label={roleLabel[selected.role]}
                          tone={selected.role === 'boss' ? 'brand' : selected.role === 'hr' ? 'info' : 'neutral'}
                        />
                        {Boolean(selected.job_title || selected.department) && (
                          <Text style={styles.personSubtitle} numberOfLines={1}>
                            {[selected.job_title, selected.department].filter(Boolean).join(' · ')}
                          </Text>
                        )}
                      </View>

                      {selected.phone && (
                        <View style={styles.phoneTag}>
                          <Ionicons name="call-outline" size={12} color={colors.success} />
                          <Text style={styles.phoneTagText}>{selected.phone}</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => setPersonSearchOpen(true)}
                    style={styles.emptyPersonBox}>
                    <Ionicons name="search-outline" size={20} color={colors.brand} />
                    <Text style={styles.emptyPersonText}>
                      Search person by name or phone number…
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                )}
              </Card>

              {selected && (
                <>
                  <SectionTitle title={`Overrides for ${selected.full_name.split(' ')[0]}`} />
                  {FIELDS.map((f) => {
                    const current = personRule(selected.id, f);
                    const inherited = roleRule(selected.role, f);
                    return (
                      <Card key={f} style={{ gap: spacing.sm }}>
                        <Text style={type.bodyMedium}>{fieldLabel[f]}</Text>
                        <Text style={type.small}>
                          {`${roleLabel[selected.role]} default: `}
                          <Text style={{ color: inherited ? colors.success : colors.textMuted }}>{inherited ? 'visible' : 'hidden'}</Text>
                        </Text>
                        <ChoiceChips
                          value={current}
                          onChange={(v) => setPersonField(f, v)}
                          options={[
                            { value: 'inherit', label: 'Use role default' },
                            { value: 'allow', label: 'Allow', tint: colors.success },
                            { value: 'deny', label: 'Deny', tint: colors.danger },
                          ]}
                        />
                      </Card>
                    );
                  })}
                </>
              )}
            </>
          )}
        </View>
      </Screen>

      {/* Professional Search Modal for Person Selection (same experience as Tasks) */}
      <Modal
        visible={personSearchOpen}
        animationType="slide"
        onRequestClose={() => setPersonSearchOpen(false)}>
        <View style={[styles.modalRoot, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Choose Person</Text>
              <Text style={styles.modalSubtitle}>Search through {eligiblePeople.length} employees</Text>
            </View>
            <Pressable
              onPress={() => setPersonSearchOpen(false)}
              hitSlop={10}
              accessibilityLabel="Close"
              style={styles.modalCloseBtn}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          {/* Search Input Bar */}
          <View style={styles.modalSearchPadding}>
            <View style={styles.searchBarWrap}>
              <Ionicons name="search-outline" size={20} color={colors.brand} />
              <TextInput
                autoFocus
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by name, phone, or title…"
                placeholderTextColor={colors.textMuted}
                style={styles.searchBarInput}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          </View>

          {/* Results List */}
          <FlatList
            data={filteredPeople}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalListContent}
            ListEmptyComponent={
              <Card style={{ margin: spacing.lg }}>
                <EmptyState
                  icon="people-outline"
                  title="No matching person"
                  body="Try searching with a different name or phone number."
                />
              </Card>
            }
            renderItem={({ item }) => {
              const active = item.id === person;
              return (
                <Pressable
                  onPress={() => {
                    setPerson(item.id);
                    setPersonSearchOpen(false);
                    setSearchQuery('');
                  }}
                  style={({ pressed }) => [
                    styles.personListRow,
                    active && styles.personListRowActive,
                    pressed && { backgroundColor: colors.surfaceAlt },
                  ]}>
                  <Avatar name={item.full_name} id={item.id} size={42} />
                  <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                    <View style={styles.personListTopRow}>
                      <Text
                        style={[styles.personRowName, active && { color: colors.brand }]}
                        numberOfLines={1}>
                        {item.full_name}
                      </Text>
                      <Badge
                        label={roleLabel[item.role]}
                        tone={item.role === 'boss' ? 'brand' : item.role === 'hr' ? 'info' : 'neutral'}
                      />
                    </View>
                    <Text style={styles.personRowSub} numberOfLines={1}>
                      {[item.job_title, item.department].filter(Boolean).join(' · ')}
                    </Text>
                    {item.phone && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Ionicons name="call-outline" size={12} color={colors.success} />
                        <Text style={styles.personRowPhone}>{item.phone}</Text>
                      </View>
                    )}
                  </View>
                  {active && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
                  )}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  sectionBadgeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
  },
  sectionHeaderSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.textSecondary,
    marginTop: 1,
  },
  selectedPersonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: colors.surfaceAlt,
  },
  personTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  personName: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
  },
  changePersonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandTint,
  },
  changePersonText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.brand,
  },
  personMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  personSubtitle: {
    flexShrink: 1,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  phoneTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  phoneTagText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.success,
  },
  emptyPersonBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  emptyPersonText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.brand,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  modalTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.text,
  },
  modalSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: spacing.xs,
    borderRadius: radius.pill,
  },
  modalSearchPadding: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
  },
  searchBarInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  modalListContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  personListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  personListRowActive: {
    backgroundColor: colors.brandSoft,
  },
  personListTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  personRowName: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: colors.text,
  },
  personRowSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  personRowPhone: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.success,
  },
});
