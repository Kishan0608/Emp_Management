/**
 * SKFL Loading Screen — Sacred Rangoli Mandala
 *
 * Stately, Slow, Luxury Cinematic Sequence:
 *   1. Concentric sacred rings expand outward with smooth cubic ease
 *   2. Inner sacred 16-point diamond star unfurls gracefully
 *   3. Mid diamond garland links into a continuous circular chain
 *   4. Grand outer diamond crown blooms like a sacred royal lotus
 *   5. Official SKFL emblem emerges seamlessly at the center of the Rangoli
 *   6. Continuous rhythmic breathing glow-and-unglow cycle ("time to time that unglow make")
 *   7. Active orbital loading comet tracer
 *   8. Clean luxury presentation (number loading and footer counters completely removed)
 *   9. Clean luxury layout: "SHREE KARNI FABCOM LTD" (no portal subtitle)
 */
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
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { fonts } from '@/theme/tokens';

import { RangoliMandala } from './brand/RangoliMandala';
import { SkflMark } from './brand/SkflLogo';
import { COMPANY, SKFL_VIEWBOX } from './brand/skflPaths';

// ── Palette ───────────────────────────────────────────────────────────────────
const INK        = '#070705';
const INK_MID    = '#0F0E0B';
const GOLD       = '#E5E3AC';
const GOLD_MID   = '#C9B96A';

// ── Timing (Slow, Stately, Professional) ───────────────────────────────────────
const MIN_VISIBLE_MS = 5000;

// Phase 1: Multi-directional sacred arrival (center outward, outer inward, mid orbital sweep)
const RINGS_AT   = 150; // Center rounds expand OUTWARD from the center
const OUTER_D_AT = 700; // Grand outer crown converges INWARD from the outside!
const MID_D_AT   = 1200; // Mid diamond garland sweeps along the ORBITAL track
const INNER_D_AT = 1700; // Inner diamond star & spoke rays radiate outward to bridge layers

