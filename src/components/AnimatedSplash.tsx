/**
 * SKFL Loading Screen — "The Mandala"
 *
 * Inspired by the sacred geometry motifs of Rajasthani textile art —
 * fitting for Shree Karni Fabcom Ltd, a fabric company with roots in
 * the artisan tradition of Rajasthan.
 *
 * Animation sequence:
 *   0.0 s  → centre point blooms: innermost ring expands
 *   0.4 s  → 6 diamond petals emerge between rings
 *   0.8 s  → second ring expands outward
 *   1.2 s  → arc segments appear on outer ring
 *   1.6 s  → logo crystallises at the mandala heart
 *   2.0 s  → company name cascades letter by letter
 *   ∞      → all rings rotate at different speeds, petals breathe
 *   ready  → mandala contracts inward, logo launches into the app
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
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts } from '@/theme/tokens';

import { SkflMark } from './brand/SkflLogo';
import { COMPANY, SKFL_VIEWBOX } from './brand/skflPaths';

// ── Palette ───────────────────────────────────────────────────────────────────
const INK        = '#080706';
const INK_2      = '#100F0C';
const GOLD       = '#E5E3AC';
const GOLD_MID   = '#C9B96A';
const GOLD_DARK  = '#8A7730';
const GOLD_GLOW  = 'rgba(229,227,172,0.22)';
const PETAL_FILL = 'rgba(229,227,172,0.08)';
const RING_CLR   = 'rgba(229,227,172,0.30)';

// ── Timing ────────────────────────────────────────────────────────────────────
const MIN_VISIBLE_MS = 3000;
const RING1_AT   = 0;
const PETALS_AT  = 380;
const RING2_AT   = 760;
const RING3_AT   = 1100;
const LOGO_AT    = 1500;
const LOGO_DUR   = 900;
const NAME_AT    = LOGO_AT + 600;

const MESSAGES = [
  'Preparing your workspace',
  'Verifying credentials',
  'Loading your dashboard',
  'Almost ready',
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
const DEG = Math.PI / 180;
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  'worklet';
  return {
    x: cx + r * Math.cos(angleDeg * DEG),
    y: cy + r * Math.sin(angleDeg * DEG),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const cx = W / 2;
  const cy = H * 0.42;

  const logoW = Math.min(220, W * 0.52);
  const logoH = (logoW * SKFL_VIEWBOX.height) / SKFL_VIEWBOX.width;

  // Rings radii relative to screen
  const R1 = Math.min(W, H) * 0.14;
  const R2 = Math.min(W, H) * 0.26;
  const R3 = Math.min(W, H) * 0.40;

  const [minElapsed, setMinElapsed] = useState(false);
  const [msg, setMsg]               = useState(0);

  // Master animation values
  const exitV    = useSharedValue(1);
  const clock    = useSharedValue(0);  // continuous 0→1 loop
  const breathe  = useSharedValue(0);
  const logoIn   = useSharedValue(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    // Continuous master clock (10 s period)
    clock.set(withRepeat(withTiming(1, { duration: 10_000, easing: Easing.linear }), -1, false));
    // Slow breathe
    breathe.set(withRepeat(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }), -1, true));
    // Logo
    logoIn.set(withDelay(LOGO_AT, withTiming(1, { duration: LOGO_DUR, easing: Easing.out(Easing.cubic) })));
    // Progress
    progress.set(withTiming(0.84, { duration: MIN_VISIBLE_MS, easing: Easing.out(Easing.cubic) }));

    const t1 = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    const t2 = setInterval(() => setMsg(m => Math.min(m + 1, MESSAGES.length - 1)), 880);
    return () => { clearTimeout(t1); clearInterval(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !minElapsed) return;
    progress.set(withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }));
    exitV.set(withDelay(180, withTiming(0, { duration: 540, easing: Easing.in(Easing.cubic) }, done => {
      if (done) runOnJS(onFinish)();
    })));
  }, [ready, minElapsed, exitV, progress, onFinish]);

  // ── Animated styles ──
  const rootStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, exitV.get() * 1.8) }));
  const exitZoom  = useAnimatedStyle(() => ({ transform: [{ scale: 1 + (1 - exitV.get()) * 0.3 }] }));
  const barStyle  = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity:   logoIn.get(),
    transform: [
      { translateY: Math.sin(breathe.get() * Math.PI) * -4 * logoIn.get() },
      { scale: 0.88 + logoIn.get() * 0.12 },
    ],
  }));

  // Ring1 — slow CW rotation
  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${clock.get() * 120}deg` }],
  }));
  // Ring2 — CCW, slightly faster
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-clock.get() * 90}deg` }],
  }));
  // Ring3 — CW, slow
  const ring3Style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${clock.get() * 45}deg` }],
  }));

  const letters = COMPANY.name.toUpperCase().split('');

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, rootStyle]}
      pointerEvents={ready && minElapsed ? 'none' : 'auto'}
    >
      {/* ── Background ── */}
      <LinearGradient
        colors={[INK, '#0E0D0A', INK_2, '#161410']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle warm radial from center */}
      <View
        pointerEvents="none"
        style={[styles.bgRadial, {
          width:  R3 * 3.5,
          height: R3 * 3.5,
          borderRadius: R3 * 1.75,
          left: cx - R3 * 1.75,
          top:  cy - R3 * 1.75,
        }]}
      />

      {/* ── Mandala ── */}
      <Animated.View style={[StyleSheet.absoluteFill, exitZoom]}>

        {/* ── Ring 3 (outermost) — arc-dotted ── */}
        <RingExpand delay={RING3_AT} cx={cx} cy={cy} r={R3}>
          <Animated.View style={[styles.ringWrap, { width: R3 * 2, height: R3 * 2, borderRadius: R3 }, ring3Style]}>
            <ArcDots cx={R3} cy={R3} r={R3} count={24} />
          </Animated.View>
        </RingExpand>

        {/* ── Ring 2 — dashed circle ── */}
        <RingExpand delay={RING2_AT} cx={cx} cy={cy} r={R2}>
          <Animated.View style={[styles.ringWrap, { width: R2 * 2, height: R2 * 2, borderRadius: R2, borderWidth: 1, borderColor: RING_CLR, borderStyle: 'dashed' }, ring2Style]} />
        </RingExpand>

        {/* ── 6 Diamond petals (between R1 and R2) ── */}
        {[0, 60, 120, 180, 240, 300].map((angle, i) => (
          <DiamondPetal
            key={i}
            cx={cx}
            cy={cy}
            angle={angle}
            r={(R1 + R2) / 2}
            size={Math.min(R2 - R1, 28)}
            delay={PETALS_AT + i * 70}
            clock={clock}
          />
        ))}

        {/* ── 12 Tick marks on R2 ── */}
        {Array.from({ length: 12 }, (_, i) => (
          <TickMark
            key={i}
            cx={cx}
            cy={cy}
            angle={i * 30}
            r={R2}
            delay={RING2_AT + i * 40}
          />
        ))}

        {/* ── Ring 1 (innermost) — solid ring ── */}
        <RingExpand delay={RING1_AT} cx={cx} cy={cy} r={R1}>
          <Animated.View style={[styles.ringWrap, { width: R1 * 2, height: R1 * 2, borderRadius: R1, borderWidth: 1.5, borderColor: GOLD_MID }, ring1Style]}>
            {/* 4 corner diamonds on ring 1 */}
            {[0, 90, 180, 270].map((a, i) => (
              <SmallDot key={i} cx={R1} cy={R1} angle={a} r={R1} />
            ))}
          </Animated.View>
        </RingExpand>

        {/* ── Centre glow ── */}
        <CentreGlow cx={cx} cy={cy} r={R1} breathe={breathe} logoIn={logoIn} />

        {/* ── Logo card ── */}
        <Animated.View
          style={[styles.logoCard, {
            width:  logoW + 28,
            height: logoH + 22,
            left:   cx - (logoW + 28) / 2,
            top:    cy - (logoH + 22) / 2,
          }, logoStyle]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.06)', 'rgba(229,227,172,0.025)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: 18 }]}
          />
          {/* Four corner accent lines */}
          <CornerAccents size={14} />
          <View style={{ padding: 11, alignItems: 'center' }}>
            <SkflMark
              width={logoW}
              animated
              delay={LOGO_AT + 100}
              stagger={100}
              duration={500}
            />
          </View>
          {/* Shimmer sweep */}
          <ShimmerSweep logoIn={logoIn} w={logoW + 28} h={logoH + 22} />
        </Animated.View>

        {/* ── Outer decorative dots on R3 ── */}
        {[30, 90, 150, 210, 270, 330].map((angle, i) => (
          <OuterGlowDot
            key={i}
            cx={cx}
            cy={cy}
            angle={angle}
            r={R3}
            delay={RING3_AT + i * 60}
          />
        ))}
      </Animated.View>

      {/* ── Company name ── */}
      <View style={styles.nameBlock}>
        <View style={styles.nameRow}>
          {letters.map((ch, i) => (
            <MandalaLetter key={i} ch={ch} delay={NAME_AT + i * 40} />
          ))}
        </View>
        <TagLine delay={NAME_AT + letters.length * 40 + 80} />
      </View>

      {/* ── Footer ── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 28 }]}>
        {/* Petal pulse dots */}
        <PetalDots ready={!!(ready && minElapsed)} />

        {/* Progress bar */}
        <View style={styles.track}>
          <Animated.View style={[styles.bar, barStyle]}>
            <LinearGradient
              colors={[GOLD_DARK, GOLD_MID, GOLD, '#FFFBE0', GOLD_MID]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </View>

        {/* Status */}
        <View style={styles.statusBox}>
          <Animated.Text
            key={msg}
            entering={FadeIn.duration(280)}
            exiting={FadeOut.duration(140)}
            style={styles.status}
          >
            {MESSAGES[msg]}…
          </Animated.Text>
        </View>

        <Text style={styles.copy}>{COMPANY.short} · Employee workspace</Text>
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** A ring that expands from centre outward */
function RingExpand({
  delay, cx, cy, r, children,
}: {
  delay: number; cx: number; cy: number; r: number; children: React.ReactNode;
}) {
  const s = useSharedValue(0);
  const o = useSharedValue(0);
  useEffect(() => {
    o.set(withDelay(delay, withTiming(1, { duration: 300 })));
    s.set(withDelay(delay, withSpring(1, { damping: 14, stiffness: 80 })));
  }, [s, o, delay]);
  const style = useAnimatedStyle(() => ({
    opacity:   o.get(),
    transform: [{ scale: s.get() }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: cx - r, top: cy - r, width: r * 2, height: r * 2, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      {children}
    </Animated.View>
  );
}

/** 24 equally-spaced tiny dots forming a dashed outer ring */
function ArcDots({ cx, cy, r, count }: { cx: number; cy: number; r: number; count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const a   = (i / count) * 360 * DEG;
        const x   = cx + (r - 2) * Math.cos(a);
        const y   = cy + (r - 2) * Math.sin(a);
        const big = i % 4 === 0;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: x - (big ? 2.5 : 1.5),
              top:  y - (big ? 2.5 : 1.5),
              width:  big ? 5 : 3,
              height: big ? 5 : 3,
              borderRadius: big ? 2.5 : 1.5,
              backgroundColor: big ? GOLD_MID : RING_CLR,
            }}
          />
        );
      })}
    </>
  );
}

