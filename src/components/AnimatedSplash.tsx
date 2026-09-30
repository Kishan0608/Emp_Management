import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
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
  type SharedValue,
} from 'react-native-reanimated';

import { fonts } from '@/theme/tokens';

import { AnimatedBackdrop } from './AnimatedBackdrop';
import { SkflMark } from './brand/SkflLogo';
import { CHARCOAL_STOPS, COMPANY } from './brand/skflPaths';

const MIN_VISIBLE_MS = 3400;
const CHAMPAGNE = '#E5E3AC';
const SHAPE_DELAY = 350;
const SHAPE_STAGGER = 190;
const LOGO_DONE = SHAPE_DELAY + SHAPE_STAGGER * 7 + 300;

/**
 * SKFL loading screen: the logo shapes appear one by one inside a slowly turning
 * gold halo, a shockwave ring pulses out as the logo locks in, a glint sweeps
 * across, then the company name reveals letter by letter.
 */
export function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const { width: screenW } = useWindowDimensions();
  const logoW = Math.min(300, screenW * 0.7);
  const haloSize = logoW * 1.45;
  const [minElapsed, setMinElapsed] = useState(false);

  const intro = useSharedValue(0);
  const spin = useSharedValue(0);
  const breathe = useSharedValue(0);
  const float = useSharedValue(0);
  const wave1 = useSharedValue(0);
  const wave2 = useSharedValue(0);
  const shine = useSharedValue(0);
  const nameWide = useSharedValue(0);
  const exit = useSharedValue(1);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    intro.set(withSpring(1, { damping: 15, stiffness: 70 }));
    spin.set(withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1));
    breathe.set(withRepeat(withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }), -1, true));
    float.set(withDelay(LOGO_DONE, withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true)));
    const pulse = () => withRepeat(withSequence(withTiming(1, { duration: 1800, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 0 })), -1);
    wave1.set(withDelay(LOGO_DONE - 150, pulse()));
    wave2.set(withDelay(LOGO_DONE + 750, pulse()));
    shine.set(withDelay(LOGO_DONE, withRepeat(withSequence(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.quad) }), withDelay(1600, withTiming(0, { duration: 0 }))), -1)));
    nameWide.set(withDelay(LOGO_DONE + 200, withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) })));

    const done = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    return () => clearTimeout(done);
  }, [intro, spin, breathe, float, wave1, wave2, shine, nameWide]);

  useEffect(() => {
    if (!ready || !minElapsed) return;
    exit.set(
      withTiming(0, { duration: 520, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(onFinish)();
      }),
    );
  }, [ready, minElapsed, exit, onFinish]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: exit.get(), transform: [{ scale: 1 + (1 - exit.get()) * 0.1 }] }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: intro.get() * (0.55 + breathe.get() * 0.3),
    transform: [{ rotate: `${spin.get() * 360}deg` }, { scale: 0.6 + intro.get() * 0.4 }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.25 + breathe.get() * 0.3, transform: [{ scale: 0.9 + breathe.get() * 0.15 }] }));
  const wave1Style = useAnimatedStyle(() => waveFrame(wave1));
  const wave2Style = useAnimatedStyle(() => waveFrame(wave2));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, intro.get() * 1.5),
    transform: [{ translateY: -6 * float.get() }, { scale: 0.86 + intro.get() * 0.14 }],
  }));
  const shineStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -140 + shine.get() * (logoW + 280) }, { skewX: '-22deg' }] }));
  const nameStyle = useAnimatedStyle(() => ({ gap: 1 + nameWide.get() * 3 }));

  const letters = COMPANY.name.toUpperCase().split('');

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]} pointerEvents={ready && minElapsed ? 'none' : 'auto'}>
      <LinearGradient colors={CHARCOAL_STOPS} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <AnimatedBackdrop variant="full" />

      <View style={styles.center}>
        <View style={[styles.stage, { width: haloSize, height: haloSize }]}>
          <Animated.View style={[styles.abs, { width: haloSize * 1.1, height: haloSize * 1.1, borderRadius: haloSize }, glowStyle]}>
            <LinearGradient colors={['rgba(229,227,172,0.28)', 'rgba(229,227,172,0)']} start={{ x: 0.5, y: 0.5 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: haloSize }} />
          </Animated.View>

          <Animated.View style={[styles.abs, styles.wave, { width: haloSize, height: haloSize, borderRadius: haloSize / 2 }, wave1Style]} />
          <Animated.View style={[styles.abs, styles.wave, { width: haloSize, height: haloSize, borderRadius: haloSize / 2 }, wave2Style]} />

          <Animated.View style={[styles.abs, { width: haloSize, height: haloSize }, haloStyle]}>
            <View style={[styles.ring, { borderRadius: haloSize / 2 }]} />
            <View style={[styles.spark, { top: -3, left: haloSize / 2 - 3 }]} />
            <View style={[styles.spark, styles.sparkSmall, { bottom: -2, left: haloSize / 2 - 2 }]} />
          </Animated.View>

          <Animated.View style={[{ width: logoW, overflow: 'hidden' }, logoStyle]}>
            <SkflMark width={logoW} animated delay={SHAPE_DELAY} stagger={SHAPE_STAGGER} duration={650} />
            <Animated.View pointerEvents="none" style={[styles.shine, shineStyle]}>
              <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,252,235,0.6)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
            </Animated.View>
          </Animated.View>
        </View>

        <Animated.View style={[styles.nameRow, nameStyle]}>
          {letters.map((ch, i) => (
            <Letter key={i} ch={ch} delay={LOGO_DONE + i * 45} />
          ))}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

function waveFrame(w: SharedValue<number>) {
  'worklet';
  const v = w.get();
  return { opacity: v > 0 ? (1 - v) * 0.7 : 0, transform: [{ scale: 0.7 + v * 0.9 }] };
}

function Letter({ ch, delay }: { ch: string; delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(delay, withSpring(1, { damping: 12, stiffness: 120 })));
  }, [delay, p]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.get()),
    transform: [{ translateY: (1 - p.get()) * 16 }, { scale: 0.6 + p.get() * 0.4 }],
  }));
  return <Animated.Text style={[styles.letter, style]}>{ch === ' ' ? ' ' : ch}</Animated.Text>;
}

const styles = StyleSheet.create({
  root: { zIndex: 999, backgroundColor: '#3A3935' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  stage: { alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute' },
  wave: { borderWidth: 1.5, borderColor: CHAMPAGNE },
  ring: {
    flex: 1,
    borderWidth: 2,
    borderTopColor: 'rgba(255,251,224,0.95)',
    borderRightColor: 'rgba(229,227,172,0.45)',
    borderBottomColor: 'rgba(196,180,104,0.75)',
    borderLeftColor: 'rgba(229,227,172,0.08)',
  },
  spark: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFBE0', shadowColor: CHAMPAGNE, shadowOpacity: 1, shadowRadius: 8, elevation: 6 },
  sparkSmall: { width: 4, height: 4, borderRadius: 2 },
  shine: { position: 'absolute', top: -20, bottom: -20, left: 0, width: 80 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 22, maxWidth: '100%' },
  letter: { fontFamily: fonts.semibold, fontSize: 16, color: CHAMPAGNE, letterSpacing: 1 },
});