// Phase 2: SKFL comes in center at the convergence heart
const LOGO_AT    = 2800;
const NAME_AT    = 3300;

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const { width: W, height: H } = useWindowDimensions();

  const rangoliSize = Math.min(W * 0.94, 380);
  const nameGap = 18;
  const nameHeight = 22;
  const groupTop = (H - (rangoliSize + nameGap + nameHeight)) / 2;
  const cx = W / 2;
  const cy = groupTop + rangoliSize / 2;

  // Centre logo sized to sit inside the rangoli's centre round with a margin at every
  // corner. RangoliMandala's CENTRE_GUIDE_R depends on this ratio — change them together.
  const logoW = Math.min(104, W * 0.26);
  const logoH = (logoW * SKFL_VIEWBOX.height) / SKFL_VIEWBOX.width;

  const [minElapsed, setMinElapsed] = useState(false);

  // ── Master Animation Values ──
  const exitV              = useSharedValue(1);
  const clock              = useSharedValue(0);  // continuous 60s slow rotation
  const cometProgress      = useSharedValue(0);  // 4s smooth orbital loading comet
  const glowVal            = useSharedValue(0);  // breathing glow & unglow (0 -> 1 -> 0)
  const ringsScale         = useSharedValue(0);  // rangoli round expansion
  const innerDiamondsScale = useSharedValue(0);  // inner diamond star
  const midDiamondsScale   = useSharedValue(0);  // mid garland diamonds
  const outerDiamondsScale = useSharedValue(0);  // grand outer diamond florets
  const logoIn             = useSharedValue(0);  // center SKFL reveal

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    // 1. Continuous rotation clock
    clock.set(withRepeat(withTiming(1, { duration: 60_000, easing: Easing.linear }), -1, false));

    // 2. Active orbital loading comet tracer (sweeps smoothly around diamond round)
    cometProgress.set(withRepeat(withTiming(1, { duration: 5000, easing: Easing.linear }), -1, false));

    // 3. Dynamic breathing "Glow & Unglow" loop (smooth 4.4s sinusoidal breath)
    glowVal.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), // slow glow up
          withTiming(1, { duration: 300 }),                                    // hold peak radiance
          withTiming(0, { duration: 1900, easing: Easing.inOut(Easing.sin) }), // smoothly unglow down
          withTiming(0, { duration: 400 }),                                    // gentle rest
        ),
        -1,
        false,
      ),
    );

    // 4. Phase 1: Apply rangoli round and all the diamonds make (slow, stately, professional)
    ringsScale.set(withDelay(RINGS_AT, withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) })));
    innerDiamondsScale.set(withDelay(INNER_D_AT, withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) })));
    midDiamondsScale.set(withDelay(MID_D_AT, withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) })));
    outerDiamondsScale.set(withDelay(OUTER_D_AT, withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) })));

    // 5. Phase 2: Then SKFL comes in center (after all diamonds are made)
    logoIn.set(withDelay(LOGO_AT, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) })));

    const t1 = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);

    return () => {
      clearTimeout(t1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !minElapsed) return;
    exitV.set(withDelay(180, withTiming(0, { duration: 520, easing: Easing.in(Easing.cubic) }, done => {
      if (done) runOnJS(onFinish)();
    })));
  }, [ready, minElapsed, exitV, onFinish]);

  // ── Animated Styles ──
  const rootStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, exitV.get() * 1.8) }));
  const exitZoom  = useAnimatedStyle(() => ({ transform: [{ scale: 1 + (1 - exitV.get()) * 0.28 }] }));

  // SKFL center entrance style (smooth, stately scale & opacity)
  const logoStyle = useAnimatedStyle(() => {
    const scale = 0.82 + logoIn.get() * 0.18;
    return {
      opacity: logoIn.get(),
      transform: [{ scale }],
    };
  });

  const letters = COMPANY.name.toUpperCase().split('');
  const nameBlockTop = cy + rangoliSize / 2 + nameGap;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, rootStyle]}
      pointerEvents={ready && minElapsed ? 'none' : 'auto'}
    >
      {/* ── Background ── */}
      <LinearGradient
        colors={[INK, INK_MID, '#14120E', INK]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Sacred Rangoli & Diamond Mandala ── */}
      <Animated.View style={[StyleSheet.absoluteFill, exitZoom]}>
        {/* The Rangoli Round with all diamonds, comet loading tracer, and glow & unglow */}
        <View
          style={{
            position: 'absolute',
            left: cx - rangoliSize / 2,
            top: cy - rangoliSize / 2,
            width: rangoliSize,
            height: rangoliSize,
          }}
          pointerEvents="none"
        >
          <RangoliMandala
            size={rangoliSize}
            ringsScale={ringsScale}
            innerDiamondsScale={innerDiamondsScale}
            midDiamondsScale={midDiamondsScale}
            outerDiamondsScale={outerDiamondsScale}
            glowValue={glowVal}
            clock={clock}
            cometProgress={cometProgress}
          />
        </View>

        {/* ── Center SKFL Logo (framed directly at the heart of the rangoli) ── */}
        <Animated.View
          style={[
            styles.logoCenter,
            {
              left: cx - logoW / 2,
              top: cy - logoH / 2,
              width: logoW,
              height: logoH,
            },
            logoStyle,
          ]}
        >
          {/* Centered SKFL Vector Mark */}
          <SkflMark
            width={logoW}
            animated
            delay={LOGO_AT + 80}
            stagger={70}
            duration={500}
          />

          {/* Luxury Shimmer Sweep */}
          <ShimmerSweep logoIn={logoIn} w={logoW} h={logoH} />
        </Animated.View>
      </Animated.View>

      {/* ── Company Name (without portal tagline) ── */}
      <View style={[styles.nameBlock, { top: nameBlockTop }]}>
        <View style={styles.nameRow}>
          {letters.map((ch, i) => (
            <MandalaLetter key={i} ch={ch} delay={NAME_AT + i * 35} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Horizontal luxury shimmer sweep across SKFL */
function ShimmerSweep({ logoIn, w, h }: { logoIn: SharedValue<number>; w: number; h: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.set(
      withDelay(
        LOGO_AT + 400,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 750, easing: Easing.inOut(Easing.quad) }),
            withTiming(1, { duration: 2500 }),
            withTiming(0, { duration: 0 }),
          ),
          -1,
          false,
        ),
      ),
    );
  }, [t]);

  const style = useAnimatedStyle(() => {
    const sweepProgress = t.get();
    const alpha = sweepProgress < 0.5 ? sweepProgress * 2 : (1 - sweepProgress) * 2;
    return {
      opacity: logoIn.get() * alpha * 0.70,
      transform: [{ translateX: -25 + sweepProgress * (w + 50) }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, height: h, width: 24, left: -12 }, style]}
    >
      <LinearGradient
        colors={['transparent', 'rgba(255, 253, 225, 0.70)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

/** Letter reveal — drop from above with gentle spring */
function MandalaLetter({ ch, delay }: { ch: string; delay: number }) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.set(withDelay(delay, withTiming(1, { duration: 550, easing: Easing.out(Easing.cubic) })));
  }, [delay, p]);

  const style = useAnimatedStyle(() => ({
    opacity: p.get(),
    transform: [
      { translateY: (1 - p.get()) * -10 },
      { scale: 0.80 + p.get() * 0.20 },
    ],
  }));

  return <Animated.Text style={[styles.letter, style]}>{ch === ' ' ? '\u00A0' : ch}</Animated.Text>;
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    zIndex: 999,
    backgroundColor: INK,
  },

  logoCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },

  nameBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingLeft: 2.8,
  },
  letter: {
    fontFamily: fonts.semibold,
    fontSize: 14.5,
    color: GOLD,
    letterSpacing: 2.8,
  },
});