/** Small dot at a given angle on a ring */
function SmallDot({ cx, cy, angle, r }: { cx: number; cy: number; angle: number; r: number }) {
  const x = cx + r * Math.cos(angle * DEG);
  const y = cy + r * Math.sin(angle * DEG);
  return (
    <View style={{ position: 'absolute', left: x - 4, top: y - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD_MID }} />
  );
}

/** Tick mark radiating outward from a ring */
function TickMark({ cx, cy, angle, r, delay }: { cx: number; cy: number; angle: number; r: number; delay: number }) {
  const o = useSharedValue(0);
  useEffect(() => {
    o.set(withDelay(delay, withTiming(1, { duration: 260 })));
  }, [o, delay]);
  const style = useAnimatedStyle(() => ({ opacity: o.get() * 0.55 }));

  const inner = polar(cx, cy, r - 6, angle);
  const outer = polar(cx, cy, r + 6, angle);
  const len   = 12;
  const midX  = (inner.x + outer.x) / 2;
  const midY  = (inner.y + outer.y) / 2;

  return (
    <Animated.View
      pointerEvents="none"
      style={[{
        position: 'absolute',
        left: midX - 1,
        top:  midY - len / 2,
        width: 2,
        height: len,
        borderRadius: 1,
        backgroundColor: GOLD_MID,
        transformOrigin: 'center',
        transform: [{ rotate: `${angle + 90}deg` }],
      } as any, style]}
    />
  );
}

