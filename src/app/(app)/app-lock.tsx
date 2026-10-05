import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { PasscodeSetup } from '@/components/PasscodeSetup';
import { PatternSetup } from '@/components/PatternSetup';
import {
  Badge,
  Button,
  Card,
  Divider,
  IconTile,
  PageHeader,
  Screen,
  SectionTitle,
  Sheet,
} from '@/components/ui';
import { getAppLockSupport, type AppLockSupport } from '@/lib/appLock';
import type { AppLockType } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

export default function AppLockSettingsScreen() {
  const toast = useToast();
  const {
    appLockEnabled,
    appLockType,
    biometricEnabled,
    hasConfiguredPasscode,
    hasConfiguredPattern,
    setAppLock,
    setAppLockTypePref,
    setBiometricPref,
    disableAppLock,
    testAppLock,
  } = useAuth();

  const [support, setSupport] = useState<AppLockSupport | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [showPatternModal, setShowPatternModal] = useState(false);

  useEffect(() => {
    getAppLockSupport().then(setSupport).catch(() => {});
  }, []);

  const handleMasterToggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        // If enabling and neither passcode nor pattern is configured, prompt passcode first
        if (!hasConfiguredPasscode && !hasConfiguredPattern) {
          setShowPasscodeModal(true);
          return;
        }
        await setAppLock(true);
        toast('App lock enabled', 'success');
      } else {
        await disableAppLock();
        toast('App lock disabled. Protected with email & password only.');
      }
    } catch {
      toast('Failed to update app lock settings', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSelectPrimary = async (type: AppLockType) => {
    if (type === 'passcode' && !hasConfiguredPasscode) {
      setShowPasscodeModal(true);
      return;
    }
    if (type === 'pattern' && !hasConfiguredPattern) {
      setShowPatternModal(true);
      return;
    }
    try {
      await setAppLockTypePref(type);
      toast(`Primary lock set to ${type === 'passcode' ? 'PIN' : 'Pattern'}`, 'success');
    } catch {
      toast('Failed to change primary lock method', 'error');
    }
  };

  const handleBiometricToggle = async (on: boolean) => {
    setBusy(true);
    try {
      const err = await setBiometricPref(on);
      if (err) {
        toast(err, 'error');
      } else {
        toast(
          on
            ? `${support?.method ?? 'Fingerprint'} unlock enabled`
            : `${support?.method ?? 'Fingerprint'} unlock disabled`
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Screen header={<PageHeader title="App Lock" subtitle="Passcode, pattern, and biometrics" />}>
        {/* Master App Lock Toggle */}
        <Card style={styles.masterCard}>
          <View style={styles.masterRow}>
            <IconTile
              icon={appLockEnabled ? 'shield-checkmark' : 'shield-outline'}
              color={appLockEnabled ? colors.brand : colors.textMuted}
              bg={appLockEnabled ? colors.brandSoft : colors.surfaceAlt}
              size={44}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={type.h3}>Enable App Lock</Text>
                <Badge
                  label={appLockEnabled ? 'Active' : 'Disabled'}
                  tone={appLockEnabled ? 'brand' : 'neutral'}
                />
              </View>
              <Text style={type.small}>
                {appLockEnabled
                  ? 'App requires unlock on open or after 15s in background'
                  : 'Turn on extra PIN, pattern, or biometric security'}
              </Text>
            </View>
            <Switch
              value={appLockEnabled}
              disabled={busy}
              onValueChange={handleMasterToggle}
              trackColor={{ true: colors.brand, false: colors.borderStrong }}
              thumbColor={colors.white}
              accessibilityLabel="Toggle app lock"
            />
          </View>
        </Card>

        {/* State 1: App Lock Disabled */}
        {!appLockEnabled && (
          <Card style={styles.disabledBanner}>
            <View style={styles.bannerHeader}>
              <IconTile icon="lock-open-outline" color={colors.warning} bg={colors.warningSoft} size={36} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.bodyMedium}>Email & Password Protected</Text>
                <Text style={type.small}>
                  App lock is currently off. When you log in, you will sign in with your email and password only.
                  No passcode, pattern, or fingerprint prompts will block you.
                </Text>
              </View>
            </View>
            <Divider />
            <Text style={[type.small, { color: colors.textSecondary }]}>
              Want faster or more secure phone access? Turn on App Lock above to set a 4-digit PIN, 3x3 pattern, or fingerprint.
            </Text>
          </Card>
        )}

        {/* State 2: App Lock Enabled - 3 Features */}
        {appLockEnabled && (
          <>
            <SectionTitle title="App Lock Methods (3 Features)" />

            {/* Feature 1: Passcode (PIN) */}
            <Card style={styles.featureCard}>
              <View style={styles.featureHeader}>
                <IconTile icon="keypad-outline" color={colors.brand} bg={colors.brandSoft} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={type.bodyMedium}>1. 4-Digit Passcode (PIN)</Text>
                    {appLockType === 'passcode' && <Badge label="Primary" tone="brand" />}
                  </View>
                  <Text style={type.small}>
                    {hasConfiguredPasscode ? 'Configured and ready' : 'Not configured yet'}
                  </Text>
                </View>
                {appLockType !== 'passcode' && hasConfiguredPasscode && (
                  <Button
                    title="Set Primary"
                    size="sm"
                    variant="ghost"
                    onPress={() => handleSelectPrimary('passcode')}
                  />
                )}
              </View>

              <View style={styles.actionRow}>
                <Button
                  title={hasConfiguredPasscode ? 'Change PIN' : 'Set up PIN'}
                  variant={hasConfiguredPasscode ? 'secondary' : 'primary'}
                  size="sm"
                  icon="keypad"
                  onPress={() => setShowPasscodeModal(true)}
                />
              </View>
            </Card>

            {/* Feature 2: 3x3 Pattern Lock */}
            <Card style={styles.featureCard}>
              <View style={styles.featureHeader}>
                <IconTile icon="grid-outline" color={colors.brand} bg={colors.brandSoft} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={type.bodyMedium}>2. 3x3 Pattern Lock</Text>
                    {appLockType === 'pattern' && <Badge label="Primary" tone="brand" />}
                  </View>
                  <Text style={type.small}>
                    {hasConfiguredPattern ? 'Pattern is configured' : 'Draw a 3x3 pattern of dots'}
                  </Text>
                </View>
                {appLockType !== 'pattern' && hasConfiguredPattern && (
                  <Button
                    title="Set Primary"
                    size="sm"
                    variant="ghost"
                    onPress={() => handleSelectPrimary('pattern')}
                  />
                )}
              </View>

              <View style={styles.actionRow}>
                <Button
                  title={hasConfiguredPattern ? 'Change Pattern' : 'Set up Pattern'}
                  variant={hasConfiguredPattern ? 'secondary' : 'primary'}
                  size="sm"
                  icon="grid"
                  onPress={() => setShowPatternModal(true)}
                />
              </View>
            </Card>

            {/* Feature 3: Biometrics (Fingerprint / Face ID) */}
            <Card style={styles.featureCard}>
              <View style={styles.featureHeader}>
                <IconTile
                  icon={support?.icon ?? 'finger-print'}
                  color={colors.brand}
                  bg={colors.brandSoft}
                  size={40}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.bodyMedium}>3. {support?.method ?? 'Fingerprint'} Unlock</Text>
                  <Text style={type.small}>
                    {support?.available
                      ? 'Instant unlock with fingerprint/face. PIN or pattern remains as backup.'
                      : (support?.reason ?? 'Not available on this device')}
                  </Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  disabled={busy || !support?.available}
                  onValueChange={handleBiometricToggle}
                  trackColor={{ true: colors.brand, false: colors.borderStrong }}
                  thumbColor={colors.white}
                  accessibilityLabel="Biometric unlock switch"
                />
              </View>
            </Card>

            {/* Test App Lock */}
            <SectionTitle title="Lock Test & Demonstration" />
            <Card style={styles.testCard}>
              <View style={{ gap: 4 }}>
                <Text style={type.bodyMedium}>Test App Lock Screen</Text>
                <Text style={type.small}>
                  Verify that your {appLockType === 'pattern' ? 'Pattern' : 'Passcode'} and{' '}
                  {biometricEnabled ? 'Biometrics' : 'security'} work as expected.
                </Text>
              </View>
              <Button
                title="Lock App Now"
                icon="lock-closed"
                variant="secondary"
                onPress={testAppLock}
              />
            </Card>
          </>
        )}
      </Screen>

      {/* Passcode Setup Modal */}
      <Sheet
        visible={showPasscodeModal}
        onClose={() => setShowPasscodeModal(false)}
        title="Set 4-Digit Passcode"
      >
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xxl }}>
          <PasscodeSetup
            offerBiometrics={false}
            onDone={() => {
              setShowPasscodeModal(false);
              toast('Passcode saved successfully', 'success');
            }}
          />
        </View>
      </Sheet>

      {/* Pattern Setup Modal */}
      <Sheet
        visible={showPatternModal}
        onClose={() => setShowPatternModal(false)}
        title="Set 3x3 Pattern Lock"
      >
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xxl }}>
          <PatternSetup
            offerBiometrics={false}
            onDone={() => {
              setShowPatternModal(false);
              toast('Pattern saved successfully', 'success');
            }}
          />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  masterCard: {
    paddingVertical: spacing.md,
  },
  masterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  disabledBanner: {
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  featureCard: {
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  featureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  testCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
});
