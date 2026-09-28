import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, fonts, gradients } from '@/theme/tokens';

import { Logo } from './Logo';

const MIN_VISIBLE_MS = 1900;

/**
 * Branded loading screen shown over the app while fonts load and the session is restored.
 * It stays for a minimum time so the animation can finish, then fades out.
 */
export function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const [minElapsed, setMinElapsed] = useState(false);

  const logoScale = useSharedValue(0.6);
  const logoOpacity = useSharedValue(0);
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const titleY = useSharedValue(16);
  const titleOpacity = useSharedValue(0);
  const tagOpacity = useSharedValue(0);
  const progress = useSharedValue(0);
  const shimmer = useSharedValue(-1);
  const exit = useSharedValue(1);

  useEffect(() => {
    // Hide the static native splash as soon as this animated one is on screen.
    SplashScreen.hideAsync().catch(() => {});

    logoOpacity.set(withTiming(1, { duration: 350 }));
    logoScale.set(withSpring(1, { damping: 11, stiffness: 110 }));

    const pulse = (delay: number) =>
      withDelay(delay, withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) })), -1));
    ring1.set(pulse(300));
    ring2.set(pulse(1200));

    titleOpacity.set(withDelay(550, withTiming(1, { duration: 450 })));
    titleY.set(withDelay(550, withSpring(0, { damping: 16 })));
    tagOpacity.set(withDelay(800, withTiming(1, { duration: 450 })));

    progress.set(withTiming(0.85, { duration: MIN_VISIBLE_MS, easing: Easing.out(Easing.cubic) }));
    shimmer.set(withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1));

    const t = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [logoOpacity, logoScale, ring1, ring2, titleOpacity, titleY, tagOpacity, progress, shimmer]);

  useEffect(() => {
    if (!ready || !minElapsed) return;
    progress.set(withTiming(1, { duration: 250 }));
    exit.set(withDelay(
      250,
      withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) }, (done) => {
        if (done) runOnJS(onFinish)();
      }),
    ));
  }, [ready, minElapsed, progress, exit, onFinish]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: exit.get(), transform: [{ scale: 1 + (1 - exit.get()) * 0.06 }] }));
  const logoStyle = useAnimatedStyle(() => ({ opacity: logoOpacity.get(), transform: [{ scale: logoScale.get() }] }));
  const r1 = useAnimatedStyle(() => ({ opacity: 0.4 * (1 - ring1.get()), transform: [{ scale: 1 + ring1.get() * 1.3 }] }));
  const r2 = useAnimatedStyle(() => ({ opacity: 0.4 * (1 - ring2.get()), transform: [{ scale: 1 + ring2.get() * 1.3 }] }));
  const titleStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.get(), transform: [{ translateY: titleY.get() }] }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: tagOpacity.get() }));
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
  const shimmerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shimmer.get() * 220 }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]} pointerEvents={ready && minElapsed ? 'none' : 'auto'}>
      <LinearGradient colors={gradients.brand} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.glow, { top: '18%', left: '-20%' }]} />
      <View style={[styles.glow, { bottom: '10%', right: '-25%', backgroundColor: 'rgba(124,58,237,0.35)' }]} />

      <View style={styles.center}>
        <View style={styles.logoWrap}>
          <Animated.View style={[styles.ring, r1]} />
          <Animated.View style={[styles.ring, r2]} />
          <Animated.View style={logoStyle}>
            <Logo size={96} animated delay={250} />
          </Animated.View>
        </View>

        <Animated.View style={[{ alignItems: 'center', marginTop: 36 }, titleStyle]}>
          <Text style={styles.title}>Emp Management</Text>
        </Animated.View>
        <Animated.View style={[styles.tagRow, tagStyle]}>
          <Dot color={colors.task} />
          <Text style={styles.tag}>Tasks</Text>
          <Dot color={colors.complaint} />
          <Text style={styles.tag}>Complaints</Text>
          <Dot color={colors.feedback} />
          <Text style={styles.tag}>Feedback</Text>
        </Animated.View>
      </View>

      <View style={styles.bottom}>
        <View style={styles.track}>
          <Animated.View style={[styles.bar, barStyle]}>
            <Animated.View style={[styles.shimmer, shimmerStyle]} />
          </Animated.View>
        </View>
        <Text style={styles.status}>Securing your workspace…</Text>
      </View>
    </Animated.View>
  );
}

function Dot({ color }: { color: string }) {
  return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginLeft: 10 }} />;
}

const styles = StyleSheet.create({
  root: { zIndex: 999, backgroundColor: colors.brandDeep },
  glow: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(67,56,202,0.45)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 96, height: 96, borderRadius: 30, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  title: { fontFamily: fonts.extrabold, fontSize: 30, color: colors.white, letterSpacing: -0.8 },
  tagRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  tag: { fontFamily: fonts.medium, fontSize: 13, color: 'rgba(255,255,255,0.78)', marginLeft: 6 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 64, alignItems: 'center', gap: 12 },
  track: { width: 180, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.white, overflow: 'hidden' },
  shimmer: { position: 'absolute', top: 0, bottom: 0, left: -60, width: 60, backgroundColor: 'rgba(124,58,237,0.55)' },
  status: { fontFamily: fonts.medium, fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.3 },
});