/** Diamond petal that orbits slowly */
function DiamondPetal({
  cx, cy, angle, r, size, delay, clock,
}: {
  cx: number; cy: number; angle: number; r: number; size: number; delay: number;
  clock: SharedValue<number>;
}) {
  const appear = useSharedValue(0);
  const breathe = useSharedValue(0);
  useEffect(() => {
    appear.set(withDelay(delay, withSpring(1, { damping: 12, stiffness: 90 })));
    breathe.set(withDelay(delay + 200,
      withRepeat(withTiming(1, { duration: 2000 + Math.random() * 800, easing: Easing.inOut(Easing.sin) }), -1, true)
    ));
  }, [appear, breathe, delay]);

  const style = useAnimatedStyle(() => {
    const drift = clock.get() * 30; // slow orbit drift
    const pos   = polar(cx, cy, r, angle + drift);
    return {
      opacity:   appear.get() * (0.6 + breathe.get() * 0.4),
      transform: [
        { translateX: pos.x - cx },
        { translateY: pos.y - cy },
        { rotate: `${angle + drift + 45}deg` },
        { scale: appear.get() * (0.7 + breathe.get() * 0.3) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[{
        position: 'absolute',
        left: cx - size / 2,
        top:  cy - size / 2,
        width:  size,
        height: size,
        borderWidth: 1.2,
        borderColor: GOLD_MID,
        backgroundColor: PETAL_FILL,
      }, style]}
    />
  );
}

/** Glowing dot on the outer ring */
function OuterGlowDot({ cx, cy, angle, r, delay }: { cx: number; cy: number; angle: number; r: number; delay: number }) {
  const o = useSharedValue(0);
  useEffect(() => {
    o.set(withDelay(delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
          withTiming(1,   { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1, false,
      ),
    ));
  }, [o, delay]);

  const pos = polar(cx, cy, r, angle);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: pos.x - 6, top: pos.y - 6 }, style]}
    >
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: GOLD_GLOW, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: GOLD_MID }} />
      </View>
    </Animated.View>
  );
}

