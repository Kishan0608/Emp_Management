import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PasscodeSetup } from '@/components/PasscodeSetup';
import { PatternSetup } from '@/components/PatternSetup';
import { AppSwitch, Button, Card, Divider, IconTile, PageHeader, Screen, SectionTitle, Sheet, type IconName } from '@/components/ui';
import { getAppLockSupport, type AppLockSupport } from '@/lib/appLock';
import type { AppLockType } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, spacing, type } from '@/theme/tokens';

export default function AppLockSettingsScreen() {
  const toast = useToast();
  const { appLockEnabled, appLockType, hasConfiguredPasscode, hasConfiguredPattern, chooseAppLockMethod, disableAppLock, testAppLock } = useAuth();

  const [support, setSupport] = useState<AppLockSupport | null>(null);
  const [busy, setBusy] = useState(false);
  /** Switch turned on but no method picked yet: the list is unlocked, App Lock itself is not on until a method is chosen. */
  const [pending, setPending] = useState(false);
  const [setupSheet, setSetupSheet] = useState<'passcode' | 'pattern' | null>(null);

  useEffect(() => {
    getAppLockSupport().then(setSupport).catch(() => {});
  }, []);

  const switchOn = appLockEnabled || pending;
  const selected: AppLockType | null = appLockEnabled ? appLockType : null;
  const bioName = support?.method ?? 'Fingerprint';

  const isReady = (t: AppLockType) =>
    t === 'passcode' ? hasConfiguredPasscode : t === 'pattern' ? hasConfiguredPattern : !!support?.available;

  const choose = async (t: AppLockType) => {
    if (busy) return;
    // PIN and pattern must be drawn/typed first; the sheet finishes the choice when saved.
    if ((t === 'passcode' || t === 'pattern') && !isReady(t)) {
      setSetupSheet(t);
      return;
    }
    setBusy(true);
    try {
      const err = await chooseAppLockMethod(t);
      if (err) return toast(err, 'error');
      setPending(false);
      toast(`App lock on · ${t === 'passcode' ? '4-digit PIN' : t === 'pattern' ? 'Pattern' : bioName}`, 'success');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (on: boolean) => {
    if (busy) return;
    if (!on) {
      setPending(false);
      if (!appLockEnabled) return;
      setBusy(true);
      try {
        await disableAppLock();
        toast('App lock turned off');
      } catch {
        toast('Could not turn off app lock', 'error');
      } finally {
        setBusy(false);
      }
      return;
    }
    // Turning on: reuse the last method if it is still usable, otherwise ask for one.
    if (isReady(appLockType)) await choose(appLockType);
    else setPending(true);
  };

  const finishSetup = async (t: 'passcode' | 'pattern') => {
    setSetupSheet(null);
    setBusy(true);
    try {
      await chooseAppLockMethod(t); // makes it the only method (turns biometric off)
      setPending(false);
      toast(t === 'passcode' ? 'PIN saved · App lock on' : 'Pattern saved · App lock on', 'success');
    } finally {
      setBusy(false);
    }
  };

  const methods: { type: AppLockType; icon: IconName; title: string; subtitle: string; disabledReason?: string }[] = [
    {
      type: 'biometric',
      icon: support?.icon ?? 'finger-print',
      title: bioName,
      subtitle: 'Unlock with your fingerprint or face',
      disabledReason: support && !support.available ? (support.reason ?? 'Not available on this device') : undefined,
    },
    {
      type: 'passcode',
      icon: 'keypad-outline',
      title: '4-digit PIN',
      subtitle: hasConfiguredPasscode ? 'Set up' : 'Not set up · tap to create',
    },
    {
      type: 'pattern',
      icon: 'grid-outline',
      title: '3×3 Pattern',
      subtitle: hasConfiguredPattern ? 'Set up' : 'Not set up · tap to draw',
    },
  ];

  return (
    <>
      <Screen
        header={
          <PageHeader
            title="App Lock"
            subtitle={appLockEnabled ? 'On' : pending ? 'Choose a lock method' : 'Off'}
            right={
              <AppSwitch
                value={switchOn}
                disabled={busy}
                onValueChange={toggle}
              />
            }
          />
        }>
        <View style={{ gap: spacing.md }}>
          <SectionTitle title="Lock method" />
          <Card padded={false} style={!switchOn && styles.dimmed}>
            {methods.map((m, i) => {
              const disabled = !switchOn || busy || !!m.disabledReason;
              const isSelected = selected === m.type;
              return (
                <View key={m.type}>
                  {i > 0 && <Divider inset={64} />}
                  <Pressable
                    onPress={() => choose(m.type)}
                    disabled={disabled}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected, disabled }}
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }, m.disabledReason && switchOn && styles.dimmed]}>
                    <IconTile
                      icon={m.icon}
                      color={isSelected ? colors.brand : colors.textMuted}
                      bg={isSelected ? colors.brandSoft : colors.surfaceAlt}
                      size={36}
                    />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={type.bodyMedium}>{m.title}</Text>
                      <Text style={type.small}>{m.disabledReason ?? m.subtitle}</Text>
                    </View>
                    <Ionicons
                      name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={isSelected ? colors.brand : colors.borderStrong}
                    />
                  </Pressable>
                </View>
              );
            })}
          </Card>

          {appLockEnabled && (selected === 'passcode' || selected === 'pattern') && (
            <Button
              title={selected === 'passcode' ? 'Change PIN' : 'Change pattern'}
              icon={selected === 'passcode' ? 'keypad' : 'grid'}
              variant="secondary"
              full
              onPress={() => setSetupSheet(selected)}
            />
          )}
          {appLockEnabled && <Button title="Lock app now" icon="lock-closed" variant="secondary" full onPress={testAppLock} />}
        </View>
      </Screen>

      <Sheet visible={setupSheet === 'passcode'} onClose={() => setSetupSheet(null)} title="Set 4-digit PIN">
        <View style={styles.sheetBody}>
          <PasscodeSetup offerBiometrics={false} onDone={() => finishSetup('passcode')} />
        </View>
      </Sheet>

      <Sheet visible={setupSheet === 'pattern'} onClose={() => setSetupSheet(null)} title="Set 3×3 pattern">
        <View style={styles.sheetBody}>
          <PatternSetup offerBiometrics={false} onDone={() => finishSetup('pattern')} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  dimmed: { opacity: 0.5 },
  sheetBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
});
