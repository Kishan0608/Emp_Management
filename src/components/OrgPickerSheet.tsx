import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Divider, Sheet, TextField } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import type { Organization } from '@/lib/types';
import { useOrganization } from '@/providers/OrganizationProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

export function OrgPickerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { organizations, selectedOrg, setSelectedOrg, refreshOrganizations } = useOrganization();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSelect = async (org: Organization | null) => {
    await setSelectedOrg(org);
    toast(org ? `Switched to ${org.name}` : 'Showing all companies');
    onClose();
  };

  const handleCreate = async () => {
    if (newOrgName.trim().length < 2) return;
    setBusy(true);
    try {
      await api.createOrganization(newOrgName.trim());
      await refreshOrganizations();
      toast(`Created ${newOrgName.trim()}`);
      setNewOrgName('');
      setAdding(false);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Select Company">
      <View style={{ gap: spacing.md, maxHeight: 440 }}>
        <Text style={[type.small, { color: colors.textSecondary }]}>
          Switch company to filter tasks, attendance, reports, and team pulse data.
        </Text>

        <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.list}>
            {/* All Companies option */}
            <Pressable
              onPress={() => handleSelect(null)}
              style={({ pressed }) => [styles.item, selectedOrg === null && styles.itemActive, pressed && styles.itemPressed]}>
              <View style={[styles.iconWrap, selectedOrg === null && styles.iconWrapActive]}>
                <Ionicons name="globe-outline" size={20} color={selectedOrg === null ? colors.brand : colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, selectedOrg === null && styles.nameActive]}>All Companies</Text>
                <Text style={styles.hint}>Consolidated view of all data</Text>
              </View>
              {selectedOrg === null && <Ionicons name="checkmark-circle" size={20} color={colors.brand} />}
            </Pressable>

            {/* Organizations list */}
            {organizations.map((org) => {
              const isSelected = selectedOrg?.id === org.id;
              return (
                <View key={org.id}>
                  <Divider inset={52} />
                  <Pressable
                    onPress={() => handleSelect(org)}
                    style={({ pressed }) => [styles.item, isSelected && styles.itemActive, pressed && styles.itemPressed]}>
                    <View style={[styles.iconWrap, isSelected && styles.iconWrapActive]}>
                      <Ionicons name="business" size={20} color={isSelected ? colors.brand : colors.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, isSelected && styles.nameActive]}>{org.name}</Text>
                      <Text style={styles.hint}>Active company</Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark-circle" size={20} color={colors.brand} />}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {adding ? (
          <View style={styles.addBox}>
            <TextField
              label="New Company Name"
              placeholder="e.g. Acme Textiles Pvt Ltd"
              value={newOrgName}
              onChangeText={setNewOrgName}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.sm }}>
              <Button title="Cancel" variant="ghost" size="sm" onPress={() => setAdding(false)} />
              <Button title="Add Company" size="sm" loading={busy} disabled={newOrgName.trim().length < 2} onPress={handleCreate} />
            </View>
          </View>
        ) : (
          <Button
            title="Add new company"
            icon="add-circle-outline"
            variant="outline"
            size="md"
            onPress={() => setAdding(true)}
          />
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  itemActive: {
    backgroundColor: colors.brandSoft,
  },
  itemPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: colors.brandTint,
  },
  name: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text,
  },
  nameActive: {
    fontFamily: fonts.bold,
    color: colors.brand,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  addBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    gap: spacing.xs,
  },
});
