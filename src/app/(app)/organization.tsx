import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  PageHeader,
  Screen,
  SectionTitle,
  TextField,
} from '@/components/ui';
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

  const handleSelect = async (org: Organization | null) => {
    const key = org ? org.id : 'all';
    setSwitchingId(key);
    try {
      await setSelectedOrg(org);
      toast(org ? `Switched active company to ${org.name}` : 'Showing consolidated view (All Companies)');
    } finally {
      setSwitchingId(null);
    }
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
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setCreating(false);
    }
  };

  const isAllActive = selectedOrg === null;

  return (
    <Screen
      refreshing={loading}
      onRefresh={refreshOrganizations}
      header={
        <PageHeader
          title="Organizations"
          subtitle={isBoss ? 'Switch workspace or manage company entities' : 'Active organization workspace'}
        />
      }>
      <View style={{ gap: spacing.lg }}>
        {/* Active Workspace Banner */}
        <Card style={styles.activeBanner}>
          <View style={styles.activeBannerTop}>
            <View style={styles.activeIconContainer}>
              <Ionicons name={selectedOrg ? 'business' : 'globe'} size={24} color={colors.brand} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.activeBadgeText}>CURRENT ACTIVE WORKSPACE</Text>
                <Badge label="Active" tone="brand" />
              </View>
              <Text style={[type.h2, { color: colors.text, fontSize: 18 }]} numberOfLines={1}>
                {selectedOrg ? selectedOrg.name : 'All Companies (Consolidated)'}
              </Text>
            </View>
          </View>
          <Text style={[type.small, { color: colors.textSecondary, lineHeight: 18 }]}>
            {selectedOrg
              ? `Tasks, people directory, attendance, and analytics are currently filtered exclusively for ${selectedOrg.name}.`
              : 'Tasks, employee attendance, and organizational reports are aggregated across all registered companies.'}
          </Text>
        </Card>

        {/* Company Switcher List */}
        <SectionTitle
          title={`Available Entities · ${organizations.length + 1}`}
        />

        <View style={{ gap: spacing.md }}>
          {/* Consolidated 'All Companies' Option */}
          <Card
            onPress={() => handleSelect(null)}
            style={[
              styles.entityCard,
              isAllActive && styles.entityCardActive,
            ]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}>
              <View style={[styles.entityIconCircle, isAllActive && styles.entityIconCircleActive]}>
                <Ionicons name="globe-outline" size={22} color={isAllActive ? colors.brand : colors.textMuted} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[type.bodyMedium, { fontFamily: fonts.bold, fontSize: 15 }]}>All Companies</Text>
                  {isAllActive && <Badge label="Selected" tone="brand" icon="checkmark-circle" />}
                </View>
                <Text style={[type.small, { color: colors.textSecondary }]}>
                  Unified group-wide consolidated overview
                </Text>
              </View>
            </View>

            <View style={{ marginLeft: spacing.sm }}>
              {isAllActive ? (
                <View style={styles.checkCircle}>
                  <Ionicons name="checkmark" size={16} color={colors.white} />
                </View>
              ) : (
                <Button
                  title="Switch"
                  variant="outline"
                  size="sm"
                  loading={switchingId === 'all'}
                  onPress={() => handleSelect(null)}
                />
              )}
            </View>
          </Card>

          {/* Individual Companies */}
          {organizations.map((org) => {
            const isSelected = selectedOrg?.id === org.id;
            return (
              <Card
                key={org.id}
                onPress={() => handleSelect(org)}
                style={[
                  styles.entityCard,
                  isSelected && styles.entityCardActive,
                ]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}>
                  <View style={[styles.entityIconCircle, isSelected && styles.entityIconCircleActive]}>
                    <Ionicons name="business-outline" size={22} color={isSelected ? colors.brand : colors.textMuted} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[type.bodyMedium, { fontFamily: fonts.bold, fontSize: 15 }]} numberOfLines={1}>
                        {org.name}
                      </Text>
                      {isSelected && <Badge label="Selected" tone="brand" icon="checkmark-circle" />}
                    </View>
                    <Text style={[type.small, { color: colors.textSecondary }]}>
                      Active registered business entity
                    </Text>
                  </View>
                </View>

                <View style={{ marginLeft: spacing.sm }}>
                  {isSelected ? (
                    <View style={styles.checkCircle}>
                      <Ionicons name="checkmark" size={16} color={colors.white} />
                    </View>
                  ) : (
                    <Button
                      title="Switch"
                      variant="outline"
                      size="sm"
                      loading={switchingId === org.id}
                      onPress={() => handleSelect(org)}
                    />
                  )}
                </View>
              </Card>
            );
          })}
        </View>

        {/* Boss-only: Add New Company Section */}
        {isBoss && (
          <>
            <SectionTitle title="Add Organization" />
            <Card style={styles.addCard}>
              <View style={styles.addHeader}>
                <View style={styles.addIconCircle}>
                  <Ionicons name="add-circle-outline" size={22} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.h3, { fontSize: 16 }]}>Register New Company</Text>
                  <Text style={[type.small, { color: colors.textSecondary }]}>
                    Newly added companies will immediately appear in employee onboarding and filtering.
                  </Text>
                </View>
              </View>

              <TextField
                label="Company Name"
                placeholder="e.g. Shree Karni Fabcom Ltd"
                value={newOrgName}
                onChangeText={setNewOrgName}
                icon="business-outline"
                autoCapitalize="words"
              />

              <Button
                title="Create Company Entity"
                icon="add"
                variant="primary"
                loading={creating}
                disabled={newOrgName.trim().length < 2}
                onPress={handleCreate}
                style={{ marginTop: spacing.xs }}
              />
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  activeBanner: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.brandTint,
    borderWidth: 1.5,
  },
  activeBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  activeIconContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.brandTint,
  },
  activeBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.brandDark,
    letterSpacing: 0.8,
  },
  entityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  entityCardActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  entityIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  entityIconCircleActive: {
    backgroundColor: colors.white,
    borderColor: colors.brand,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCard: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  addHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  addIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
