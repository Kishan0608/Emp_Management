/**
 * Rangoli Mandala — Sacred Geometric Textile & Diamond Motif
 *
 * Designed for Shree Karni Fabcom Ltd (SKFL).
 * Professional, slow, stately, luxury aesthetic:
 *   - Stately concentric rounds expanding outward without jerky twists
 *   - 16-point Inner Sacred Diamond Star
 *   - Mid Rangoli Round with 16 linked Diamond Garlands and lotus scallop arches
 *   - Grand Outer Rangoli Crown with 16 Diamond Florets, pearl teardrops, and celestial halos
 *   - Central golden sanctum core designed to frame SKFL seamlessly
 *   - True feathered Optical Radial Glow (SVG RadialGradient)
 *   - Smooth Orbital Loading Comet Tracer orbiting the diamond track
 *   - Rhythmic Slow Glow & Unglow breathing cycle ("time to time unglow make")
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, RadialGradient, Stop } from 'react-native-svg';

// ── Palette ───────────────────────────────────────────────────────────────────
export const RANGOLI_COLORS = {
  GOLD: '#E5E3AC',
  GOLD_BRIGHT: '#FFFBE0',
  GOLD_MID: '#C9B96A',
  GOLD_DARK: '#8A7730',
  GOLD_DEEP: '#5E4E1C',
  LINE_BASE: 'rgba(229, 227, 172, 0.45)',
  LINE_GUIDE: 'rgba(201, 185, 106, 0.28)',
  DIAMOND_FILL_BASE: 'rgba(229, 227, 172, 0.05)',
  DIAMOND_FILL_GLOW: 'rgba(255, 245, 180, 0.22)',
} as const;

// ── Coordinate Helpers ────────────────────────────────────────────────────────
const DEG = Math.PI / 180;

function polar(r: number, deg: number) {
  const rad = deg * DEG;
  return {
    x: Number((r * Math.cos(rad)).toFixed(2)),
    y: Number((r * Math.sin(rad)).toFixed(2)),
  };
}

/** Generate SVG path for a 4-point diamond (rhombus) */
function makeDiamond(
  innerR: number,
  outerR: number,
  centerR: number,
  angleDeg: number,
  halfWidthDeg: number,
): string {
  const top = polar(outerR, angleDeg);
  const right = polar(centerR, angleDeg + halfWidthDeg);
  const bottom = polar(innerR, angleDeg);
  const left = polar(centerR, angleDeg - halfWidthDeg);
  return `M ${top.x} ${top.y} L ${right.x} ${right.y} L ${bottom.x} ${bottom.y} L ${left.x} ${left.y} Z`;
}

/** Scalloped arch connecting two diamond tips */
function makeArch(r: number, rPeak: number, startDeg: number, endDeg: number): string {
  const p1 = polar(r, startDeg);
  const p2 = polar(r, endDeg);
  const mid = polar(rPeak, (startDeg + endDeg) / 2);
  return `M ${p1.x} ${p1.y} Q ${mid.x} ${mid.y} ${p2.x} ${p2.y}`;
}

export interface RangoliMandalaProps {
  size: number;
  ringsScale: SharedValue<number>;
  innerDiamondsScale: SharedValue<number>;
  midDiamondsScale: SharedValue<number>;
  outerDiamondsScale: SharedValue<number>;
  glowValue: SharedValue<number>;
  clock: SharedValue<number>;
  cometProgress: SharedValue<number>;
}