/** Warm glow behind the logo */
function CentreGlow({ cx, cy, r, breathe, logoIn }: {
  cx: number; cy: number; r: number;
  breathe: SharedValue<number>; logoIn: SharedValue<number>;
}) {
  const size = r * 3.5;
  const style = useAnimatedStyle(() => ({
    opacity:   logoIn.get() * (0.28 + breathe.get() * 0.25),
    transform: [{ scale: 0.85 + breathe.get() * 0.2 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{
        position: 'absolute',
        left: cx - size / 2,
        top:  cy - size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
      }, style]}
    >
      <LinearGradient
        colors={['rgba(229,227,172,0.38)', 'rgba(200,180,100,0.10)', 'transparent']}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, borderRadius: size / 2 }}
      />
    </Animated.View>
  );
}

/** Four corner "L" accent marks on the logo card */
function CornerAccents({ size }: { size: number }) {
  const corners = [
    { top: 0, left: 0, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
    { top: 0, right: 0, borderTopWidth: 1.5, borderRightWidth: 1.5 },
    { bottom: 0, left: 0, borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
    { bottom: 0, right: 0, borderBottomWidth: 1.5, borderRightWidth: 1.5 },
  ];
  return (
    <>
      {corners.map((s, i) => (
        <View
          key={i}
          style={[{
            position: 'absolute',
            width: size,
            height: size,
            borderColor: GOLD_MID,
          }, s]}
        />
      ))}
    </>
  );
}

/** Horizontal shimmer sweep across the logo */
function ShimmerSweep({ logoIn, w, h }: { logoIn: SharedValue<number>; w: number; h: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(LOGO_AT + 300,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 1600 }),
          withTiming(0, { duration: 0 }),
        ),
        -1, false,
      ),
    ));
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity:   logoIn.get() * (t.get() < 0.5 ? t.get() * 2 : (1 - t.get()) * 2) * 0.65,
    transform: [{ translateX: -30 + t.get() * (w + 60) }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, height: h, width: 28, left: -14 }, style]}
    >
      <LinearGradient
        colors={['transparent', 'rgba(255,253,225,0.7)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

/** Letter reveal — drop from above with spring */
function MandalaLetter({ ch, delay }: { ch: string; delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(delay, withSpring(1, { damping: 12, stiffness: 100 })));
  }, [delay, p]);
  const style = useAnimatedStyle(() => ({
    opacity:   Math.min(1, p.get() * 1.4),
    transform: [
      { translateY: (1 - p.get()) * -18 },
      { scale: 0.68 + p.get() * 0.32 },
    ],
  }));
  return <Animated.Text style={[styles.letter, style]}>{ch === ' ' ? '\u00A0' : ch}</Animated.Text>;
}

