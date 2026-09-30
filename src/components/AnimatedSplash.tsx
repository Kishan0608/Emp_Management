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
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts } from '@/theme/tokens';

import { AnimatedBackdrop } from './AnimatedBackdrop';
import { SkflMark } from './brand/SkflLogo';
import { CHARCOAL_STOPS, COMPANY, SKFL_VIEWBOX } from './brand/skflPaths';

const MIN_VISIBLE_MS = 2800;
const CHAMPAGNE = '#E5E3AC';
const SHAPE_DELAY = 250;
const SHAPE_STAGGER = 150;
const LOGO_DONE = SHAPE_DELAY + SHAPE_STAGGER * 7 + 300;
/** One loop of the master clock; every orbit speed is a whole multiple so loops are seamless. */
const CLOCK_MS = 60_000;
/** How far each orbit is tipped away from the viewer. */
const TILT = 74;

const ORBITS = [
  { roll: 0, turns: 12, dir: 1, scale: 1, dots: [0, 180] },
  { roll: 58, turns: 9, dir: -1, scale: 0.9, dots: [90] },
  { roll: -58, turns: 7, dir: 1, scale: 0.8, dots: [270] },
] as const;

const MESSAGES = ['Starting up', 'Securing your session', 'Loading your workspace', 'Almost ready'];

/**
 * SKFL loading screen, built as a small 3D scene:
 *  - the logo flips in like a card, then floats with a gentle 3D tilt
 *  - three tilted gold orbits circle it; each is split into a back half (drawn
 *    behind the logo) and a front half (in front), so the particles truly pass
 *    around the logo
 *  - a soft floor shadow breathes with the float, a glint sweeps the logo
 *  - the name reveals letter by letter; a progress bar and status line show
 *    what's happening, then the logo zooms toward you as the app opens
 */
export function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const { width: screenW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const logoW = Math.min(260, screenW * 0.6);
  const stage = Math.min(screenW * 0.92, logoW * 1.7);
  const [minElapsed, setMinElapsed] = useState(false);
  const [msg, setMsg] = useState(0);

  const intro = useSharedValue(0);
  const settle = useSharedValue(0);
  const clock = useSharedValue(0);
  const appear = useSharedValue(0);
  const breathe = useSharedValue(0);
  const shine = useSharedValue(0);
  const progress = useSharedValue(0);
  const exit = useSharedValue(1);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    clock.set(withRepeat(withTiming(1, { duration: CLOCK_MS, easing: Easing.linear }), -1));
    intro.set(withSpring(1, { damping: 14, stiffness: 60, mass: 1.1 }));
    appear.set(withDelay(350, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) })));
    settle.set(withDelay(LOGO_DONE, withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.cubic) })));
    breathe.set(withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true));
    shine.set(withDelay(LOGO_DONE, withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1)));
    progress.set(withTiming(0.86, { duration: MIN_VISIBLE_MS, easing: Easing.out(Easing.cubic) }));

    const done = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    const ticker = setInterval(() => setMsg((m) => Math.min(m + 1, MESSAGES.length - 1)), 800);
    return () => {
      clearTimeout(done);
      clearInterval(ticker);
    };
  }, [intro, settle, clock, appear, breathe, shine, progress]);

  useEffect(() => {
    if (!ready || !minElapsed) return;
    progress.set(withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }));
    exit.set(
      withDelay(
        240,
        withTiming(0, { duration: 560, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(onFinish)();
        }),
      ),
    );
  }, [ready, minElapsed, exit, progress, onFinish]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, exit.get() * 1.6) }));
  const stageStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + (1 - exit.get()) * 0.35 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: (0.35 + breathe.get() * 0.35) * intro.get(), transform: [{ scale: 0.85 + breathe.get() * 0.2 }] }));

  const logoStyle = useAnimatedStyle(() => {
    const a = clock.get() * Math.PI * 2 * 6; // ~10 s sway
    const s = settle.get();
    const i = intro.get();
    return {
      opacity: Math.min(1, i * 1.4),
      transform: [
        { perspective: 900 },
        { translateY: -8 * Math.sin(a * 2) * s },
        { rotateY: `${(1 - i) * -100 + Math.sin(a) * 12 * s}deg` },
        { rotateX: `${Math.cos(a) * 7 * s}deg` },
        { scale: 0.8 + i * 0.2 },
      ],
    };
  });
  const floorStyle = useAnimatedStyle(() => {
    const a = clock.get() * Math.PI * 2 * 12;
    const lift = Math.sin(a) * settle.get();
    return { opacity: intro.get() * (0.55 - lift * 0.15), transform: [{ scaleX: 1 - lift * 0.12 }] };
  });
  const shineStyle = useAnimatedStyle(() => ({
    opacity: shine.get() < 0.55 ? 1 : 0,
    transform: [{ translateX: -120 + Math.min(1, shine.get() / 0.55) * (logoW + 240) }, { skewX: '-22deg' }],
  }));
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));

  const letters = COMPANY.name.toUpperCase().split('');
  const logoBox = (logoW * SKFL_VIEWBOX.height) / SKFL_VIEWBOX.width;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]} pointerEvents={ready && minElapsed ? 'none' : 'auto'}>
      <LinearGradient colors={CHARCOAL_STOPS} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <AnimatedBackdrop variant="full" />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)']} style={StyleSheet.absoluteFill} pointerEvents="none" />

      <View style={styles.center}>
        <Animated.View style={[styles.stage, { width: stage, height: stage }, stageStyle]}>
          {/* warm glow behind everything */}
          <Animated.View style={[styles.abs, { width: stage * 0.9, height: stage * 0.9, borderRadius: stage }, glowStyle]}>
            <LinearGradient colors={['rgba(229,227,172,0.30)', 'rgba(229,227,172,0)']} start={{ x: 0.5, y: 0.5 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: stage }} />
          </Animated.View>

          {/* back halves of the orbits: behind the logo */}
          {ORBITS.map((o, i) => (
            <Orbit key={`b${i}`} half="back" size={stage * o.scale} cfg={o} clock={clock} appear={appear} />
          ))}

          {/* floor shadow */}
          <Animated.View style={[styles.floor, { width: logoW * 0.7, top: stage / 2 + logoBox / 2 + 14 }, floorStyle]} />

          {/* the logo card */}
          <Animated.View style={[{ width: logoW, overflow: 'hidden' }, logoStyle]}>
            <SkflMark width={logoW} animated delay={SHAPE_DELAY} stagger={SHAPE_STAGGER} duration={600} />
            <Animated.View pointerEvents="none" style={[styles.shine, shineStyle]}>
              <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,252,235,0.55)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
            </Animated.View>
          </Animated.View>

          {/* front halves: in front of the logo */}
          {ORBITS.map((o, i) => (
            <Orbit key={`f${i}`} half="front" size={stage * o.scale} cfg={o} clock={clock} appear={appear} />
          ))}
        </Animated.View>

        <View style={styles.nameRow}>
          {letters.map((ch, i) => (
            <Letter key={i} ch={ch} delay={LOGO_DONE - 200 + i * 35} />
          ))}
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.track}>
          <Animated.View style={[styles.bar, barStyle]}>
            <LinearGradient colors={['#C4B468', '#FFF6C8', '#DCD28B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
          </Animated.View>
        </View>
        <View style={styles.statusBox}>
          <Animated.Text key={msg} entering={FadeIn.duration(260)} exiting={FadeOut.duration(160)} style={styles.status}>
            {MESSAGES[msg]}…
          </Animated.Text>
        </View>
        <Text style={styles.copy}>
          {COMPANY.short} · Employee workspace
        </Text>
      </View>
    </Animated.View>
  );
}