export function RangoliMandala({
  size,
  ringsScale,
  innerDiamondsScale,
  midDiamondsScale,
  outerDiamondsScale,
  glowValue,
  clock,
  cometProgress,
}: RangoliMandalaProps) {
  // Precompute the intricate geometry once
  const geometry = useMemo(() => {
    // 1. Inner Diamond Star (8 major diamonds + 8 secondary diamond points)
    const majorDiamonds: string[] = [];
    const majorInnerDiamonds: string[] = [];
    const majorDiamondPearls: { x: number; y: number }[] = [];
    const secondaryDiamonds: string[] = [];
    const secondaryPearls: { x: number; y: number }[] = [];

    for (let i = 0; i < 8; i++) {
      const a = i * 45;
      majorDiamonds.push(makeDiamond(74, 110, 92, a, 10.5));
      majorInnerDiamonds.push(makeDiamond(80, 104, 92, a, 6.0));
      majorDiamondPearls.push(polar(92, a));

      const secA = a + 22.5;
      secondaryDiamonds.push(makeDiamond(76, 102, 89, secA, 4.8));
      secondaryPearls.push(polar(105, secA));
    }

    // 2. Mid Diamond Garland (16 continuous linked diamonds + arches)
    const garlandDiamonds: string[] = [];
    const garlandInnerDiamonds: string[] = [];
    const garlandPearls: { x: number; y: number }[] = [];
    const garlandArches: string[] = [];

    for (let i = 0; i < 16; i++) {
      const a = i * 22.5;
      garlandDiamonds.push(makeDiamond(116, 144, 130, a, 6.6));
      garlandInnerDiamonds.push(makeDiamond(121, 139, 130, a, 3.8));
      garlandPearls.push(polar(130, a));

      // Arch linking to next diamond
      const nextA = (i + 1) * 22.5;
      garlandArches.push(makeArch(130, 136.5, a + 6.6, nextA - 6.6));
    }

    // 3. Grand Outer Diamond Crown (16 outer florets + lotus arches)
    const outerDiamonds: string[] = [];
    const outerInnerDiamonds: string[] = [];
    const outerTipPearls: { x: number; y: number }[] = [];
    const outerBaseArches: string[] = [];

    for (let i = 0; i < 16; i++) {
      const a = i * 22.5 + 11.25;
      outerDiamonds.push(makeDiamond(149, 185, 167, a, 7.5));
      outerInnerDiamonds.push(makeDiamond(155, 178, 167, a, 4.2));
      outerTipPearls.push(polar(190, a));

      const nextA = (i + 1) * 22.5 + 11.25;
      outerBaseArches.push(makeArch(149, 155, a + 7.5, nextA - 7.5));
    }

    // 4. Circular pearls
    const sanctumInnerPearls: { x: number; y: number }[] = [];
    for (let i = 0; i < 16; i++) {
      sanctumInnerPearls.push(polar(50, i * 22.5));
    }

    const corePearls: { x: number; y: number }[] = [];
    for (let i = 0; i < 24; i++) {
      corePearls.push(polar(62, i * 15));
    }

    const celestialPearls: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < 32; i++) {
      celestialPearls.push({
        ...polar(196, i * 11.25),
        r: i % 2 === 0 ? 1.6 : 1.0,
      });
    }

    return {
      majorDiamonds,
      majorInnerDiamonds,
      majorDiamondPearls,
      secondaryDiamonds,
      secondaryPearls,
      garlandDiamonds,
      garlandInnerDiamonds,
      garlandPearls,
      garlandArches,
      outerDiamonds,
      outerInnerDiamonds,
      outerTipPearls,
      outerBaseArches,
      sanctumInnerPearls,
      corePearls,
      celestialPearls,
    };
  }, []);

  // ── Reanimated Transformations (Stately, Slow, Luxury Cinematic) ────────────

  // 1. Concentric Rounds — smooth majestic expansion
  const ringsStyle = useAnimatedStyle(() => {
    const s = ringsScale.get();
    return {
      opacity: s,
      transform: [{ scale: s }],
    };
  });

  // 2. Inner Diamonds — graceful outward bloom with gentle micro-drift
  const innerDiamondsStyle = useAnimatedStyle(() => {
    const s = innerDiamondsScale.get();
    const rot = clock.get() * 12; // slow, dignified 60s rotation
    return {
      opacity: s,
      transform: [{ scale: s }, { rotate: `${rot}deg` }],
    };
  });

  // 3. Mid Garland — continuous linked diamond garland with gentle counter-drift
  const midGarlandStyle = useAnimatedStyle(() => {
    const s = midDiamondsScale.get();
    const rot = -clock.get() * 16; // slow dignified counter-drift
    return {
      opacity: s,
      transform: [{ scale: s }, { rotate: `${rot}deg` }],
    };
  });

  // 4. Grand Outer Crown — unfolds like a royal lotus
  const outerCrownStyle = useAnimatedStyle(() => {
    const s = outerDiamondsScale.get();
    const rot = clock.get() * 8; // stately outer drift
    return {
      opacity: s,
      transform: [{ scale: s }, { rotate: `${rot}deg` }],
    };
  });

  // 5. Dynamic Optical Radial Glow Aura (breathing scale & opacity)
  const glowAuraStyle = useAnimatedStyle(() => {
    const g = glowValue.get();
    return {
      opacity: 0.20 + g * 0.70,
      transform: [{ scale: 0.94 + g * 0.12 }],
    };
  });

  // 6. Glowing & unglowing linework luster overlay
  const glowOverlayStyle = useAnimatedStyle(() => {
    const g = glowValue.get();
    return {
      opacity: 0.08 + g * 0.92,
    };
  });

  // 7. Active Orbital Loading Comet Tracer (smooth continuous orbit)
  const cometStyle = useAnimatedStyle(() => {
    const angle = cometProgress.get() * 360;
    return {
      transform: [{ rotate: `${angle}deg` }],
    };
  });

  return (
    <View style={[styles.container, { width: size, height: size }]} pointerEvents="none">
      {/* ── True Feathered Optical Radial Glow (SVG RadialGradient) ── */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, glowAuraStyle]}>
        <Svg width={size * 1.15} height={size * 1.15} viewBox="-220 -220 440 440">
          <Defs>
            <RadialGradient id="rangoliGlowGrad" cx="0%" cy="0%" r="50%" fx="0%" fy="0%">
              <Stop offset="0%" stopColor="#FFF4B8" stopOpacity="0.48" />
              <Stop offset="26%" stopColor="#E5E3AC" stopOpacity="0.30" />
              <Stop offset="58%" stopColor="#C9B96A" stopOpacity="0.14" />
              <Stop offset="82%" stopColor="#8A7730" stopOpacity="0.04" />
              <Stop offset="100%" stopColor="#070705" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="0" cy="0" r="215" fill="url(#rangoliGlowGrad)" />
        </Svg>
      </Animated.View>

      {/* ════════════════════════════════════════════════════════════════════════
          PASS 1: Base Rangoli Linework (Crisp Antique Champagne Gold)
          Always visible, provides grounding structure & fine filigree detail
         ════════════════════════════════════════════════════════════════════════ */}

      {/* 1. Concentric Rangoli Rounds & Central Sanctum */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, ringsStyle]}>
        <Svg width={size} height={size} viewBox="-210 -210 420 420">
          <Defs>
            <LinearGradient id="goldRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#C9B96A" stopOpacity="0.85" />
              <Stop offset="50%" stopColor="#E5E3AC" stopOpacity="0.95" />
              <Stop offset="100%" stopColor="#8A7730" stopOpacity="0.75" />
            </LinearGradient>
            <RadialGradient id="coreSoftAura" cx="0%" cy="0%" r="50%">
              <Stop offset="0%" stopColor="#E5E3AC" stopOpacity="0.16" />
              <Stop offset="65%" stopColor="#C9B96A" stopOpacity="0.06" />
              <Stop offset="100%" stopColor="#070705" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* Central Sanctum Soft Radial Backdrop (seamless, no harsh edges) */}
          <Circle cx="0" cy="0" r="68" fill="url(#coreSoftAura)" />

          {/* Central Sanctum Rings (framing the SKFL heart) */}
          <Circle cx="0" cy="0" r="48" stroke={RANGOLI_COLORS.LINE_GUIDE} strokeWidth="0.8" fill="none" />
          <Circle cx="0" cy="0" r="54" stroke="url(#goldRingGrad)" strokeWidth="1.2" fill="none" />
          <Circle cx="0" cy="0" r="70" stroke={RANGOLI_COLORS.LINE_GUIDE} strokeWidth="1" strokeDasharray="3, 4" fill="none" />
          <Circle cx="0" cy="0" r="74" stroke="url(#goldRingGrad)" strokeWidth="1.4" fill="none" />

          {/* Sanctum inner pearl dots */}
          {geometry.sanctumInnerPearls.map((p, i) => (
            <Circle key={`s-p-${i}`} cx={p.x} cy={p.y} r="1.0" fill={RANGOLI_COLORS.GOLD_MID} />
          ))}

          {/* Core Sanctum pearl dots */}
          {geometry.corePearls.map((p, i) => (
            <Circle key={`core-p-${i}`} cx={p.x} cy={p.y} r="1.3" fill={RANGOLI_COLORS.GOLD_MID} />
          ))}

          {/* Guideline Rings for Mid & Outer Rangoli */}
          <Circle cx="0" cy="0" r="113" stroke={RANGOLI_COLORS.LINE_GUIDE} strokeWidth="1" fill="none" />
          <Circle cx="0" cy="0" r="116" stroke="url(#goldRingGrad)" strokeWidth="1.2" strokeDasharray="4, 3" fill="none" />
          <Circle cx="0" cy="0" r="145" stroke="url(#goldRingGrad)" strokeWidth="1.2" strokeDasharray="4, 3" fill="none" />
          <Circle cx="0" cy="0" r="148" stroke="url(#goldRingGrad)" strokeWidth="1.5" fill="none" />
          <Circle cx="0" cy="0" r="167" stroke={RANGOLI_COLORS.LINE_GUIDE} strokeWidth="1" strokeDasharray="3, 5" fill="none" />
        </Svg>
      </Animated.View>

      {/* 2. Inner Sacred Diamond Star Layer */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, innerDiamondsStyle]}>
        <Svg width={size} height={size} viewBox="-210 -210 420 420">
          <G stroke={RANGOLI_COLORS.GOLD_MID} strokeWidth="1.2" fill={RANGOLI_COLORS.DIAMOND_FILL_BASE}>
            {geometry.majorDiamonds.map((d, i) => (
              <Path key={`maj-d-${i}`} d={d} />
            ))}
          </G>
          <G stroke={RANGOLI_COLORS.GOLD} strokeWidth="0.9" fill="none">
            {geometry.majorInnerDiamonds.map((d, i) => (
              <Path key={`maj-in-${i}`} d={d} />
            ))}
          </G>
          {geometry.majorDiamondPearls.map((p, i) => (
            <Circle key={`maj-p-${i}`} cx={p.x} cy={p.y} r="1.6" fill={RANGOLI_COLORS.GOLD} />
          ))}

          {/* Secondary Star Diamonds */}
          <G stroke={RANGOLI_COLORS.GOLD_MID} strokeWidth="1" fill="none">
            {geometry.secondaryDiamonds.map((d, i) => (
              <Path key={`sec-d-${i}`} d={d} />
            ))}
          </G>
          {geometry.secondaryPearls.map((p, i) => (
            <Circle key={`sec-p-${i}`} cx={p.x} cy={p.y} r="1.2" fill={RANGOLI_COLORS.GOLD_BRIGHT} />
          ))}
        </Svg>
      </Animated.View>

      {/* 3. Mid Diamond Garland Layer */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, midGarlandStyle]}>
        <Svg width={size} height={size} viewBox="-210 -210 420 420">
          {/* Connecting Lotus Arches */}
          <G stroke={RANGOLI_COLORS.GOLD_MID} strokeWidth="1.1" fill="none">
            {geometry.garlandArches.map((d, i) => (
              <Path key={`g-arch-${i}`} d={d} />
            ))}
          </G>

          {/* 16 Garland Diamonds */}
          <G stroke={RANGOLI_COLORS.GOLD_MID} strokeWidth="1.2" fill={RANGOLI_COLORS.DIAMOND_FILL_BASE}>
            {geometry.garlandDiamonds.map((d, i) => (
              <Path key={`g-dia-${i}`} d={d} />
            ))}
          </G>
          <G stroke={RANGOLI_COLORS.GOLD} strokeWidth="0.8" fill="none">
            {geometry.garlandInnerDiamonds.map((d, i) => (
              <Path key={`g-in-${i}`} d={d} />
            ))}
          </G>
          {geometry.garlandPearls.map((p, i) => (
            <Circle key={`g-p-${i}`} cx={p.x} cy={p.y} r="1.5" fill={RANGOLI_COLORS.GOLD_BRIGHT} />
          ))}
        </Svg>
      </Animated.View>

      {/* 4. Grand Outer Diamond Crown Layer */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, outerCrownStyle]}>
        <Svg width={size} height={size} viewBox="-210 -210 420 420">
          {/* Base Scallop Arches */}
          <G stroke={RANGOLI_COLORS.GOLD_MID} strokeWidth="1.2" fill="none">
            {geometry.outerBaseArches.map((d, i) => (
              <Path key={`out-arch-${i}`} d={d} />
            ))}
          </G>

          {/* 16 Outer Diamond Florets */}
          <G stroke={RANGOLI_COLORS.GOLD_MID} strokeWidth="1.3" fill={RANGOLI_COLORS.DIAMOND_FILL_BASE}>
            {geometry.outerDiamonds.map((d, i) => (
              <Path key={`out-dia-${i}`} d={d} />
            ))}
          </G>
          <G stroke={RANGOLI_COLORS.GOLD} strokeWidth="0.8" fill="none">
            {geometry.outerInnerDiamonds.map((d, i) => (
              <Path key={`out-in-${i}`} d={d} />
            ))}
          </G>

          {/* Outer Tip Teardrop Pearls */}
          {geometry.outerTipPearls.map((p, i) => (
            <Circle key={`out-tip-${i}`} cx={p.x} cy={p.y} r="2.2" fill={RANGOLI_COLORS.GOLD} />
          ))}

          {/* Celestial Starry Pearls */}
          {geometry.celestialPearls.map((p, i) => (
            <Circle key={`cel-p-${i}`} cx={p.x} cy={p.y} r={p.r} fill={RANGOLI_COLORS.GOLD_BRIGHT} />
          ))}
        </Svg>
      </Animated.View>

      {/* ════════════════════════════════════════════════════════════════════════
          PASS 2: Dynamic Glowing / Unglowing Luster Overlay
          Pulses smoothly between brilliant luminous champagne gold and soft unglow
         ════════════════════════════════════════════════════════════════════════ */}
      <Animated.View style={[StyleSheet.absoluteFill, glowOverlayStyle]}>
        {/* Glow overlay on Rings */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, ringsStyle]}>
          <Svg width={size} height={size} viewBox="-210 -210 420 420">
            <Circle cx="0" cy="0" r="54" stroke={RANGOLI_COLORS.GOLD_BRIGHT} strokeWidth="1.8" fill="none" />
            <Circle cx="0" cy="0" r="74" stroke={RANGOLI_COLORS.GOLD_BRIGHT} strokeWidth="2.0" fill="none" />
            <Circle cx="0" cy="0" r="148" stroke={RANGOLI_COLORS.GOLD_BRIGHT} strokeWidth="2.2" fill="none" />
            {geometry.corePearls.map((p, i) => (
              <Circle key={`glow-core-${i}`} cx={p.x} cy={p.y} r="1.8" fill={RANGOLI_COLORS.GOLD_BRIGHT} />
            ))}
          </Svg>
        </Animated.View>

        {/* Glow overlay on Inner Diamonds */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, innerDiamondsStyle]}>
          <Svg width={size} height={size} viewBox="-210 -210 420 420">
            <G stroke={RANGOLI_COLORS.GOLD_BRIGHT} strokeWidth="1.8" fill={RANGOLI_COLORS.DIAMOND_FILL_GLOW}>
              {geometry.majorDiamonds.map((d, i) => (
                <Path key={`glow-maj-d-${i}`} d={d} />
              ))}
            </G>
            <G stroke="#FFFFFF" strokeWidth="1.1" fill="none">
              {geometry.majorInnerDiamonds.map((d, i) => (
                <Path key={`glow-maj-in-${i}`} d={d} />
              ))}
            </G>
            {geometry.majorDiamondPearls.map((p, i) => (
              <Circle key={`glow-maj-p-${i}`} cx={p.x} cy={p.y} r="2.2" fill="#FFFFFF" />
            ))}
            {geometry.secondaryPearls.map((p, i) => (
              <Circle key={`glow-sec-p-${i}`} cx={p.x} cy={p.y} r="1.7" fill="#FFFFFF" />
            ))}
          </Svg>
        </Animated.View>

        {/* Glow overlay on Mid Garland */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, midGarlandStyle]}>
          <Svg width={size} height={size} viewBox="-210 -210 420 420">
            <G stroke={RANGOLI_COLORS.GOLD_BRIGHT} strokeWidth="1.8" fill={RANGOLI_COLORS.DIAMOND_FILL_GLOW}>
              {geometry.garlandDiamonds.map((d, i) => (
                <Path key={`glow-g-dia-${i}`} d={d} />
              ))}
            </G>
            <G stroke="#FFFFFF" strokeWidth="1.0" fill="none">
              {geometry.garlandInnerDiamonds.map((d, i) => (
                <Path key={`glow-g-in-${i}`} d={d} />
              ))}
            </G>
            {geometry.garlandPearls.map((p, i) => (
              <Circle key={`glow-g-p-${i}`} cx={p.x} cy={p.y} r="2.0" fill="#FFFFFF" />
            ))}
          </Svg>
        </Animated.View>

        {/* Glow overlay on Outer Crown */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, outerCrownStyle]}>
          <Svg width={size} height={size} viewBox="-210 -210 420 420">
            <G stroke={RANGOLI_COLORS.GOLD_BRIGHT} strokeWidth="1.9" fill={RANGOLI_COLORS.DIAMOND_FILL_GLOW}>
              {geometry.outerDiamonds.map((d, i) => (
                <Path key={`glow-out-dia-${i}`} d={d} />
              ))}
            </G>
            <G stroke="#FFFFFF" strokeWidth="1.0" fill="none">
              {geometry.outerInnerDiamonds.map((d, i) => (
                <Path key={`glow-out-in-${i}`} d={d} />
              ))}
            </G>
            {geometry.outerTipPearls.map((p, i) => (
              <Circle key={`glow-out-tip-${i}`} cx={p.x} cy={p.y} r="2.8" fill="#FFFFFF" />
            ))}
            {geometry.celestialPearls.map((p, i) => (
              <Circle key={`glow-cel-p-${i}`} cx={p.x} cy={p.y} r={p.r + 0.5} fill="#FFFFFF" />
            ))}
          </Svg>
        </Animated.View>
      </Animated.View>

      {/* ════════════════════════════════════════════════════════════════════════
          PASS 3: Active Orbital Loading Comet Tracer
          A radiant golden comet bead that sweeps continuously around the
          middle diamond track, visibly showing dynamic loading in real-time
         ════════════════════════════════════════════════════════════════════════ */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, cometStyle]}>
        <Svg width={size} height={size} viewBox="-210 -210 420 420">
          <Defs>
            <LinearGradient id="cometTailGrad" x1="0" y1="-130" x2="-92" y2="-92" gradientUnits="userSpaceOnUse">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
              <Stop offset="30%" stopColor="#FFF8D0" stopOpacity="0.70" />
              <Stop offset="70%" stopColor="#C9B96A" stopOpacity="0.25" />
              <Stop offset="100%" stopColor="#8A7730" stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {/* Sweeping comet tail along R=130 arc */}
          <Path
            d="M 0 -130 A 130 130 0 0 0 -91.92 -91.92"
            stroke="url(#cometTailGrad)"
            strokeWidth="3.0"
            strokeLinecap="round"
            fill="none"
          />

          {/* Luminous comet spark head */}
          <Polygon points="0,-137 5,-130 0,-123 -5,-130" fill="#FFFFFF" />
          <Circle cx="0" cy="-130" r="3.2" fill="#FFFBE0" />
          <Circle cx="0" cy="-130" r="1.4" fill="#FFFFFF" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
