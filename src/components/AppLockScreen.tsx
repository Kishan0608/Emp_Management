import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NavigationBar } from 'expo-navigation-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAppLockSupport, type AppLockSupport } from '@/lib/appLock';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts, spacing } from '@/theme/tokens';

import { AnimatedBackdrop } from './AnimatedBackdrop';
import { SkflMark } from './brand/SkflLogo';
import { CHARCOAL_STOPS, COMPANY } from './brand/skflPaths';

/** Full-screen lock shown over the app when App lock is on. */
export function AppLockScreen({ autoPrompt }: { autoPrompt: boolean }) {
  const { ctx, unlock, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [support, setSupport] = useState<AppLockSupport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prompted = useRef(false);

  const ring = useSharedValue(0);
  useEffect(() => {
    ring.set(withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1));
  }, [ring]);
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - ring.get()), transform: [{ scale: 1 + ring.get() * 0.6 }] }));

  useEffect(() => {
    getAppLockSupport().then(setSupport).catch(() => {});
  }, []);

  const tryUnlock = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const err = await unlock();
      if (err) setError(err);
    } finally {
      setBusy(false);
    }
  }, [unlock]);

  // Ask straight away once the loading screen has finished.
  useEffect(() => {
    if (!autoPrompt || prompted.current) return;
    prompted.current = true;
    const t = setTimeout(tryUnlock, 350);
    return () => clearTimeout(t);
  }, [autoPrompt, tryUnlock]);

  const first = ctx?.user.full_name.split(' ')[0] ?? '';
  const method = support?.method ?? 'Fingerprint';
  const icon = support?.icon ?? 'finger-print';

  return (
    <Animated.View entering={FadeIn.duration(200)} style={[StyleSheet.absoluteFill, styles.root]}>
      <NavigationBar style="dark" />
      <LinearGradient colors={CHARCOAL_STOPS} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <AnimatedBackdrop variant="full" />

      <View style={[styles.content, { paddingTop: insets.top + spacing.huge, paddingBottom: insets.bottom + spacing.xxl }]}>
        <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: 'center', gap: spacing.md }}>
          <SkflMark width={170} />
          <Text style={styles.company}>{COMPANY.name.toUpperCase()}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(500)} style={{ alignItems: 'center', gap: spacing.sm }}>
          <Text style={styles.hello}>Welcome back{first ? `, ${first}` : ''}</Text>
          <Text style={styles.sub}>SKFL is locked. Use {method.toLowerCase()} to continue.</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(500)} style={{ alignItems: 'center', gap: spacing.lg }}>
          <Pressable onPress={tryUnlock} disabled={busy} accessibilityRole="button" accessibilityLabel={`Unlock with ${method}`} style={styles.fpWrap}>
            <Animated.View style={[styles.ring, ringStyle]} />
            <View style={styles.fp}>{busy ? <ActivityIndicator color={colors.ink} /> : <Ionicons name={icon} size={46} color={colors.ink} />}</View>
          </Pressable>
          <Text style={styles.tap}>Tap to unlock with {method.toLowerCase()}</Text>
          {error && <Text style={styles.error}>{error}</Text>}
        </Animated.View>

        <Pressable onPress={() => signOut(false)} hitSlop={10} style={styles.alt}>
          <Ionicons name="key-outline" size={16} color={colors.goldLight} />
          <Text style={styles.altText}>Sign in with password instead</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 900, backgroundColor: '#3A3935' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  company: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 3.5, color: colors.goldLight },
  hello: { fontFamily: fonts.extrabold, fontSize: 26, color: colors.white, letterSpacing: -0.5, textAlign: 'center' },
  sub: { fontFamily: fonts.regular, fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  fpWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 110, height: 110, borderRadius: 55, borderWidth: 2, borderColor: colors.goldLight },
  fp: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.goldLight,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  tap: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },
  error: { fontFamily: fonts.medium, fontSize: 13, color: '#FCA5A5', textAlign: 'center', maxWidth: 300 },
  alt: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm },
  altText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.goldLight },
});
