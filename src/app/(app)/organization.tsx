import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Button,
  Card,
  PageHeader,
  Screen,
  Segmented,
  Sheet,
  TextField,
} from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api, errorMessage } from '@/lib/api';
import type { Organization } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useOrganization } from '@/providers/OrganizationProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme/tokens';

export default function OrganizationScreen() {
  const { isBoss } = useMe();
  const { organizations, selectedOrg, setSelectedOrg, loading, refreshOrganizations } = useOrganization();
  const toast = useToast();

  const [newOrgName, setNewOrgName] = useState('');
  const [creating, setCreating] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Edit organization state
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete organization state
  const [deletingOrgId, setDeletingOrgId] = useState<string | null>(null);

  // Ensure one specific company is always active (no "All Companies")
  useEffect(() => {
    if (!selectedOrg && organizations.length > 0) {
      setSelectedOrg(organizations[0]);
    }
  }, [selectedOrg, organizations, setSelectedOrg]);

  const activeOrg = selectedOrg ?? organizations[0] ?? null;
  const activeOrgName = activeOrg ? activeOrg.name : 'Loading…';

  const sourceLoad = useLoad(
    () => (activeOrg && isBoss ? api.orgAttendanceSource(activeOrg.id) : Promise.resolve(null)),
    [activeOrg?.id, isBoss],
  );
  const attendanceSource: 'app' | 'machine' = sourceLoad.data?.attendance_source ?? 'app';

  const changeAttendanceSource = (next: 'app' | 'machine') => {
    if (!activeOrg || next === attendanceSource) return;
    const apply = async () => {
      try {
        await api.setAttendanceSource(activeOrg.id, next);
        toast(next === 'machine' ? 'Attendance now comes from the punching machine' : 'Attendance now recorded in the app');
        sourceLoad.reload();
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    };
    const title = next === 'machine' ? 'Switch to punching machine?' : 'Switch to app attendance?';
    const message =
      next === 'machine'
        ? `${activeOrg.name} will take attendance from the punching machine. Employees will no longer clock in the app.`
        : `${activeOrg.name} will record attendance in the app again.`;
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) apply();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Switch', onPress: apply },
    ]);
  };

  const handleSelect = async (org: Organization) => {
    setSwitchingId(org.id);
    try {
      await setSelectedOrg(org);
      toast(`Switched active company to ${org.name}`);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    } finally {
      setSwitchingId(null);
    }
  };

  const openEditModal = (org: Organization) => {
    setEditingOrg(org);
    setEditName(org.name);
  };

  const handleSaveEdit = async () => {
    if (!editingOrg) return;
    const trimmed = editName.trim();
    if (trimmed.length < 2) {
      return toast('Company name must be at least 2 characters', 'error');
    }
    if (trimmed === editingOrg.name) {
      setEditingOrg(null);
      return;
    }
    setSavingEdit(true);
    try {
      await api.updateOrganization(editingOrg.id, trimmed);
      await refreshOrganizations();
      if (selectedOrg?.id === editingOrg.id) {
        await setSelectedOrg({ ...editingOrg, name: trimmed });
      }
      toast(`Renamed company to "${trimmed}"`);
      setEditingOrg(null);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteOrg = (org: Organization) => {
    if (organizations.length <= 1) {
      toast('Cannot delete the only remaining company', 'error');
      return;
    }

    const confirmDelete = async () => {
      setDeletingOrgId(org.id);
      try {
        if (selectedOrg?.id === org.id) {
          const fallback = organizations.find((o) => o.id !== org.id) ?? null;
          if (fallback) {
            await setSelectedOrg(fallback);
          }
        }
        await api.deleteOrganization(org.id);
        await refreshOrganizations();
        toast(`Deleted "${org.name}" successfully`);
      } catch (e) {
        toast(errorMessage(e), 'error');
      } finally {
        setDeletingOrgId(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete "${org.name}"? This action cannot be undone.`)) {
        confirmDelete();
      }
      return;
    }

    Alert.alert(
      'Delete Company',
      `Are you sure you want to delete "${org.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete },
      ],
    );
  };

  const handleCreate = async () => {
    const trimmed = newOrgName.trim();
    if (trimmed.length < 2) {
      return toast('Company name must be at least 2 characters', 'error');
    }
    setCreating(true);
    try {
      await api.createOrganization(trimmed);
      await refreshOrganizations();
      toast(`Registered ${trimmed} successfully`);
      setNewOrgName('');
      setShowAddForm(false);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Screen
        refreshing={loading}
        onRefresh={refreshOrganizations}
        header={
          <PageHeader
            title="Organizations"
            subtitle={isBoss ? 'Switch workspace or manage company entities' : 'Active organization workspace'}
          />
        }>
        <View style={styles.responsiveContainer}>
          {/* Active Company Banner — Centered with Vibrant Green Badge */}
          <Card style={styles.activeBanner}>
            <View style={styles.activeBannerCenter}>
              <View style={styles.activeIconContainer}>
                <Ionicons name="business" size={24} color={colors.brand} />
              </View>
              <View style={styles.activeInfoCenter}>
                <Text style={styles.activeTitle} numberOfLines={2}>
                  {activeOrgName}
                </Text>
                <View style={styles.greenActiveBadge}>
                  <View style={styles.greenDot} />
                  <Text style={styles.greenActiveText}>Active</Text>
                </View>
              </View>
            </View>
          </Card>

          {/* Attendance source for the active company (Boss only). Each company chooses its own. */}
          {isBoss && activeOrg && (
            <Card style={styles.sourceCard}>
              <View style={{ gap: 4 }}>
                <Text style={type.h3}>Attendance source</Text>
                <Text style={type.small}>
                  {attendanceSource === 'machine'
                    ? 'Punching machine: attendance comes from the machine. Employees do not clock in the app.'
                    : 'App: employees clock in and out in the app. HR or the Boss adds or corrects days by hand.'}
                </Text>
              </View>
              <Segmented<'app' | 'machine'>
                options={[
                  { value: 'app', label: 'App / manual' },
                  { value: 'machine', label: 'Punching machine' },
                ]}
                value={attendanceSource}
                onChange={(v) => changeAttendanceSource(v)}
              />
              {attendanceSource === 'machine' && (
                <Button
                  title="Import punch file"
                  icon="cloud-upload-outline"
                  variant="outline"
                  full
                  onPress={() => router.push({ pathname: '/attendance-import', params: { orgId: activeOrg.id, orgName: activeOrg.name } })}
                />
              )}
            </Card>
          )}

          {/* When showAddForm is open: Only show the Add Form; Hide the available entities list */}
          {isBoss && showAddForm ? (
            <>
              {/* Header with Close button in the exact same color as the Add button */}
              <View style={styles.sectionHeaderRow}>
                <Text style={[type.h3, { fontSize: 16, flex: 1 }]} numberOfLines={2}>Register New Company</Text>
                <Pressable
                  onPress={() => {
                    setNewOrgName('');
                    setShowAddForm(false);
                  }}
                  style={({ pressed }) => [
                    styles.sectionAddBtn,
                    pressed && { transform: [{ scale: 0.96 }], opacity: 0.9 },
                  ]}
                  hitSlop={8}
                  accessibilityLabel="Close form">
                  <View style={styles.sectionAddBtnIconWrap}>
                    <Ionicons name="close" size={15} color={colors.white} />
                  </View>
                  <Text style={styles.sectionAddBtnText}>Close</Text>
                </Pressable>
              </View>

              {/* Registration Form Card */}
              <Card style={styles.addCard}>
                <View style={styles.addHeader}>
                  <View style={styles.addHeaderLeft}>
                    <View style={styles.addIconCircle}>
                      <Ionicons name="business-outline" size={20} color={colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.h3, { fontSize: 15 }]}>Company Details</Text>
                      <Text style={[type.small, { color: colors.textSecondary }]}>
                        Enter company name to create a new organization entity
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => {
                      setNewOrgName('');
                      setShowAddForm(false);
                    }}
                    hitSlop={8}
                    accessibilityLabel="Close form">
                    <Ionicons name="close-circle-outline" size={22} color={colors.textMuted} />
                  </Pressable>
                </View>

                <TextField
                  label="Company Name"
                  placeholder="e.g. Shree Karni Fabcom Ltd"
                  value={newOrgName}
                  onChangeText={setNewOrgName}
                  icon="business-outline"
                  autoCapitalize="words"
                  autoFocus
                />

                <View style={styles.addActions}>
                  <Button
                    title="Create Entity"
                    icon="add"
                    variant="primary"
                    loading={creating}
                    disabled={newOrgName.trim().length < 2}
                    onPress={handleCreate}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Cancel"
                    variant="outline"
                    onPress={() => {
                      setNewOrgName('');
                      setShowAddForm(false);
                    }}
                  />
                </View>
              </Card>
            </>
          ) : (
            <>
              {/* Section Header with "+ Add" Button */}
              <View style={styles.sectionHeaderRow}>
                <Text style={[type.h3, { fontSize: 16, flex: 1 }]} numberOfLines={2}>
                  Available Entities ({organizations.length})
                </Text>
                {isBoss && (
                  <Pressable
                    onPress={() => setShowAddForm(true)}
                    style={({ pressed }) => [
                      styles.sectionAddBtn,
                      pressed && { transform: [{ scale: 0.96 }], opacity: 0.9 },
                    ]}
                    hitSlop={8}
                    accessibilityLabel="Add organization">
                    <View style={styles.sectionAddBtnIconWrap}>
                      <Ionicons name="add" size={15} color={colors.white} />
                    </View>
                    <Text style={styles.sectionAddBtnText}>Add</Text>
                  </Pressable>
                )}
              </View>

              {/* Individual Companies List */}
              <View style={styles.listContainer}>
                {organizations.map((org) => {
                  const isSelected = activeOrg?.id === org.id;
                  const isSwitching = switchingId === org.id;
                  return (
                    <Pressable
                      key={org.id}
                      disabled={isSelected || isSwitching}
                      onPress={() => handleSelect(org)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected, disabled: isSelected || isSwitching }}
                      accessibilityLabel={`Select ${org.name}`}
                      style={({ pressed }) => [
                        styles.entityCard,
                        isSelected && styles.entityCardActive,
                        pressed && !isSelected && { opacity: 0.8 },
                      ]}>
                      <View style={[styles.entityIconCircle, isSelected && styles.entityIconCircleActive]}>
                        <Ionicons name="business-outline" size={20} color={isSelected ? colors.brand : colors.textMuted} />
                      </View>
                      <Text style={[type.bodyMedium, { fontFamily: fonts.bold, fontSize: 15, flex: 1 }]} numberOfLines={1}>
                        {org.name}
                      </Text>

                      <View style={styles.cardActions}>
                        {isBoss && (
                          <>
                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation();
                                openEditModal(org);
                              }}
                              style={({ pressed }) => [
                                styles.iconBtn,
                                styles.editBtn,
                                pressed && styles.btnPressed,
                              ]}
                              hitSlop={6}
                              accessibilityLabel={`Edit ${org.name}`}>
                              <Ionicons name="pencil-outline" size={15} color={colors.brand} />
                            </Pressable>

                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation();
                                handleDeleteOrg(org);
                              }}
                              disabled={deletingOrgId === org.id}
                              style={({ pressed }) => [
                                styles.iconBtn,
                                styles.deleteBtn,
                                pressed && styles.btnPressed,
                              ]}
                              hitSlop={6}
                              accessibilityLabel={`Delete ${org.name}`}>
                              {deletingOrgId === org.id ? (
                                <ActivityIndicator size="small" color={colors.danger} />
                              ) : (
                                <Ionicons name="trash-outline" size={15} color={colors.danger} />
                              )}
                            </Pressable>
                          </>
                        )}

                        {isSwitching && (
                          <View style={styles.loadingWrap}>
                            <ActivityIndicator size="small" color={colors.brand} />
                          </View>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>
      </Screen>

      {/* Edit Company Name Sheet */}
      <Sheet
        visible={!!editingOrg}
        onClose={() => {
          if (!savingEdit) setEditingOrg(null);
        }}
        title="Edit Company Name">
        <View style={styles.editSheetContent}>
          <Text style={[type.small, { color: colors.textSecondary }]}>
            Update the display name of this organization entity.
          </Text>
          <TextField
            label="Company Name"
            placeholder="e.g. Shree Karni Fabcom Ltd"
            value={editName}
            onChangeText={setEditName}
            icon="business-outline"
            autoCapitalize="words"
            autoFocus
          />
          <View style={styles.editSheetActions}>
            <Button
              title="Save Changes"
              icon="checkmark"
              variant="primary"
              loading={savingEdit}
              disabled={editName.trim().length < 2 || editName.trim() === editingOrg?.name}
              onPress={handleSaveEdit}
              style={{ flex: 1 }}
            />
            <Button
              title="Cancel"
              variant="outline"
              disabled={savingEdit}
              onPress={() => setEditingOrg(null)}
            />
          </View>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  responsiveContainer: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    gap: spacing.md,
  },
  sourceCard: { gap: spacing.md, padding: spacing.lg },

  // Active Company Banner — Centered with Green Badge
  activeBanner: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: '#86EFAC',
    borderWidth: 1.5,
  },
  activeBannerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  activeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.brandTint,
  },
  activeInfoCenter: {
    alignItems: 'center',
    gap: 6,
  },
  activeTitle: {
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
    fontFamily: fonts.bold,
  },
  greenActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  greenActiveText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#15803D',
    letterSpacing: 0.3,
  },

  // Section Header & High-Contrast Dark "+ Add" Button
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
  },
  sectionAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandDark,
    ...shadow.sm,
  },
  sectionAddBtnActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brandDark,
  },
  sectionAddBtnIconWrap: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionAddBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.white,
    letterSpacing: 0.2,
  },

  listContainer: {
    gap: spacing.sm,
  },
  entityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 64,
    gap: spacing.md,
    ...shadow.sm,
  },
  entityCardActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  loadingWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entityIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  entityIconCircleActive: {
    backgroundColor: colors.white,
    borderColor: colors.brand,
  },

  addCard: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.brandTint,
    borderWidth: 1,
  },
  addHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  addIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  addActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: spacing.sm,
    flexShrink: 0,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  editBtn: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brandTint,
  },
  deleteBtn: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  btnPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.85,
  },
  editSheetContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  editSheetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
