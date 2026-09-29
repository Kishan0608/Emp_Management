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

import { colors, fonts, gradients } from '@/theme/tokens';

import { AnimatedBackdrop } from './AnimatedBackdrop';
import { SkflMark } from './brand/SkflLogo';
import { COMPANY } from './brand/skflPaths';

const MIN_VISIBLE_MS = 2900;
const YEAR = new Date().getFullYear();
const MESSAGES = ['Preparing secure workspace', 'Verifying your session', 'Loading your dashboard'];

/**
 * SKFL loading screen. Shown while fonts load and the session is restored,
 * for at least MIN_VISIBLE_MS so the brand animation can finish, then dissolves.
 */
export function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const { width: screenW } = useWindowDimensions();
  const logoW = Math.min(320, screenW * 0.72);
  const [minElapsed, setMinElapsed] = useState(false);
  const [msg, setMsg] = useState(0);

  const glow = useSharedValue(0);
  const logoScale = useSharedValue(0.92);
  const shine = useSharedValue(0);
  const rule = useSharedValue(0);
  const nameY = useSharedValue(14);
  const nameO = useSharedValue(0);
  const tagO = useSharedValue(0);
  const progress = useSharedValue(0);
  const exit = useSharedValue(1);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    glow.set(withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true));
    logoScale.set(withSpring(1, { damping: 14, stiffness: 90 }));
    shine.set(withDelay(1500, withRepeat(withSequence(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), withDelay(1400, withTiming(0, { duration: 0 }))), -1)));
    rule.set(withDelay(1450, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })));
    nameO.set(withDelay(1650, withTiming(1, { duration: 600 })));
    nameY.set(withDelay(1650, withSpring(0, { damping: 16 })));
    tagO.set(withDelay(1950, withTiming(1, { duration: 600 })));
    progress.set(withTiming(0.88, { duration: MIN_VISIBLE_MS, easing: Easing.out(Easing.cubic) }));

    const done = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    const cycle = setInterval(() => setMsg((m) => (m + 1) % MESSAGES.length), 1000);
    return () => {
      clearTimeout(done);
      clearInterval(cycle);
    };
  }, [glow, logoScale, shine, rule, nameO, nameY, tagO, progress]);

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
  const tagStyle = useAnimatedStyle(() => ({ opacity: tagO.get() }));
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]} pointerEvents={ready && minElapsed ? 'none' : 'auto'}>
      <LinearGradient colors={gradients.brand} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      <AnimatedBackdrop variant="full" />

      <View style={styles.center}>
        <Animated.View style={[styles.glow, { width: logoW * 1.3, height: logoW * 1.3, borderRadius: logoW }, glowStyle]}>
          <LinearGradient colors={['rgba(212,164,55,0.45)', 'rgba(212,164,55,0)']} start={{ x: 0.5, y: 0.5 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: logoW }} />
        </Animated.View>

        <Animated.View style={[{ width: logoW, overflow: 'hidden' }, logoStyle]}>
          <SkflMark width={logoW} animated delay={250} letterGap={230} duration={850} />
          <Animated.View pointerEvents="none" style={[styles.shine, shineStyle]}>
            <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,250,230,0.55)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
          </Animated.View>
        </Animated.View>

        <View style={styles.ruleRow}>
          <Animated.View style={ruleStyle}>
            <LinearGradient colors={gradients.goldLine} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 1.5 }} />
          </Animated.View>
          <Animated.View style={[styles.diamond, diamondStyle]} />
        </View>

        <Animated.View style={nameStyle}>
          <Text style={styles.name} adjustsFontSizeToFit numberOfLines={1}>
            {COMPANY.name.toUpperCase()}
          </Text>
        </Animated.View>
        <Animated.View style={[styles.tagRow, tagStyle]}>
          <Text style={styles.tag}>{COMPANY.product}</Text>
          <View style={styles.tagDivider} />
          <Dot color={colors.task} />
          <Dot color={colors.complaint} />
          <Dot color={colors.feedback} />
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
        <Text style={styles.copy}>© {YEAR} {COMPANY.name}</Text>
      </View>
    </Animated.View>
  );
}

function Dot({ color }: { color: string }) {
  return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginLeft: 6 }} />;
}

const styles = StyleSheet.create({
  root: { zIndex: 999, backgroundColor: colors.brandDeep },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  glow: { position: 'absolute' },
  shine: { position: 'absolute', top: -20, bottom: -20, left: 0, width: 70 },
  ruleRow: { height: 24, marginTop: 26, alignItems: 'center', justifyContent: 'center' },
  diamond: { position: 'absolute', width: 8, height: 8, backgroundColor: colors.goldLight },
  name: { fontFamily: fonts.semibold, fontSize: 17, letterSpacing: 4, color: colors.goldLight, marginTop: 6, textAlign: 'center' },
  tagRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  tag: { fontFamily: fonts.medium, fontSize: 13, color: 'rgba(255,255,255,0.72)', letterSpacing: 0.4 },
  tagDivider: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 6 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 56, alignItems: 'center', gap: 12 },
  track: { width: 200, height: 3, borderRadius: 2, backgroundColor: 'rgba(246,222,141,0.15)', overflow: 'hidden' },
  barWrap: { height: 3, borderRadius: 2, overflow: 'hidden' },
  status: { fontFamily: fonts.medium, fontSize: 12, color: 'rgba(246,222,141,0.75)', letterSpacing: 0.4 },
  copy: { fontFamily: fonts.regular, fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 },
});
