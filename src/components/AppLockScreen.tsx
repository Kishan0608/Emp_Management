import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NavigationBar } from 'expo-navigation-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAppLockSupport, PASSCODE_LENGTH, type AppLockSupport } from '@/lib/appLock';
import type { AppLockType } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts, spacing } from '@/theme/tokens';

import { AnimatedBackdrop } from './AnimatedBackdrop';
import { SkflMark } from './brand/SkflLogo';
import { CHARCOAL_STOPS } from './brand/skflPaths';
import { Keypad, PasscodeDots } from './PasscodePad';
import { PatternLock } from './PatternLock';

/**
 * Full-screen lock over the app supporting:
 * 1. 4-Digit Passcode (PIN)
 * 2. 3x3 Pattern Lock
 * 3. Fingerprint / Face ID Biometrics
 */
export function AppLockScreen({ autoPrompt }: { autoPrompt: boolean }) {
  const {
    ctx,
    appLockType,
    biometricEnabled,
    unlock,
    unlockWithPasscode,
    unlockWithPattern,
    signOut,
  } = useAuth();

  const insets = useSafeAreaInsets();
  const [support, setSupport] = useState<AppLockSupport | null>(null);
  // Exactly one method is active; the lock screen shows only that one.
  const currentMode: AppLockType = appLockType || 'passcode';
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const prompted = useRef(false);

  useEffect(() => {
    getAppLockSupport().then(setSupport).catch(() => {});
  }, []);

  const bioActive = biometricEnabled && !!support?.available;

  const tryBiometric = useCallback(async () => {
    setMessage(null);
    const err = await unlock();
    if (err) setMessage(err);
  }, [unlock]);

  // Open the fingerprint / face prompt once after splash finishes
  useEffect(() => {
    if (!autoPrompt || !bioActive || prompted.current) return;
    prompted.current = true;
    const t = setTimeout(tryBiometric, 350);
    return () => clearTimeout(t);
  }, [autoPrompt, bioActive, tryBiometric]);

  const onPinChange = async (v: string) => {
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

  const onPatternComplete = async (pattern: string) => {
    setMessage(null);
    setBusy(true);
    const r = await unlockWithPattern(pattern);
    setBusy(false);
    if (!r.ok) {
      setMessage(r.attemptsLeft > 0 ? `Wrong pattern · ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left` : null);
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

      <View style={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.md }]}>
        <Animated.View entering={FadeIn.duration(300)} style={{ alignItems: 'center', gap: spacing.sm }}>
          <SkflMark width={100} />
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(300)} style={{ alignItems: 'center', gap: spacing.xs }}>
          <View style={styles.lockBadge}>
            <Ionicons
              name={currentMode === 'pattern' ? 'grid' : currentMode === 'biometric' ? 'finger-print' : 'lock-closed'}
              size={14}
              color={colors.ink}
            />
          </View>
          <Text style={styles.hello}>
            {greet}
            {first ? `, ${first}` : ''}
          </Text>
          <Text style={styles.sub}>
            {currentMode === 'biometric'
              ? `Use ${support?.method.toLowerCase() ?? 'your fingerprint'} to unlock`
              : currentMode === 'pattern'
              ? bioActive
                ? `Draw pattern or use ${support?.method.toLowerCase()}`
                : 'Draw your unlock pattern'
              : bioActive
                ? `Enter your PIN or use ${support?.method.toLowerCase()}`
                : 'Enter your 4-digit passcode'}
          </Text>

          {currentMode === 'passcode' && (
            <View style={{ marginTop: spacing.sm }}>
              <PasscodeDots length={pin.length} errorKey={errorKey} />
            </View>
          )}

          <Text style={[styles.message, !message && { opacity: 0 }]}>{message ?? ' '}</Text>
        </Animated.View>

        {/* Lock Controls (Keypad or Pattern Grid) */}
        <Animated.View entering={FadeInUp.delay(80).duration(300)} style={styles.lockControlArea}>
          {currentMode === 'biometric' ? (
            <Pressable onPress={tryBiometric} style={styles.bioBig} accessibilityLabel={`Unlock with ${support?.method ?? 'fingerprint'}`}>
              <Ionicons name={support?.icon ?? 'finger-print'} size={56} color={colors.goldLight} />
              <Text style={styles.bioButtonText}>Unlock with {support?.method ?? 'Fingerprint'}</Text>
            </Pressable>
          ) : currentMode === 'pattern' ? (
            <View style={{ alignItems: 'center', gap: spacing.md }}>
              <PatternLock
                onPatternComplete={onPatternComplete}
                disabled={busy}
                size={290}
                tone="dark"
              />
              {bioActive && (
                <Pressable onPress={tryBiometric} style={styles.bioButton} hitSlop={8}>
                  <Ionicons name={support!.icon} size={22} color={colors.goldLight} />
                  <Text style={styles.bioButtonText}>Unlock with {support!.method}</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <Keypad
              value={pin}
              onChange={onPinChange}
              disabled={busy}
              leftKey={bioActive ? { icon: support!.icon, label: `Unlock with ${support!.method}`, onPress: tryBiometric } : undefined}
            />
          )}
        </Animated.View>

        {/* Bottom Options: Switch Mode or Forgot */}
        <View style={styles.footerOptions}>
          <Pressable onPress={() => signOut(false, undefined, false)} hitSlop={10} style={styles.alt}>
            <Text style={styles.forgotText}>Forgot lock? Sign in with password</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 900, backgroundColor: '#3A3935' },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  lockBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.goldLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  hello: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: colors.white,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  message: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: '#FCA5A5',
    textAlign: 'center',
    minHeight: 18,
  },
  lockControlArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  bioBig: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  bioButtonText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.goldLight,
  },
  footerOptions: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.xs,
  },
  alt: {
    paddingVertical: spacing.xs,
  },
  altText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.goldLight,
  },
  forgotText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
});
