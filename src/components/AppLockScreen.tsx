import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NavigationBar } from 'expo-navigation-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui';
import { getAppLockSupport, PASSCODE_LENGTH, type AppLockSupport } from '@/lib/appLock';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts, spacing } from '@/theme/tokens';

import { AnimatedBackdrop } from './AnimatedBackdrop';
import { SkflMark } from './brand/SkflLogo';
import { CHARCOAL_STOPS } from './brand/skflPaths';
import { Keypad, PasscodeDots } from './PasscodePad';

/** Full-screen lock over the app: 4-digit passcode, or fingerprint / face if turned on. */
export function AppLockScreen({ autoPrompt }: { autoPrompt: boolean }) {
  const { ctx, appLockEnabled, unlock, unlockWithPasscode, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [support, setSupport] = useState<AppLockSupport | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const prompted = useRef(false);

  useEffect(() => {
    getAppLockSupport().then(setSupport).catch(() => {});
  }, []);

  const bio = appLockEnabled && !!support?.available;

  const tryBiometric = useCallback(async () => {
    setMessage(null);
    const err = await unlock();
    if (err) setMessage(err);
  }, [unlock]);

  // Open the fingerprint prompt straight away once the splash has finished.
  useEffect(() => {
    if (!autoPrompt || !bio || prompted.current) return;
    prompted.current = true;
    const t = setTimeout(tryBiometric, 350);
    return () => clearTimeout(t);
  }, [autoPrompt, bio, tryBiometric]);

  const onChange = async (v: string) => {
    setPin(v);
    setMessage(null);
    if (v.length < PASSCODE_LENGTH) return;
    setBusy(true);
    const r = await unlockWithPasscode(v);
    setBusy(false);
    if (!r.ok) {
      setPin('');
      setErrorKey((k) => k + 1);
      setMessage(r.attemptsLeft > 0 ? `Wrong passcode · ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left` : null);
    }
  };

  const name = ctx?.user.full_name ?? '';
  const first = name.split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <Animated.View entering={FadeIn.duration(200)} style={[StyleSheet.absoluteFill, styles.root]}>
      <NavigationBar style="dark" />
      <LinearGradient colors={CHARCOAL_STOPS} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <AnimatedBackdrop variant="full" />

      <View style={[styles.content, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.lg }]}>
        <Animated.View entering={FadeInDown.duration(450)} style={{ alignItems: 'center', gap: spacing.md }}>
          <SkflMark width={110} />
          <View style={styles.userChip}>
            {ctx && <Avatar name={name} id={ctx.user.id} size={30} />}
            <Text style={styles.userText} numberOfLines={1}>
              {ctx?.user.email}
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(450)} style={{ alignItems: 'center', gap: spacing.sm }}>
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={14} color={colors.ink} />
          </View>
          <Text style={styles.hello}>
            {greet}
            {first ? `, ${first}` : ''}
          </Text>
          <Text style={styles.sub}>{bio ? `Enter your passcode or use ${support?.method.toLowerCase()}` : 'Enter your 4-digit passcode'}</Text>
          <View style={{ marginTop: spacing.md }}>
            <PasscodeDots length={pin.length} errorKey={errorKey} />
          </View>
          <Text style={[styles.message, !message && { opacity: 0 }]}>{message ?? ' '}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(450)}>
          <Keypad
            value={pin}
            onChange={onChange}
            disabled={busy}
            leftKey={bio ? { icon: support!.icon, label: `Unlock with ${support!.method}`, onPress: tryBiometric } : undefined}
          />
        </Animated.View>

        <Pressable onPress={() => signOut(false)} hitSlop={10} style={styles.alt}>
          <Text style={styles.altText}>Forgot passcode? Sign in with password</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 900, backgroundColor: '#3A3935' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 280,
    paddingLeft: 4,
    paddingRight: 14,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(229,227,172,0.2)',
  },
  userText: { fontFamily: fonts.medium, fontSize: 13, color: 'rgba(255,255,255,0.85)', flexShrink: 1 },
  lockBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.goldLight, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  hello: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.white, letterSpacing: -0.5, textAlign: 'center' },
  sub: { fontFamily: fonts.regular, fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  message: { fontFamily: fonts.semibold, fontSize: 13, color: '#FCA5A5', textAlign: 'center', minHeight: 18 },
  alt: { paddingVertical: spacing.sm },
  altText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.goldLight },
});
