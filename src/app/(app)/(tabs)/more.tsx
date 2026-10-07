import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { BrandTile } from '@/components/brand/SkflLogo';
import { COMPANY } from '@/components/brand/skflPaths';
import {
  AppSwitch,
  Avatar,
  Badge,
  Card,
  Divider,
  HeroHeader,
  IconTile,
  ListRow,
  Screen,
  SectionTitle,
  type IconName,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { roleLabel } from '@/lib/format';
import {
  getLocationAccess,
  requestLocationAccess,
  startLocationTracking,
  stopLocationTracking,
  syncLocationTracking,
} from '@/lib/location';
import { useAuth, useMe } from '@/providers/AuthProvider';
import { useOrganization } from '@/providers/OrganizationProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, spacing, type } from '@/theme/tokens';

interface Item {
  icon: IconName;
  label: string;
  hint?: string | null;
  href?: Href;
  onPress?: () => void;
  tint?: string;
  bg?: string;
  right?: ReactNode;
  chevron?: boolean;
}

/** Android 11+ sends the person to a settings page for "all the time"; say what to pick before it opens. */
function explainBackground(): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      'Location access',
      Platform.OS === 'android'
        ? 'Your phone will open a settings page. Choose "Allow all the time" so your location keeps updating when SKFL is closed.'
        : 'Next, choose "Change to Always Allow" so your location keeps updating when SKFL is closed.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

export default function More() {
  const { signOut, refresh, appLockEnabled, appLockType, biometricEnabled } = useAuth();
  const { me, department, manager, organization, isBoss, isHR, isManager, leads_team } = useMe();
  const { selectedOrg } = useOrganization();
  const toast = useToast();
  const [locationBusy, setLocationBusy] = useState(false);
  // Where the switch is heading while turning sharing on / off, so it moves on the first tap.
  const [sharingTarget, setSharingTarget] = useState<boolean | null>(null);
  const sharingOn = sharingTarget ?? !!me.location_sharing_enabled;

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

  const toggleLocationSharing = async (next: boolean) => {
    if (locationBusy) return;
    if (Platform.OS === 'web') {
      toast('Location sharing works in the mobile app', 'info');
      return;
    }
    setLocationBusy(true);
    setSharingTarget(next);
    try {
      if (next) {
        const current = await getLocationAccess();
        if (!current.background && !(await explainBackground())) return;
        const result = await requestLocationAccess();
        if (result === 'foreground_denied') {
          toast('Allow location access to turn sharing on', 'error');
          return;
        }
        if (result === 'background_denied') {
          toast('Choose "Allow all the time" in phone settings so sharing works with the app closed', 'error');
          return;
        }
        await api.setLocationSharing(true);
        await startLocationTracking();
        await syncLocationTracking(true);
        toast('Location sharing is on');
      } else {
        await api.setLocationSharing(false);
        await stopLocationTracking();
        toast('Location sharing is off');
      }
      await refresh();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setLocationBusy(false);
      setSharingTarget(null);
    }
  };

  const general: Item[] = [
    { icon: 'person-circle-outline', label: 'My profile', hint: 'Phone, email, address, joining date', href: `/people/${me.id}` },
    { icon: 'people-outline', label: 'People directory', href: '/people' },
    ...(isBoss ? [] : [{ icon: 'document-text-outline' as const, label: 'Daily work log', hint: 'What you worked on each day', href: '/work-log' as Href }]),
  ];

  const admin: Item[] = [
    ...(isBoss ? [{
      icon: 'business-outline' as const,
      label: 'Organization',
      hint: selectedOrg ? `${selectedOrg.name} (Active)` : 'All companies (Consolidated)',
      href: '/organization' as Href,
    }] : []),
    ...(isBoss ? [{ icon: 'eye-outline' as const, label: 'Visibility settings', hint: 'Who sees which employee details', href: '/admin/visibility' as Href }] : []),
    ...(isBoss || isHR || isManager || leads_team ? [{ icon: 'navigate-outline' as const, label: 'Live locations', hint: isBoss || isHR ? 'Everyone sharing location' : 'Your team', href: '/admin/location' as Href }] : []),
    ...(isBoss || isHR ? [{ icon: 'bar-chart-outline' as const, label: 'Analytics', hint: 'Company metrics & task distribution', href: '/admin/analytics' as Href }] : []),
    ...(isBoss ? [{ icon: 'file-tray-stacked-outline' as const, label: 'Departments', hint: 'View & add company departments', href: '/admin/departments' as Href }] : []),
    ...(isBoss ? [{ icon: 'receipt-outline' as const, label: 'Audit log', href: '/admin/audit' as Href }] : []),
  ];

  const security: Item[] = [
    {
      icon: 'key-outline',
      label: 'Change password',
      hint: 'Update your sign-in password',
      href: '/update-password' as Href,
    },
    {
      icon: 'navigate-outline',
      label: 'Location sharing',
      hint: locationBusy
        ? sharingTarget
          ? 'Turning on…'
          : 'Turning off…'
        : sharingOn
          ? 'On · visible to Boss, HR and managers'
          : 'Off',
      right: (
        <View pointerEvents="none">
          <AppSwitch
            value={sharingOn}
            disabled={locationBusy}
          />
        </View>
      ),
      onPress: () => toggleLocationSharing(!sharingOn),
      chevron: false,
    },
    {
      icon: 'lock-closed-outline',
      label: 'App lock settings',
      hint: appLockEnabled
        ? `${appLockType === 'pattern' ? 'Pattern' : appLockType === 'biometric' ? 'Fingerprint / face' : 'PIN'}${biometricEnabled && appLockType !== 'biometric' ? ' + biometrics' : ''} active`
        : 'Manage PIN, pattern, and biometrics',
      href: '/app-lock' as Href,
    },
    {
      icon: 'log-out-outline',
      label: 'Sign out',
      tint: colors.warning,
      bg: colors.warningSoft,
      onPress: () => confirm('Sign out?', 'You will need your email and password to sign in again.', () => signOut(false)),
    },
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
            right={it.right}
            chevron={it.chevron ?? (it.right ? false : !!(it.onPress || it.href))}
            onPress={it.onPress ?? (it.href ? () => router.push(it.href!) : undefined)}
          />
        </View>
      ))}
    </Card>
  );

  const activeOrg = isBoss && selectedOrg ? selectedOrg : organization;

  return (
    <Screen header={<HeroHeader title="More" subtitle="Account & administration" />}>
      <Card style={styles.profile} onPress={() => router.push(`/people/${me.id}`)}>
        <Avatar name={me.full_name} id={me.id} size={56} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={type.h2}>{me.full_name}</Text>
          <Text style={type.small}>{me.email}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Badge label={roleLabel[me.role]} tone="brand" />
            {activeOrg && <Badge label={activeOrg.name} tone="info" icon="business" />}
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
      {renderItems(security)}

      <View style={styles.brandFoot}>
        <BrandTile size={44} />
        <Text style={styles.brandName}>{COMPANY.name}</Text>
        <Text style={styles.version}>
          {COMPANY.short} · v{Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  brandFoot: { alignItems: 'center', gap: 6, marginTop: spacing.xxxl },
  brandName: { ...type.h3, marginTop: spacing.sm },
  version: { ...type.small, textAlign: 'center', color: colors.textMuted },
});
