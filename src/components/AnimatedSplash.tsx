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
 *   8. Live loading percentage counter in the footer (loading line removed per user request)
 *   9. Clean luxury layout: "SHREE KARNI FABCOM LTD" (no portal subtitle)
 */
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
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
const MIN_VISIBLE_MS = 3800;

// Phase 1: Slow, stately, professional Rangoli expansion
const RINGS_AT   = 150;
const INNER_D_AT = 550;
const MID_D_AT   = 950;
const OUTER_D_AT = 1350;

// Phase 2: SKFL comes in center (strictly AFTER diamonds make)
const LOGO_AT    = 2100;
const NAME_AT    = 2650;

const MESSAGES = [
  'Preparing your workspace',
  'Verifying credentials',
  'Loading your dashboard',
  'Almost ready',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const rangoliSize = Math.min(W * 0.94, 380);
  const cx = W / 2;
  const cy = H * 0.40;

  // Center logo sized to fit harmoniously inside the inner sanctum of the rangoli
  const logoW = Math.min(118, W * 0.29);
  const logoH = (logoW * SKFL_VIEWBOX.height) / SKFL_VIEWBOX.width;

  const [minElapsed, setMinElapsed] = useState(false);
  const [msg, setMsg]               = useState(0);
  const [percent, setPercent]       = useState(0);

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
    cometProgress.set(withRepeat(withTiming(1, { duration: 3800, easing: Easing.linear }), -1, false));

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
    ringsScale.set(withDelay(RINGS_AT, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) })));
    innerDiamondsScale.set(withDelay(INNER_D_AT, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) })));
    midDiamondsScale.set(withDelay(MID_D_AT, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) })));
    outerDiamondsScale.set(withDelay(OUTER_D_AT, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) })));

    // 5. Phase 2: Then SKFL comes in center (after all diamonds are made)
    logoIn.set(withDelay(LOGO_AT, withTiming(1, { duration: 850, easing: Easing.out(Easing.cubic) })));

    // 6. Live loading percentage counter (smooth progression)
    const startTime = Date.now();
    const percentTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_VISIBLE_MS) {
        const ratio = elapsed / MIN_VISIBLE_MS;
        const currentP = Math.min(92, Math.round((1 - Math.pow(1 - ratio, 2.2)) * 92));
        setPercent(currentP);
      } else {
        setPercent(ready ? 100 : 94);
      }
    }, 40);

    const t1 = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    const t2 = setInterval(() => setMsg(m => Math.min(m + 1, MESSAGES.length - 1)), 950);

    return () => {
      clearTimeout(t1);
      clearInterval(t2);
      clearInterval(percentTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !minElapsed) return;
    setPercent(100);
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
  const nameBlockTop = cy + rangoliSize / 2 + 18;

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

        {/* ── Center Golden Aura Bloom (seamless, feathered) ── */}
        <CentreGlow cx={cx} cy={cy} size={logoW * 1.6} glowValue={glowVal} logoIn={logoIn} />

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

      {/* ── Footer ── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 32 }]}>
        {/* Sacred Diamond Trio Pulse */}
        <PetalDiamonds ready={!!(ready && minElapsed)} />

        {/* Live Percentage Counter (loading line removed) */}
        <View style={styles.percentContainer}>
          <Text style={styles.percentNumber}>{percent}%</Text>
        </View>

        {/* Status Message */}
        <View style={styles.statusBox}>
          <Animated.Text
            key={msg}
            entering={FadeIn.duration(240)}
            exiting={FadeOut.duration(140)}
            style={styles.status}
          >
            {MESSAGES[msg]}…
          </Animated.Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Golden aura blooming seamlessly at the central heart behind SKFL */
function CentreGlow({
  cx,
  cy,
  size,
  glowValue,
  logoIn,
}: {
  cx: number;
  cy: number;
  size: number;
  glowValue: SharedValue<number>;
  logoIn: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const baseGlow = logoIn.get() * 0.42;
    const breathe = glowValue.get() * 0.38;
    const opacity = baseGlow + breathe * logoIn.get();
    const scale = 0.90 + (0.12 * logoIn.get()) + (0.08 * glowValue.get());

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: cx - size / 2,
          top: cy - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: 'rgba(229, 227, 172, 0.20)',
        },
        style,
      ]}
    />
  );
}

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

/** 3 sacred diamonds that pulse in wave sequence, then lock gold on ready */
function PetalDiamonds({ ready }: { ready: boolean }) {
  return (
    <View style={styles.dotsRow}>
      {[0, 1, 2].map(i => (
        <DiamondPulse key={i} index={i} ready={ready} />
      ))}
    </View>
  );
}

function DiamondPulse({ index, ready }: { index: number; ready: boolean }) {
  const p = useSharedValue(0.4);

  useEffect(() => {
    if (ready) {
      p.set(withTiming(1, { duration: 300 }));
    } else {
      p.set(
        withDelay(
          index * 220,
          withRepeat(
            withSequence(
              withTiming(1, { duration: 500, easing: Easing.inOut(Easing.quad) }),
              withTiming(0.25, { duration: 500, easing: Easing.inOut(Easing.quad) }),
            ),
            -1,
            false,
          ),
        ),
      );
    }
  }, [p, index, ready]);

  const style = useAnimatedStyle(() => {
    const val = p.get();
    return {
      opacity: ready ? 1 : 0.35 + val * 0.65,
      transform: [
        { rotate: '45deg' },
        { scale: ready ? 1.2 : 0.85 + val * 0.3 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          width: 7,
          height: 7,
          borderWidth: 1,
          borderColor: ready ? '#FFFBE0' : GOLD,
          backgroundColor: ready ? GOLD : 'rgba(229, 227, 172, 0.25)',
          marginHorizontal: 5,
        },
        style,
      ]}
    />
  );
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
  },
  letter: {
    fontFamily: fonts.semibold,
    fontSize: 14.5,
    color: GOLD,
    letterSpacing: 2.8,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: 8,
  },

  percentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentNumber: {
    fontFamily: fonts.semibold,
    fontSize: 20,
    color: GOLD,
    letterSpacing: 1.2,
    fontVariant: ['tabular-nums'],
  },

  statusBox: {
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  status: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: 'rgba(255, 255, 255, 0.62)',
    letterSpacing: 0.4,
    textAlign: 'center',
  },

  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