function TagLine({ delay }: { delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(delay, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })));
  }, [delay, p]);
  const style = useAnimatedStyle(() => ({
    opacity:   p.get() * 0.42,
    transform: [{ translateY: (1 - p.get()) * 6 }],
  }));
  return <Animated.Text style={[styles.tagline, style]}>Employee Management Portal</Animated.Text>;
}

/** 3 dots that blossom like mandala petals, then lock gold on ready */
function PetalDots({ ready }: { ready: boolean }) {
  return (
    <View style={styles.dotsRow}>
      {[0, 1, 2].map(i => <PetalDot key={i} index={i} ready={ready} />)}
    </View>
  );
}

function PetalDot({ index, ready }: { index: number; ready: boolean }) {
  const r = useSharedValue(3);
  useEffect(() => {
    if (ready) {
      r.set(withSpring(7, { damping: 6, stiffness: 180 }));
    } else {
      r.set(withDelay(
        index * 200,
        withRepeat(
          withSequence(
            withTiming(6.5, { duration: 420, easing: Easing.out(Easing.quad) }),
            withTiming(3.0, { duration: 420, easing: Easing.in(Easing.quad) }),
          ),
          -1, false,
        ),
      ));
    }
  }, [r, index, ready]);

  const style = useAnimatedStyle(() => ({
    width:           r.get() * 2,
    height:          r.get() * 2,
    borderRadius:    r.get(),
    opacity:         ready ? 1 : 0.4 + (r.get() - 3) / 3.5 * 0.6,
    backgroundColor: ready ? GOLD : GOLD_MID,
    marginHorizontal: 4,
  }));

  return <Animated.View style={style} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { zIndex: 999, backgroundColor: INK },

  bgRadial: {
    position: 'absolute',
    backgroundColor: 'rgba(229,227,172,0.032)',
  },

  ringWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoCard: {
    position: 'absolute',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(229,227,172,0.18)',
    overflow: 'hidden',
  },

  nameBlock: { position: 'absolute', left: 0, right: 0, bottom: 155, alignItems: 'center' },
  nameRow:   { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  letter:    { fontFamily: fonts.semibold, fontSize: 14, color: GOLD, letterSpacing: 2.8 },
  tagline:   {
    fontFamily: fonts.regular, fontSize: 11,
    color: 'rgba(255,255,255,0.52)', letterSpacing: 1.5, marginTop: 5,
  },

  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 10 },

  dotsRow: { flexDirection: 'row', alignItems: 'center' },

  track: {
    width: 200, height: 2.5, borderRadius: 2,
    backgroundColor: 'rgba(229,227,172,0.11)', overflow: 'hidden',
  },
  bar: { height: 2.5, borderRadius: 2, overflow: 'hidden' },

  statusBox: { height: 16, justifyContent: 'center' },
  status:    { fontFamily: fonts.medium, fontSize: 12, color: 'rgba(255,255,255,0.65)', letterSpacing: 0.3 },
  copy:      { fontFamily: fonts.medium, fontSize: 10.5, color: 'rgba(229,227,172,0.38)', letterSpacing: 1.4 },
});
