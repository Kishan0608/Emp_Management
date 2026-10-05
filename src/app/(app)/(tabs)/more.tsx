import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { BrandTile } from '@/components/brand/SkflLogo';
import { COMPANY } from '@/components/brand/skflPaths';
import { PrivacyNotice } from '@/components/PrivacyNotice';
import {
  Avatar,
  Badge,
  Card,
  Divider,
  HeroHeader,
  IconTile,
  ListRow,
  Screen,
  SectionTitle,
  Sheet,
  type IconName,
} from '@/components/ui';
import { roleLabel } from '@/lib/format';
import { useAuth, useMe } from '@/providers/AuthProvider';
import { useOrganization } from '@/providers/OrganizationProvider';
import { colors, spacing, type } from '@/theme/tokens';

interface Item {
  icon: IconName;
  label: string;
  hint?: string;
  href?: Href;
  onPress?: () => void;
  tint?: string;
  bg?: string;
}

export default function More() {
  const { signOut, appLockEnabled, appLockType, biometricEnabled } = useAuth();
  const { me, department, manager, organization, isBoss, isHR, isManager, leads_team } = useMe();
  const { selectedOrg } = useOrganization();
  const [privacy, setPrivacy] = useState(false);

  const confirm = (title: string, message: string, fn: () => void) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) fn();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: fn },
    ]);
  };

  const general: Item[] = [
    { icon: 'person-circle-outline', label: 'My profile', hint: 'Phone, email, address, joining date', href: `/people/${me.id}` },
    { icon: 'people-outline', label: 'People directory', href: '/people' },
  ];
  const admin: Item[] = [
    ...(isBoss ? [{
      icon: 'business-outline' as const,
      label: 'Organization',
      hint: selectedOrg ? `${selectedOrg.name} (Active)` : 'All companies (Consolidated)',
      href: '/organization' as Href,
    }] : []),
    ...(isBoss ? [{ icon: 'eye-outline' as const, label: 'Visibility settings', hint: 'Who sees which employee details', href: '/admin/visibility' as Href }] : []),
    ...(isBoss || isHR ? [{ icon: 'calendar-outline' as const, label: 'Attendance', hint: 'All employees · salary', href: '/admin/attendance' as Href }] : []),
    ...(isBoss || isHR || isManager || leads_team ? [{ icon: 'navigate-outline' as const, label: 'Live locations', hint: isBoss || isHR ? 'Everyone sharing location' : 'Your team', href: '/admin/location' as Href }] : []),
    ...(isBoss || isHR ? [{ icon: 'bar-chart-outline' as const, label: 'Analytics & exports', href: '/admin/analytics' as Href }] : []),
    ...(isBoss ? [{ icon: 'settings-outline' as const, label: 'Company settings', hint: 'Thresholds, retention, security', href: '/admin/settings' as Href }] : []),
    ...(isBoss ? [{ icon: 'receipt-outline' as const, label: 'Audit log', href: '/admin/audit' as Href }] : []),
  ];

  const renderItems = (items: Item[]) => (
    <Card padded={false}>
      {items.map((it, i) => (
        <View key={it.label}>
          {i > 0 && <Divider inset={64} />}
          <ListRow
            left={<IconTile icon={it.icon} color={it.tint ?? colors.brand} bg={it.bg ?? colors.brandSoft} size={36} />}
            title={it.label}
            subtitle={it.hint}
            onPress={it.onPress ?? (() => it.href && router.push(it.href))}
          />
        </View>
      ))}
    </Card>
  );

  return (
    <>
      <Screen header={<HeroHeader title="More" subtitle="Account & administration" />}>
        <Card style={styles.profile} onPress={() => router.push(`/people/${me.id}`)}>
          <Avatar name={me.full_name} id={me.id} size={56} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={type.h2}>{me.full_name}</Text>
            <Text style={type.small}>{me.email}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Badge label={roleLabel[me.role]} tone="brand" />
              {organization && <Badge label={organization.name} tone="info" icon="business" />}
              {department && <Badge label={department} />}
            </View>
            {manager && <Text style={type.small}>Reports to {manager}</Text>}
          </View>
        </Card>

        <SectionTitle title="General" />
        {renderItems(general)}

        {admin.length > 0 && (
          <>
            <SectionTitle title="Administration" />
            {renderItems(admin)}
          </>
        )}

        <SectionTitle title="Privacy & security" />
        <Card style={styles.appLockCard} onPress={() => router.push('/app-lock')}>
          <View style={styles.appLockCardRow}>
            <IconTile
              icon={appLockEnabled ? 'shield-checkmark' : 'shield-outline'}
              color={appLockEnabled ? colors.brand : colors.textMuted}
              bg={appLockEnabled ? colors.brandSoft : colors.surfaceAlt}
              size={40}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={type.bodyMedium}>App Lock</Text>
                <Badge
                  label={appLockEnabled ? (appLockType === 'pattern' ? 'Pattern' : appLockType === 'biometric' ? 'Fingerprint' : 'PIN') : 'Off'}
                  tone={appLockEnabled ? 'brand' : 'neutral'}
                />
              </View>
              <Text style={type.small}>
                {appLockEnabled
                  ? `On · ${appLockType === 'pattern' ? '3×3 pattern' : appLockType === 'biometric' ? 'Fingerprint / face' : '4-digit PIN'}${biometricEnabled && appLockType !== 'biometric' ? ' + biometrics' : ''}`
                  : 'Disabled · Email & password protected only'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Card>

        <View style={{ height: spacing.sm }} />

        {renderItems([
          {
            icon: 'navigate-outline',
            label: 'Location sharing',
            hint: me.location_sharing_enabled ? 'On · visible to Boss, HR and your managers' : 'Off',
            href: '/location-sharing' as Href,
          },
          {
            icon: 'lock-closed-outline',
            label: 'App lock settings',
            hint: 'Manage PIN, pattern, and biometrics',
            href: '/app-lock' as Href,
          },
          { icon: 'document-lock-outline', label: 'Privacy notice', hint: 'DPDP Act, 2023', onPress: () => setPrivacy(true) },
          {
            icon: 'log-out-outline',
            label: 'Sign out',
            hint: 'Signs out this phone only',
            tint: colors.warning,
            bg: colors.warningSoft,
            onPress: () => confirm('Sign out?', 'You will need your email and password to sign in again.', () => signOut(false)),
          },
        ])}

        <View style={styles.brandFoot}>
          <BrandTile size={44} />
          <Text style={styles.brandName}>{COMPANY.name}</Text>
          <Text style={styles.version}>
            {COMPANY.short} · v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>
      </Screen>

      <Sheet visible={privacy} onClose={() => setPrivacy(false)} title="Privacy notice">
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
          <PrivacyNotice />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  appLockCard: { paddingVertical: spacing.md },
  appLockCardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  profile: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  brandFoot: { alignItems: 'center', gap: 6, marginTop: spacing.xxxl },
  brandName: { ...type.h3, marginTop: spacing.sm },
  version: { ...type.small, textAlign: 'center', color: colors.textMuted },
});
