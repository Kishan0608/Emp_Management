import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { fonts, gradients } from '@/theme/tokens';

import { AnimatedBackdrop } from './AnimatedBackdrop';
import { SkflMark } from './brand/SkflLogo';
import { CHARCOAL_STOPS, COMPANY } from './brand/skflPaths';

const MIN_VISIBLE_MS = 3100;
const YEAR = new Date().getFullYear();
const MESSAGES = ['Preparing secure workspace', 'Verifying your session', 'Loading your dashboard'];
const CHAMPAGNE = '#E5E3AC';

/**
 * SKFL loading screen, on the brushed-charcoal background of the official logo.
 * The seven logo shapes appear left to right, a light glint sweeps across,
 * then the company name rises in. Stays at least MIN_VISIBLE_MS, then dissolves.
 */
export function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const { width: screenW } = useWindowDimensions();
  const logoW = Math.min(320, screenW * 0.74);
  const [minElapsed, setMinElapsed] = useState(false);
  const [msg, setMsg] = useState(0);

  const glow = useSharedValue(0);
  const logoScale = useSharedValue(0.9);
  const shine = useSharedValue(0);
  const rule = useSharedValue(0);
  const nameY = useSharedValue(14);
  const nameO = useSharedValue(0);
  const progress = useSharedValue(0);
  const exit = useSharedValue(1);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    glow.set(withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true));
    logoScale.set(withSpring(1, { damping: 14, stiffness: 80 }));
    shine.set(withDelay(2000, withRepeat(withSequence(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), withDelay(1400, withTiming(0, { duration: 0 }))), -1)));
    rule.set(withDelay(1900, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })));
    nameO.set(withDelay(2100, withTiming(1, { duration: 600 })));
    nameY.set(withDelay(2100, withSpring(0, { damping: 16 })));
    progress.set(withTiming(0.88, { duration: MIN_VISIBLE_MS, easing: Easing.out(Easing.cubic) }));

    const done = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    const cycle = setInterval(() => setMsg((m) => (m + 1) % MESSAGES.length), 1000);
    return () => {
      clearTimeout(done);
      clearInterval(cycle);
    };
  }, [glow, logoScale, shine, rule, nameO, nameY, progress]);

  useEffect(() => {
    if (!ready || !minElapsed) return;
    progress.set(withTiming(1, { duration: 260 }));
    exit.set(
      withDelay(
        260,
        withTiming(0, { duration: 480, easing: Easing.in(Easing.quad) }, (finished) => {
          if (finished) runOnJS(onFinish)();
        }),
      ),
    );
  }, [ready, minElapsed, progress, exit, onFinish]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: exit.get(), transform: [{ scale: 1 + (1 - exit.get()) * 0.08 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.35 + glow.get() * 0.35, transform: [{ scale: 0.85 + glow.get() * 0.25 }] }));
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: logoScale.get() }] }));
  const shineStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -120 + shine.get() * (logoW + 240) }, { skewX: '-22deg' }] }));
  const ruleStyle = useAnimatedStyle(() => ({ width: 220 * rule.get(), opacity: rule.get() }));
  const diamondStyle = useAnimatedStyle(() => ({ transform: [{ rotate: '45deg' }, { scale: rule.get() }] }));
  const nameStyle = useAnimatedStyle(() => ({ opacity: nameO.get(), transform: [{ translateY: nameY.get() }] }));
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]} pointerEvents={ready && minElapsed ? 'none' : 'auto'}>
      <LinearGradient colors={CHARCOAL_STOPS} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <AnimatedBackdrop variant="full" />

      <View style={styles.center}>
        <Animated.View style={[styles.glow, { width: logoW * 1.3, height: logoW * 1.3, borderRadius: logoW }, glowStyle]}>
          <LinearGradient colors={['rgba(229,227,172,0.30)', 'rgba(229,227,172,0)']} start={{ x: 0.5, y: 0.5 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: logoW }} />
        </Animated.View>

        <Animated.View style={[{ width: logoW, overflow: 'hidden' }, logoStyle]}>
          <SkflMark width={logoW} animated delay={250} stagger={170} duration={600} />
          <Animated.View pointerEvents="none" style={[styles.shine, shineStyle]}>
            <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,252,235,0.55)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
          </Animated.View>
        </Animated.View>

        <View style={styles.ruleRow}>
          <Animated.View style={ruleStyle}>
            <LinearGradient colors={['rgba(229,227,172,0)', CHAMPAGNE, 'rgba(229,227,172,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 1.5 }} />
          </Animated.View>
          <Animated.View style={[styles.diamond, diamondStyle]} />
        </View>

        <Animated.View style={nameStyle}>
          <Text style={styles.name} adjustsFontSizeToFit numberOfLines={1}>
            {COMPANY.name.toUpperCase()}
          </Text>
        </Animated.View>
      </View>

      <View style={styles.bottom}>
        <View style={styles.track}>
          <Animated.View style={[styles.barWrap, barStyle]}>
            <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
          </Animated.View>
        </View>
        <Animated.Text key={msg} entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)} style={styles.status}>
          {MESSAGES[msg]}…
        </Animated.Text>
        <Text style={styles.copy}>
          © {YEAR} {COMPANY.name}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 999, backgroundColor: '#3A3935' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  glow: { position: 'absolute' },
  shine: { position: 'absolute', top: -20, bottom: -20, left: 0, width: 70 },
  ruleRow: { height: 24, marginTop: 26, alignItems: 'center', justifyContent: 'center' },
  diamond: { position: 'absolute', width: 8, height: 8, backgroundColor: CHAMPAGNE },
  name: { fontFamily: fonts.semibold, fontSize: 17, letterSpacing: 4, color: CHAMPAGNE, marginTop: 6, textAlign: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 56, alignItems: 'center', gap: 12 },
  track: { width: 200, height: 3, borderRadius: 2, backgroundColor: 'rgba(229,227,172,0.15)', overflow: 'hidden' },
  barWrap: { height: 3, borderRadius: 2, overflow: 'hidden' },
  status: { fontFamily: fonts.medium, fontSize: 12, color: 'rgba(229,227,172,0.8)', letterSpacing: 0.4 },
  copy: { fontFamily: fonts.regular, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
});