/** Half of a tilted orbit ring (with its particles), clipped so the logo can sit between the halves. */
function Orbit({
  half,
  size,
  cfg,
  clock,
  appear,
}: {
  half: 'back' | 'front';
  size: number;
  cfg: (typeof ORBITS)[number];
  clock: SharedValue<number>;
  appear: SharedValue<number>;
}) {
  const h = size / 2;
  const r = size / 2;
  const outer = useAnimatedStyle(() => ({
    opacity: appear.get(),
    transform: [{ rotateZ: `${cfg.roll}deg` }, { scale: 0.55 + appear.get() * 0.45 }],
  }));
  const spin = useAnimatedStyle(() => ({ transform: [{ rotateZ: `${cfg.dir * clock.get() * 360 * cfg.turns}deg` }] }));
  const back = half === 'back';

  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { width: size, height: size }, outer]}>
      <View style={{ position: 'absolute', left: 0, top: back ? 0 : h, width: size, height: h, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: 0, top: back ? 0 : -h, width: size, height: size, transform: [{ perspective: 1200 }, { rotateX: `${TILT}deg` }] }}>
          <Animated.View style={[{ width: size, height: size }, spin]}>
            <View style={[styles.ring, { borderRadius: r, opacity: back ? 0.45 : 0.9 }]} />
            {cfg.dots.map((deg) => {
              const a = (deg * Math.PI) / 180;
              const x = r + r * Math.cos(a);
              const y = r + r * Math.sin(a);
              return (
                <View key={deg} style={[styles.dotWrap, { left: x - 11, top: y - 11, opacity: back ? 0.55 : 1 }]}>
                  <View style={styles.dotHalo} />
                  <View style={styles.dot} />
                </View>
              );
            })}
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}

function Letter({ ch, delay }: { ch: string; delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(delay, withSpring(1, { damping: 13, stiffness: 120 })));
  }, [delay, p]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.get()),
    transform: [{ perspective: 400 }, { rotateX: `${(1 - p.get()) * 90}deg` }, { translateY: (1 - p.get()) * 10 }],
  }));
  return <Animated.Text style={[styles.letter, style]}>{ch === ' ' ? ' ' : ch}</Animated.Text>;
}

const styles = StyleSheet.create({
  root: { zIndex: 999, backgroundColor: '#3A3935' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  stage: { alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute' },
  ring: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 1.5, borderColor: CHAMPAGNE },
  dotWrap: { position: 'absolute', width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  dotHalo: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,246,200,0.22)' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFBE0' },
  floor: { position: 'absolute', height: 14, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.45)' },
  shine: { position: 'absolute', top: -20, bottom: -20, left: 0, width: 70 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 8, maxWidth: '100%' },
  letter: { fontFamily: fonts.semibold, fontSize: 15, color: CHAMPAGNE, letterSpacing: 2.2 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 12 },
  track: { width: 180, height: 3, borderRadius: 2, backgroundColor: 'rgba(229,227,172,0.16)', overflow: 'hidden' },
  bar: { height: 3, borderRadius: 2, overflow: 'hidden' },
  statusBox: { height: 18, justifyContent: 'center' },
  status: { fontFamily: fonts.medium, fontSize: 13, color: 'rgba(255,255,255,0.72)', letterSpacing: 0.2 },
  copy: { fontFamily: fonts.medium, fontSize: 11, color: 'rgba(229,227,172,0.45)', letterSpacing: 1.2 },
});
