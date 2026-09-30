import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInRight, ZoomIn } from 'react-native-reanimated';

import { Button } from '@/components/ui';
import { authenticate, getAppLockSupport, PASSCODE_LENGTH, type AppLockSupport } from '@/lib/appLock';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

import { Keypad, PasscodeDots } from './PasscodePad';

type Step = 'create' | 'confirm' | 'bio';

const WEAK = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '0123', '9876']);

/** Create → confirm a 4-digit passcode, then offer fingerprint / face unlock. */
export function PasscodeSetup({ offerBiometrics = true, onDone }: { offerBiometrics?: boolean; onDone?: () => void }) {
  const { savePasscode } = useAuth();
  const [step, setStep] = useState<Step>('create');
  const [first, setFirst] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [support, setSupport] = useState<AppLockSupport | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAppLockSupport().then(setSupport).catch(() => {});
  }, []);

  const fail = (msg: string) => {
    setPin('');
    setError(msg);
    setErrorKey((k) => k + 1);
  };

  const finish = async (pinToSave: string, bio?: boolean) => {
    setBusy(true);
    try {
      await savePasscode(pinToSave, bio);
      onDone?.();
    } catch {
      fail('Could not save the passcode. Try again.');
      setStep('create');
    } finally {
      setBusy(false);
    }
  };

  const onChange = (v: string) => {
    setPin(v);
    setError(null);
    if (v.length < PASSCODE_LENGTH) return;
    if (step === 'create') {
      if (WEAK.has(v)) return fail('Too easy to guess. Choose a different passcode.');
      setFirst(v);
      setPin('');
      setStep('confirm');
      return;
    }
    if (v !== first) {
      setFirst('');
      setStep('create');
      return fail('Passcodes did not match. Start again.');
    }
    if (offerBiometrics && support?.available) setStep('bio');
    else finish(v);
  };

  if (step === 'bio' && support) {
    return (
      <Animated.View key="bio" entering={FadeInRight.duration(300)} style={{ gap: spacing.lg, alignItems: 'center' }}>
        <Animated.View entering={ZoomIn.springify()} style={styles.bioCircle}>
          <Ionicons name={support.icon} size={46} color={colors.brand} />
        </Animated.View>
        <Text style={styles.title}>Use {support.method.toLowerCase()} too?</Text>
        <Text style={styles.sub}>Open SKFL with just a touch. Your passcode always works as a backup.</Text>
        <View style={{ alignSelf: 'stretch', gap: spacing.sm }}>
          <Button
            title={`Turn on ${support.method.toLowerCase()}`}
            icon={support.icon}
            size="lg"
            loading={busy}
            onPress={async () => {
              const r = await authenticate(`Turn on ${support.method.toLowerCase()} unlock`);
              if (r.ok) finish(first, true);
              else if (r.error) setError(r.error);
            }}
          />
          <Button title="Not now" variant="ghost" disabled={busy} onPress={() => finish(first, false)} />
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </Animated.View>
    );
  }

  return (
    <Animated.View key={step} entering={FadeInRight.duration(300)} style={{ gap: spacing.lg, alignItems: 'center' }}>
      <View style={styles.stepRow}>
        {(['create', 'confirm'] as const).map((s, i) => (
          <View key={s} style={[styles.stepPill, step === s && styles.stepPillOn]}>
            <Text style={[styles.stepText, step === s && styles.stepTextOn]}>
              {i + 1}. {s === 'create' ? 'Create' : 'Confirm'}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.sub}>{step === 'create' ? `Choose a ${PASSCODE_LENGTH}-digit passcode to open SKFL quickly and securely.` : 'Enter the same passcode again.'}</Text>
      <PasscodeDots length={pin.length} tone="light" errorKey={errorKey} />
      <Text style={[styles.error, !error && { opacity: 0 }]}>{error ?? ' '}</Text>
      <Keypad value={pin} onChange={onChange} tone="light" disabled={busy} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stepRow: { flexDirection: 'row', gap: spacing.sm },
  stepPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  stepPillOn: { backgroundColor: colors.brandSoft, borderColor: colors.brandTint },
  stepText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted },
  stepTextOn: { color: colors.brand },
  title: { fontFamily: fonts.bold, fontSize: 19, color: colors.text, textAlign: 'center' },
  sub: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center', maxWidth: 300 },
  error: { fontFamily: fonts.semibold, fontSize: 13, color: colors.danger, textAlign: 'center', minHeight: 18 },
  bioCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.brandSoft, borderWidth: 1.5, borderColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
});
