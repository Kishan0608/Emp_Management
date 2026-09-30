import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, Text, View } from 'react-native';

import { BrandTile } from '@/components/brand/SkflLogo';
import { COMPANY } from '@/components/brand/skflPaths';
import { PrivacyNotice } from '@/components/PrivacyNotice';
import { Avatar, Badge, Card, Divider, HeroHeader, IconTile, ListRow, Screen, SectionTitle, Sheet, type IconName } from '@/components/ui';
import { getAppLockSupport, lockSupported, type AppLockSupport } from '@/lib/appLock';
import { roleLabel } from '@/lib/format';
import { useAuth, useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
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
  const { signOut } = useAuth();
  const { me, department, manager, isBoss, isHR } = useMe();
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
    ...(isBoss ? [{ icon: 'eye-outline' as const, label: 'Visibility settings', hint: 'Who sees which employee details', href: '/admin/visibility' as Href }] : []),
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
        {lockSupported && (
          <>
            <AppLockRow />
            <View style={{ height: spacing.md }} />
          </>
        )}
        {renderItems([
          ...(lockSupported ? [{ icon: 'keypad-outline' as const, label: 'Change passcode', hint: 'The 4-digit code that opens SKFL', href: '/change-passcode' as Href }] : []),
          { icon: 'document-lock-outline', label: 'Privacy notice', hint: 'DPDP Act, 2023', onPress: () => setPrivacy(true) },
          {
            icon: 'log-out-outline',
            label: 'Sign out',
            hint: 'Signs out this phone only',
            tint: colors.warning,
            bg: colors.warningSoft,
            onPress: () => confirm('Sign out?', 'You will need your email and password to sign in again. Your passcode and fingerprint stay set up on this phone.', () => signOut(false)),
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

/** Fingerprint / face switch; the passcode always works as a backup. */
function AppLockRow() {
  const { appLockEnabled, setAppLock } = useAuth();
  const toast = useToast();
  const [support, setSupport] = useState<AppLockSupport | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAppLockSupport().then(setSupport).catch(() => {});
  }, []);

  const unavailable = support != null && !support.available;
  return (
    <Card style={styles.lockRow}>
      <IconTile icon={support?.icon ?? 'finger-print'} color={colors.brand} bg={colors.brandSoft} size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.bodyMedium}>{support?.method ?? 'Fingerprint'} unlock</Text>
        <Text style={type.small}>
          {unavailable
            ? support?.reason
            : appLockEnabled
              ? 'On · passcode works as a backup'
              : `Open SKFL with ${(support?.method ?? 'fingerprint').toLowerCase()} instead of your passcode`}
        </Text>
      </View>
      <Switch
        value={appLockEnabled}
        disabled={busy || unavailable}
        onValueChange={async (on) => {
          setBusy(true);
          try {
            const err = await setAppLock(on);
            if (err) toast(err, 'error');
            else toast(on ? `${support?.method ?? 'Fingerprint'} unlock is on` : `${support?.method ?? 'Fingerprint'} unlock is off`);
          } finally {
            setBusy(false);
          }
        }}
        trackColor={{ true: colors.brand, false: colors.borderStrong }}
        thumbColor={colors.white}
        accessibilityLabel="App lock"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  profile: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  brandFoot: { alignItems: 'center', gap: 6, marginTop: spacing.xxxl },
  brandName: { ...type.h3, marginTop: spacing.sm },
  version: { ...type.small, textAlign: 'center', color: colors.textMuted },
});
