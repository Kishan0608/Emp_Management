import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Keypad, PasscodeDots } from '@/components/PasscodePad';
import { PasscodeSetup } from '@/components/PasscodeSetup';
import { Card, PageHeader, Screen } from '@/components/ui';
import { authenticate, getAppLockSupport, PASSCODE_LENGTH, type AppLockSupport } from '@/lib/appLock';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

/**
 * Changing the passcode needs proof it's really the owner:
 * the current passcode, or (if forgotten) the phone's fingerprint / face.
 * Wrong passcodes count towards the same limit as the lock screen.
 */
export default function ChangePasscode() {
  const toast = useToast();
  const [verified, setVerified] = useState<{ old?: string } | null>(null);

  return (
    <Screen header={<PageHeader title="Change passcode" subtitle="Used to open SKFL on this phone" />}>
      <Card>
        {verified ? (
          <PasscodeSetup
            offerBiometrics={false}
            avoid={verified.old}
            onDone={() => {
              toast('Passcode changed');
              router.back();
            }}
          />
        ) : (
          <VerifyCurrent onVerified={(old) => setVerified({ old })} />
        )}
      </Card>
    </Screen>
  );
}

function VerifyCurrent({ onVerified }: { onVerified: (old?: string) => void }) {
  const { unlockWithPasscode, signOut } = useAuth();
  const [support, setSupport] = useState<AppLockSupport | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);

  useEffect(() => {
    getAppLockSupport().then(setSupport).catch(() => {});
  }, []);

  const onChange = async (v: string) => {
    setPin(v);
    setError(null);
    if (v.length < PASSCODE_LENGTH) return;
    setBusy(true);
    const r = await unlockWithPasscode(v); // signs out after too many wrong tries
    setBusy(false);
    if (r.ok) return onVerified(v);
    setPin('');
    setErrorKey((k) => k + 1);
    setError(r.attemptsLeft > 0 ? `Wrong passcode · ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left` : null);
  };

  const verifyWithBiometric = async () => {
    setError(null);
    const r = await authenticate('Verify it’s you to change your passcode');
    if (r.ok) onVerified();
    else if (r.error) setError(r.error);
  };

  const bio = !!support?.available;

  return (
    <View style={{ alignItems: 'center', gap: spacing.md }}>
      <View style={styles.progress}>
        <View style={[styles.seg, styles.segOn]} />
        <View style={styles.seg} />
      </View>
      <View style={styles.badge}>
        <Ionicons name="lock-closed" size={20} color={colors.brand} />
      </View>
      <Text style={styles.title}>Enter your current passcode</Text>
      <Text style={styles.sub}>To keep your account safe, confirm it’s you before setting a new one.</Text>
      <View style={styles.dotsBox}>
        <PasscodeDots length={pin.length} tone="light" errorKey={errorKey} />
      </View>
      <Text style={[styles.error, !error && { opacity: 0 }]}>{error ?? ' '}</Text>
      <Keypad
        value={pin}
        onChange={onChange}
        tone="light"
        disabled={busy}
        leftKey={bio ? { icon: support!.icon, label: `Verify with ${support!.method}`, onPress: verifyWithBiometric } : undefined}
      />
      {bio ? (
        <Pressable onPress={verifyWithBiometric} hitSlop={8} style={styles.linkRow}>
          <Ionicons name={support!.icon} size={16} color={colors.brand} />
          <Text style={styles.link}>Forgot passcode? Verify with {support!.method.toLowerCase()}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => signOut(false, 'Sign in with your email and password, then set a new passcode.', true)} hitSlop={8} style={styles.linkRow}>
          <Text style={styles.link}>Forgot passcode? Sign in with password</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: 6, alignSelf: 'stretch' },
  seg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  segOn: { backgroundColor: colors.gold },
  badge: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  dotsBox: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  title: { fontFamily: fonts.bold, fontSize: 19, color: colors.text, textAlign: 'center' },
  sub: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center', maxWidth: 300 },
  error: { fontFamily: fonts.semibold, fontSize: 13, color: colors.danger, textAlign: 'center', minHeight: 18 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.xs },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brand },
});
