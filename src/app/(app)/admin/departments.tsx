import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Divider,
  EmptyState,
  IconTile,
  ListSkeleton,
  PageHeader,
  Screen,
  SectionTitle,
  Sheet,
  TextField,
} from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import { roleLabel } from '@/lib/format';
import type { Department, DirectoryUser } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useOrganization } from '@/providers/OrganizationProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme/tokens';

export default function DepartmentsScreen() {
  const { isBoss } = useMe();
  const { selectedOrgId } = useOrganization();
  const toast = useToast();

  // Departments are UNIVERSAL across all companies
  const depts = useLoad(() => api.departments());

  // Directory users are scoped to the active organization
  const people = useLoad(() => api.directory(selectedOrgId), [selectedOrgId]);

  const [newDept, setNewDept] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);

  const deptList = depts.data ?? [];

  // Compute members per department for the active company
  const memberMap = useMemo(() => {
    const map = new Map<string, DirectoryUser[]>();
    for (const d of deptList) {
      map.set(d.id, []);
    }
    for (const p of people.data ?? []) {
      for (const d of deptList) {
        if (
          p.department_id === d.id ||
          (p.department && p.department.trim().toLowerCase() === d.name.trim().toLowerCase())
        ) {
          const arr = map.get(d.id) ?? [];
          arr.push(p);
          map.set(d.id, arr);
        }
      }
    }
    return map;
  }, [deptList, people.data]);

  const handleRefresh = () => {
    depts.refresh();
    people.refresh();
  };

  const handleAddDepartment = async () => {
    const trimmed = newDept.trim();
    if (trimmed.length < 2) {
      toast('Department name must be at least 2 characters', 'error');
      return;
    }
    // Prevent duplicate department names
    if (deptList.some((d) => d.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      toast(`Department "${trimmed}" already exists`, 'error');
      return;
    }

    setAdding(true);
    try {
      // Universal department (no orgId)
      await api.createDepartment(trimmed);
      setNewDept('');
      depts.reload();
      toast(`Department "${trimmed}" created universally`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = (id: string, name: string, count: number) => {
    if (count > 0) {
      toast(
        `Cannot remove "${name}": ${count} ${count === 1 ? 'employee is' : 'employees are'} currently assigned.`,
        'error',
      );
      return;
    }

    const confirmDelete = async () => {
      setDeletingId(id);
      try {
        await api.deleteDepartment(id);
        toast(`Department "${name}" removed`);
        depts.reload();
      } catch (e) {
        toast(errorMessage(e), 'error');
      } finally {
        setDeletingId(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to remove the "${name}" department?`)) {
        confirmDelete();
      }
      return;
    }

    Alert.alert('Remove Department', `Are you sure you want to remove the "${name}" department?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: confirmDelete },
    ]);
  };

  // Only Boss/Admin can view and manage departments
  if (!isBoss) {
    return (
      <Screen header={<PageHeader title="Departments" subtitle="Administration" />}>
        <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.md }}>
          <Ionicons name="lock-closed-outline" size={44} color={colors.danger} />
          <Text style={[type.h2, { textAlign: 'center' }]}>Access Restricted</Text>
          <Text style={[type.small, { textAlign: 'center', maxWidth: 300 }]}>
            Only administrators have access to view and manage company departments.
          </Text>
          <Button title="Back to home" variant="secondary" onPress={() => router.replace('/')} />
        </Card>
      </Screen>
    );
  }

  const activeDeptMembers = selectedDept ? memberMap.get(selectedDept.id) ?? [] : [];

  return (
    <>
      <Screen
        refreshing={depts.refreshing || people.refreshing}
        onRefresh={handleRefresh}
        header={
          <PageHeader
            title="Departments"
            subtitle={`${deptList.length} ${deptList.length === 1 ? 'department' : 'departments'}`}
          />
        }>
        <View style={{ gap: spacing.lg }}>
          {depts.error && <Banner tone="danger">{depts.error}</Banner>}

          {/* Add Department Card */}
          <Card style={styles.addCard}>
            <View style={styles.addHeader}>
              <IconTile icon="add-circle" color={colors.brand} bg={colors.brandSoft} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={styles.addTitle}>Create Department</Text>
                <Text style={styles.addSubtitle}>
                  Universal department available in all company profiles & directories
                </Text>
              </View>
            </View>

            <View style={styles.formContainer}>
              <TextField
                placeholder="Department name (e.g. Sales, Marketing, IT)"
                value={newDept}
                onChangeText={setNewDept}
                icon="briefcase-outline"
                onSubmitEditing={handleAddDepartment}
                returnKeyType="done"
              />
              <Button
                title="Add Department"
                icon="add-circle-outline"
                loading={adding}
                disabled={newDept.trim().length < 2}
                onPress={handleAddDepartment}
              />
            </View>
          </Card>

          {/* Department List */}
          <SectionTitle
            title="All Departments"
            action={`${deptList.length} total`}
          />

          {depts.loading ? (
            <ListSkeleton rows={5} />
          ) : deptList.length === 0 ? (
            <Card>
              <EmptyState
                icon="business-outline"
                title="No departments yet"
                body="Add your first universal department above to get started."
              />
            </Card>
          ) : (
            <Card padded={false} style={styles.listCard}>
              {deptList.map((d, i) => {
                const members = memberMap.get(d.id) ?? [];
                const count = members.length;
                const isDeleting = deletingId === d.id;

                return (
                  <View key={d.id}>
                    {i > 0 && <Divider inset={60} />}
                    <Pressable
                      onPress={() => setSelectedDept(d)}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.deptRow, pressed && styles.deptRowPressed]}>
                      {/* Left: Department Icon */}
                      <View style={[styles.deptIconWrap, count > 0 && styles.deptIconWrapActive]}>
                        <Ionicons
                          name="briefcase-outline"
                          size={20}
                          color={count > 0 ? colors.brand : colors.textMuted}
                        />
                      </View>

                      {/* Middle: Department Name & Scoped Member Count */}
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text style={styles.deptName} numberOfLines={1}>
                          {d.name}
                        </Text>
                        <Text style={[styles.deptCount, count === 0 && { color: colors.textMuted }]} numberOfLines={1}>
                          {count > 0
                            ? `${count} ${count === 1 ? 'employee' : 'employees'}`
                            : '0 employees'}
                        </Text>
                      </View>

                      {/* Right Action: Headcount Pill, Delete Action & Chevron */}
                      <View style={styles.rightGroup}>
                        <View style={[styles.countPill, count > 0 ? styles.countPillActive : styles.countPillZero]}>
                          <Ionicons
                            name="people-outline"
                            size={12}
                            color={count > 0 ? colors.brand : colors.textMuted}
                          />
                          <Text style={[styles.countText, count > 0 ? styles.countTextActive : styles.countTextZero]}>
                            {count}
                          </Text>
                        </View>

                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            handleDelete(d.id, d.name, count);
                          }}
                          disabled={isDeleting}
                          hitSlop={8}
                          accessibilityLabel={`Delete ${d.name}`}
                          style={({ pressed }) => [
                            styles.deleteBtn,
                            count > 0 && styles.deleteBtnDisabled,
                            pressed && { opacity: 0.6 },
                          ]}>
                          <Ionicons
                            name="trash-outline"
                            size={17}
                            color={count > 0 ? colors.borderStrong : colors.danger}
                          />
                        </Pressable>

                        <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
                      </View>
                    </Pressable>
                  </View>
                );
              })}
            </Card>
          )}
        </View>
      </Screen>

      {/* Department Members Details Sheet */}
      {selectedDept && (
        <Sheet
          visible={!!selectedDept}
          onClose={() => setSelectedDept(null)}
          title={selectedDept.name}>
          <View style={{ gap: spacing.md, maxHeight: 420 }}>
            {/* Sheet Context Header */}
            <View style={styles.sheetContext}>
              <Ionicons name="people-outline" size={16} color={colors.brand} />
              <Text style={styles.sheetContextText} numberOfLines={1}>
                {activeDeptMembers.length}{' '}
                {activeDeptMembers.length === 1 ? 'employee' : 'employees'}
              </Text>
            </View>

            {activeDeptMembers.length === 0 ? (
              <View style={styles.sheetEmpty}>
                <Ionicons name="people-outline" size={38} color={colors.textMuted} />
                <Text style={styles.sheetEmptyTitle}>0 employees in {selectedDept.name}</Text>
                <Text style={styles.sheetEmptyBody}>
                  There are currently no team members assigned to {selectedDept.name}.
                </Text>
                <Button
                  title="Assign in Directory"
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    setSelectedDept(null);
                    router.push('/people');
                  }}
                  style={{ marginTop: spacing.xs }}
                />
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                <Card padded={false} style={{ overflow: 'hidden' }}>
                  {activeDeptMembers.map((m, idx) => (
                    <View key={m.id}>
                      {idx > 0 && <Divider inset={56} />}
                      <Pressable
                        onPress={() => {
                          setSelectedDept(null);
                          router.push(`/people/${m.id}`);
                        }}
                        style={({ pressed }) => [styles.memberRow, pressed && { backgroundColor: colors.surfaceAlt }]}>
                        <Avatar name={m.full_name} id={m.id} size={36} />
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <Text style={type.bodyMedium} numberOfLines={1}>
                            {m.full_name}
                          </Text>
                          <Text style={type.small} numberOfLines={1}>
                            {m.job_title ?? m.email}
                          </Text>
                        </View>
                        <Badge
                          label={roleLabel[m.role]}
                          tone={m.role === 'boss' ? 'brand' : m.role === 'hr' ? 'info' : 'neutral'}
                        />
                      </Pressable>
                    </View>
                  ))}
                </Card>
              </ScrollView>
            )}

            <Button title="Close" variant="secondary" onPress={() => setSelectedDept(null)} />
          </View>
        </Sheet>
      )}
    </>
  );
}

const styles = StyleSheet.create({

  addCard: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  addHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  addTitle: {
    fontFamily: fonts.bold,
    fontSize: 15.5,
    color: colors.text,
  },
  addSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.textSecondary,
    marginTop: 1,
  },
  formContainer: {
    gap: spacing.sm,
  },
  listCard: {
    overflow: 'hidden',
    borderRadius: radius.lg,
  },
  deptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  deptRowPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  deptIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  deptIconWrapActive: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brandTint,
  },
  deptName: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.text,
  },
  deptCount: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  countPillActive: {
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandTint,
  },
  countPillZero: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countText: {
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  countTextActive: {
    color: colors.brand,
  },
  countTextZero: {
    color: colors.textMuted,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
  },
  deleteBtnDisabled: {
    backgroundColor: 'transparent',
    opacity: 0.4,
  },
  sheetContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.brandSoft,
    borderRadius: radius.md,
  },
  sheetContextText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.brand,
  },
  sheetEmpty: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sheetEmptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
    marginTop: spacing.xs,
  },
  sheetEmptyBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
});
