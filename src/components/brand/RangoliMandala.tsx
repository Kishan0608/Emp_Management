/**
 * Rangoli Mandala — the SKFL loading-screen rangoli, in champagne-gold line art.
 *
 * Modelled on a classic floor rangoli, drawn without colour:
 *   - Centre round: a plain disc with a beaded edge. The SKFL mark sits inside it.
 *   - Lotus: 8 broad rounded petals behind 8 smaller ones.
 *   - 8 large pointed petals, each holding an inverted teardrop.
 *   - Outer disc with a border of rounded scallops and a ring of pearls.
 *
 * Layers stack from the outside in and use solid fills, so each inner layer
 * covers the bases of the one behind it. Every layer has a brighter copy on
 * top whose opacity breathes with `glowValue`.
 *
 * The centre round must clear the SKFL mark's corners. AnimatedSplash draws
 * the mark at min(104px, 26% of the screen) inside a rangoli of
 * min(380px, 94% of the screen), which puts its corners at about r = 63 in
 * this viewBox. Keep CENTRE_GUIDE_R comfortably above that.
 */
import { useId, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, RadialGradient, Stop } from 'react-native-svg';

// ── Palette ───────────────────────────────────────────────────────────────────
export const RANGOLI_COLORS = {
  GOLD: '#E5E3AC',
  GOLD_BRIGHT: '#FFFBE0',
  GOLD_MID: '#C9B96A',
  GOLD_DARK: '#8A7730',
  LINE_GUIDE: 'rgba(201, 185, 106, 0.32)',
  WHITE: '#FFFFFF',
  // Solid, warm fills (darkest at the centre) so inner layers hide what is behind them.
  CENTRE_FILL: '#0B0906',
  PETAL_FILL: '#100D07',
  LOTUS_OUTER_FILL: '#1A150B',
  LOTUS_INNER_FILL: '#251E0F',
  // Soft gold washes.
  DISC_FILL: 'rgba(214, 190, 110, 0.06)',
  SCALLOP_FILL: 'rgba(214, 186, 100, 0.16)',
  DROP_FILL: 'rgba(222, 196, 110, 0.20)',
  DROP_FILL_GLOW: 'rgba(255, 236, 160, 0.30)',
} as const;

const C = RANGOLI_COLORS;
const VIEWBOX = '-210 -210 420 420';

/**
 * SVG ids are global on web, and a screen hidden in the navigation stack keeps its SVGs
 * mounted: a fixed id would make the visible copy paint with the hidden copy's gradient
 * (which renders nothing). Give every gradient an id unique to its instance.
 */
function useSvgId(prefix: string) {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/** Metallic gold for the main outlines: deep → bright sheen → deep, across the diagonal. */
const FOIL_STOPS = [
  { offset: '0%', color: '#9C8540' },
  { offset: '28%', color: '#D1C174' },
  { offset: '50%', color: '#F3EDC0' },
  { offset: '72%', color: '#C9B96A' },
  { offset: '100%', color: '#8F7A38' },
] as const;

// Line weights: main outlines, secondary details, guides; bright copy is heavier.
const W = { main: 1.1, detail: 0.8, guide: 0.6 } as const;
const WB = { main: 1.5, detail: 1.1 } as const;

// ── Geometry (viewBox units, centre at 0,0) ────────────────────────────────────
const CENTRE_R = 76; // the round SKFL sits in
const CENTRE_GUIDE_R = 71;
const BEAD_BASE_R = 78; // beaded edge around the centre round
const BEAD_COUNT = 36;

const LOTUS_OUTER = { r0: 70, r1: 114, half: 22.5 }; // r0 is hidden under the centre round
const LOTUS_INNER = { r0: 70, r1: 102, half: 16 };

const PETAL = { round: 96, tip: 166, halfWidth: 24 }; // base hidden under the lotus
const DROP = { tip: 114, round: 148, halfWidth: 11 };

const DISC_R = 174;
const SCALLOP_COUNT = 44;
const HALO_R = 202;

const DEG = Math.PI / 180;
type Pt = [number, number];

/** Rangoli diameter (px) whose plain centre (inside the inner guide ring) has radius `clearRadius` px. */
export function rangoliSizeForClearRadius(clearRadius: number) {
  return (clearRadius * 420) / CENTRE_GUIDE_R;
}

/** Outer radius (px) of the centre round's beaded edge, for a rangoli `size` px across. */
export function rangoliBeadRadius(size: number) {
  const peak = BEAD_BASE_R * (1 + Math.sin((180 / BEAD_COUNT) * DEG));
  return (size / 420) * peak;
}

function polar(r: number, deg: number) {
  return { x: Number((r * Math.cos(deg * DEG)).toFixed(2)), y: Number((r * Math.sin(deg * DEG)).toFixed(2)) };
}

/** A local point (axis along +x) rotated to `deg`. */
function rot([x, y]: Pt, deg: number): string {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return `${(x * c - y * s).toFixed(2)} ${(x * s + y * c).toFixed(2)}`;
}

/** Build a path from local-frame segments, rotated to `deg`. */
function path(segs: (string | Pt)[], deg: number): string {
  return segs.map((s) => (typeof s === 'string' ? s : rot(s, deg))).join(' ');
}

/** Rounded lotus petal: base on a circle of radius r0, rounded apex at r1. */
function lobe(r0: number, r1: number, halfDeg: number, deg: number): string {
  const x0 = r0 * Math.cos(halfDeg * DEG);
  const w = r0 * Math.sin(halfDeg * DEG);
  const cx = x0 + 0.55 * (r1 - x0);
  return path(['M', [x0, -w], 'C', [cx, -1.3 * w], [r1, -0.75 * w], [r1, 0], 'C', [r1, 0.75 * w], [cx, 1.3 * w], [x0, w], 'Z'], deg);
}

/** Teardrop with a point at radius `tipR` and a rounded end at `roundR` (either may be outermost). */
function teardrop(tipR: number, roundR: number, hw: number, deg: number): string {
  const L = roundR - tipR;
  const xm = tipR + 0.62 * L; // widest point, nearer the rounded end
  return path(
    [
      'M', [tipR, 0],
      'C', [tipR + 0.35 * L, 0.55 * hw], [xm - 0.15 * L, hw], [xm, hw],
      'C', [xm + 0.22 * L, hw], [roundR, 0.55 * hw], [roundR, 0],
      'C', [roundR, -0.55 * hw], [xm + 0.22 * L, -hw], [xm, -hw],
      'C', [xm - 0.15 * L, -hw], [tipR + 0.35 * L, -0.55 * hw], [tipR, 0],
      'Z',
    ],
    deg,
  );
}

/** Small radial diamond between radii `inner` and `outer`. */
function diamond(inner: number, outer: number, halfDeg: number, deg: number): string {
  const mid = (inner + outer) / 2;
  const t = polar(outer, deg);
  const r = polar(mid, deg + halfDeg);
  const b = polar(inner, deg);
  const l = polar(mid, deg - halfDeg);
  return `M ${t.x} ${t.y} L ${r.x} ${r.y} L ${b.x} ${b.y} L ${l.x} ${l.y} Z`;
}

/** Ring of semicircular bumps standing on a circle of radius r. */
function scallopRing(r: number, count: number): string {
  const step = 360 / count;
  const bump = r * Math.sin((step / 2) * DEG); // half the chord
  const start = polar(r, 0);
  let d = `M ${start.x} ${start.y}`;
  for (let i = 1; i <= count; i++) {
    const p = polar(r, i * step);
    d += ` A ${bump.toFixed(2)} ${bump.toFixed(2)} 0 0 1 ${p.x} ${p.y}`;
  }
  return `${d} Z`;
}

function buildGeometry() {
  const eight = Array.from({ length: 8 }, (_, i) => i * 45);
  const scallopStep = 360 / SCALLOP_COUNT;
  const scallopBump = DISC_R * Math.sin((scallopStep / 2) * DEG);

  return {
    centreBeads: scallopRing(BEAD_BASE_R, BEAD_COUNT),

    lotusOuter: eight.map((a) => lobe(LOTUS_OUTER.r0, LOTUS_OUTER.r1, LOTUS_OUTER.half, a)),
    lotusOuterEcho: eight.map((a) => lobe(LOTUS_OUTER.r0, LOTUS_OUTER.r1 - 9, LOTUS_OUTER.half * 0.62, a)),
    lotusInner: eight.map((a) => lobe(LOTUS_INNER.r0, LOTUS_INNER.r1, LOTUS_INNER.half, a + 22.5)),
    lotusInnerPearls: eight.map((a) => polar(LOTUS_INNER.r1 - 7, a + 22.5)),

    petals: eight.map((a) => teardrop(PETAL.tip, PETAL.round, PETAL.halfWidth, a)),
    drops: eight.map((a) => teardrop(DROP.tip, DROP.round, DROP.halfWidth, a)),
    petalTipPearls: eight.map((a) => polar(PETAL.tip + 4, a)),
    // Thin line from each drop's rounded end toward the petal tip.
    stamens: eight.map((a) => {
      const p1 = polar(DROP.round + 3, a);
      const p2 = polar(PETAL.tip - 6, a);
      return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
    }),
    // Diamond and dot in the open disc between neighbouring petals.
    gapDiamonds: eight.map((a) => diamond(136, 160, 3.2, a + 22.5)),
    gapDiamondPearls: eight.map((a) => polar(148, a + 22.5)),
    gapPearls: eight.map((a) => polar(126, a + 22.5)),

    scallops: Array.from({ length: SCALLOP_COUNT }, (_, i) => {
      const p1 = polar(DISC_R, i * scallopStep);
      const p2 = polar(DISC_R, (i + 1) * scallopStep);
      const b = scallopBump.toFixed(2);
      return `M ${p1.x} ${p1.y} A ${b} ${b} 0 0 1 ${p2.x} ${p2.y} Z`;
    }),
    scallopPearls: Array.from({ length: SCALLOP_COUNT }, (_, i) => polar(DISC_R + scallopBump * 0.5, (i + 0.5) * scallopStep)),
    valleyPearls: Array.from({ length: SCALLOP_COUNT }, (_, i) => polar(DISC_R + scallopBump + 3, i * scallopStep)),
    halo: Array.from({ length: 32 }, (_, i) => ({ ...polar(HALO_R, i * 11.25 + 5.6), r: i % 2 === 0 ? 1.4 : 0.9 })),
  };
}

const GEO = buildGeometry();

// ── Layers (each drawn twice: base, then a breathing bright copy) ──────────────

/** `foil` is the url() of this SVG's foil gradient; the bright copy uses solid colours. */
type LayerProps = { bright: boolean; foil: string };

function OuterDisc({ bright, foil }: LayerProps) {
  return (
    <>
      <Circle cx="0" cy="0" r={DISC_R} fill={C.DISC_FILL} stroke={bright ? C.GOLD_BRIGHT : foil} strokeWidth={bright ? WB.main : W.main + 0.2} />
      <Circle cx="0" cy="0" r={DISC_R - 5} fill="none" stroke={bright ? C.GOLD : C.LINE_GUIDE} strokeWidth={W.guide} strokeDasharray="2, 4" />
      <G fill={C.SCALLOP_FILL} stroke={bright ? C.GOLD_BRIGHT : foil} strokeWidth={bright ? WB.main : W.main}>
        {GEO.scallops.map((d, i) => (
          <Path key={`sc-${i}`} d={d} />
        ))}
      </G>
      {GEO.scallopPearls.map((p, i) => (
        <Circle key={`scp-${i}`} cx={p.x} cy={p.y} r={bright ? 1.7 : 1.2} fill={bright ? C.WHITE : C.GOLD} />
      ))}
      {GEO.valleyPearls.map((p, i) => (
        <Circle key={`vp-${i}`} cx={p.x} cy={p.y} r={bright ? 1.3 : 0.9} fill={bright ? C.GOLD_BRIGHT : C.GOLD_MID} />
      ))}
      {GEO.halo.map((p, i) => (
        <Circle key={`h-${i}`} cx={p.x} cy={p.y} r={bright ? p.r + 0.5 : p.r} fill={bright ? C.WHITE : C.GOLD_BRIGHT} />
      ))}
    </>
  );
}

function BigPetals({ bright, foil }: LayerProps) {
  return (
    <>
      <G fill={C.PETAL_FILL} stroke={bright ? C.GOLD_BRIGHT : foil} strokeWidth={bright ? WB.main : W.main + 0.2}>
        {GEO.petals.map((d, i) => (
          <Path key={`pt-${i}`} d={d} />
        ))}
      </G>
      <G fill={bright ? C.DROP_FILL_GLOW : C.DROP_FILL} stroke={bright ? C.WHITE : C.GOLD} strokeWidth={bright ? WB.detail : W.detail}>
        {GEO.drops.map((d, i) => (
          <Path key={`dr-${i}`} d={d} />
        ))}
      </G>
      <G stroke={bright ? C.GOLD_BRIGHT : C.GOLD_MID} strokeWidth={bright ? WB.detail : W.guide} strokeLinecap="round">
        {GEO.stamens.map((d, i) => (
          <Path key={`st-${i}`} d={d} />
        ))}
      </G>
      {GEO.petalTipPearls.map((p, i) => (
        <Circle key={`tp-${i}`} cx={p.x} cy={p.y} r={bright ? 2.2 : 1.6} fill={bright ? C.WHITE : C.GOLD} />
      ))}
      <G fill={C.SCALLOP_FILL} stroke={bright ? C.GOLD_BRIGHT : foil} strokeWidth={bright ? WB.detail : W.detail}>
        {GEO.gapDiamonds.map((d, i) => (
          <Path key={`gd-${i}`} d={d} />
        ))}
      </G>
      {GEO.gapDiamondPearls.map((p, i) => (
        <Circle key={`gdp-${i}`} cx={p.x} cy={p.y} r={bright ? 1.4 : 1.0} fill={bright ? C.WHITE : C.GOLD_BRIGHT} />
      ))}
      {GEO.gapPearls.map((p, i) => (
        <Circle key={`gp-${i}`} cx={p.x} cy={p.y} r={bright ? 1.5 : 1.1} fill={bright ? C.GOLD_BRIGHT : C.GOLD_MID} />
      ))}
    </>
  );
}

function Lotus({ bright, foil }: LayerProps) {
  return (
    <>
      <G fill={C.LOTUS_OUTER_FILL} stroke={bright ? C.GOLD_BRIGHT : foil} strokeWidth={bright ? WB.main : W.main + 0.1}>
        {GEO.lotusOuter.map((d, i) => (
          <Path key={`lo-${i}`} d={d} />
        ))}
      </G>
      <G fill="none" stroke={bright ? C.GOLD : C.LINE_GUIDE} strokeWidth={W.guide + 0.1}>
        {GEO.lotusOuterEcho.map((d, i) => (
          <Path key={`le-${i}`} d={d} />
        ))}
      </G>
      <G fill={C.LOTUS_INNER_FILL} stroke={bright ? C.WHITE : foil} strokeWidth={bright ? WB.main : W.main}>
        {GEO.lotusInner.map((d, i) => (
          <Path key={`li-${i}`} d={d} />
        ))}
      </G>
      {GEO.lotusInnerPearls.map((p, i) => (
        <Circle key={`lp-${i}`} cx={p.x} cy={p.y} r={bright ? 1.9 : 1.4} fill={bright ? C.WHITE : C.GOLD_BRIGHT} />
      ))}
    </>
  );
}

function CentreRound({ bright, foil, aura }: LayerProps & { aura: string }) {
  return (
    <>
      {/* Beaded edge; its solid fill is also the plain disc behind SKFL */}
      <Path d={GEO.centreBeads} fill={C.CENTRE_FILL} stroke={bright ? C.GOLD_BRIGHT : foil} strokeWidth={bright ? WB.main : W.main} />
      {!bright && <Circle cx="0" cy="0" r={CENTRE_R} fill={aura} />}
      <Circle cx="0" cy="0" r={CENTRE_R} fill="none" stroke={bright ? C.GOLD_BRIGHT : foil} strokeWidth={bright ? 1.9 : 1.4} />
      <Circle cx="0" cy="0" r={CENTRE_GUIDE_R} fill="none" stroke={bright ? C.GOLD : C.LINE_GUIDE} strokeWidth={W.guide} />
    </>
  );
}

function foilGradient(id: string) {
  return (
    <LinearGradient id={id} x1="-210" y1="-210" x2="210" y2="210" gradientUnits="userSpaceOnUse">
      {FOIL_STOPS.map((s) => (
        <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
      ))}
    </LinearGradient>
  );
}

function centreAuraGradient(id: string) {
  return (
    <RadialGradient id={id} cx="0%" cy="0%" r="50%">
      <Stop offset="0%" stopColor="#E5E3AC" stopOpacity="0.14" />
      <Stop offset="70%" stopColor="#C9B96A" stopOpacity="0.05" />
      <Stop offset="100%" stopColor="#070705" stopOpacity="0" />
    </RadialGradient>
  );
}

/** The settled rangoli as one still drawing (no glow pass, no animation), for backgrounds. */
export function RangoliArt({ size }: { size: number }) {
  const foilId = useSvgId('rangoliFoil');
  const auraId = useSvgId('skflCentreAura');
  const foil = `url(#${foilId})`;
  return (
    <Svg width={size} height={size} viewBox={VIEWBOX}>
      <Defs>
        {foilGradient(foilId)}
        {centreAuraGradient(auraId)}
      </Defs>
      <OuterDisc bright={false} foil={foil} />
      <BigPetals bright={false} foil={foil} />
      <Lotus bright={false} foil={foil} />
      <CentreRound bright={false} foil={foil} aura={`url(#${auraId})`} />
    </Svg>
  );
}

function Layer({
  size,
  style,
  glowStyle,
  defs,
  render,
}: {
  size: number;
  style: object;
  glowStyle: object;
  defs?: ReactNode;
  render: (bright: boolean, foil: string) => ReactNode;
}) {
  const foilId = useSvgId('rangoliFoil');
  const foil = `url(#${foilId})`;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.center, style]}>
      <Svg width={size} height={size} viewBox={VIEWBOX}>
        <Defs>{foilGradient(foilId)}</Defs>
        {defs}
        {render(false, foil)}
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, glowStyle]}>
        <Svg width={size} height={size} viewBox={VIEWBOX}>
          {render(true, foil)}
        </Svg>
      </Animated.View>
    </Animated.View>
  );
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
  // Centre round grows out from the middle.
  const centreStyle = useAnimatedStyle(() => {
    const s = ringsScale.get();
    return { opacity: s, transform: [{ scale: 0.2 + s * 0.8 }] };
  });

  // Lotus unfurls outward with a gentle turn.
  const lotusStyle = useAnimatedStyle(() => {
    const s = innerDiamondsScale.get();
    const rot = (1 - s) * 16 + clock.get() * 12;
    return { opacity: s, transform: [{ scale: 0.45 + s * 0.55 }, { rotate: `${rot}deg` }] };
  });

  // Big petals sweep into place around the orbit.
  const petalsStyle = useAnimatedStyle(() => {
    const s = midDiamondsScale.get();
    const rot = (1 - s) * -32 - clock.get() * 14;
    return { opacity: s, transform: [{ scale: 0.82 + s * 0.18 }, { rotate: `${rot}deg` }] };
  });

  // Outer disc and scallop border close in from outside.
  const outerStyle = useAnimatedStyle(() => {
    const s = outerDiamondsScale.get();
    const rot = (1 - s) * 18 + clock.get() * 8;
    return { opacity: s, transform: [{ scale: 1.35 - s * 0.35 }, { rotate: `${rot}deg` }] };
  });

  const glowAuraStyle = useAnimatedStyle(() => {
    const g = glowValue.get();
    return { opacity: 0.2 + g * 0.7, transform: [{ scale: 0.94 + g * 0.12 }] };
  });

  const glowOverlayStyle = useAnimatedStyle(() => ({ opacity: 0.08 + glowValue.get() * 0.92 }));

  const cometStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${cometProgress.get() * 360}deg` }] }));

  const glowId = useSvgId('rangoliGlowGrad');
  const auraId = useSvgId('skflCentreAura');
  const cometId = useSvgId('cometTailGrad');

  return (
    <View style={[styles.container, { width: size, height: size }]} pointerEvents="none">
      {/* Feathered radial glow behind everything */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, glowAuraStyle]}>
        <Svg width={size * 1.15} height={size * 1.15} viewBox="-220 -220 440 440">
          <Defs>
            <RadialGradient id={glowId} cx="0%" cy="0%" r="50%" fx="0%" fy="0%">
              <Stop offset="0%" stopColor="#FFF4B8" stopOpacity="0.48" />
              <Stop offset="26%" stopColor="#E5E3AC" stopOpacity="0.30" />
              <Stop offset="58%" stopColor="#C9B96A" stopOpacity="0.14" />
              <Stop offset="82%" stopColor="#8A7730" stopOpacity="0.04" />
              <Stop offset="100%" stopColor="#070705" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="0" cy="0" r="215" fill={`url(#${glowId})`} />
        </Svg>
      </Animated.View>

      {/* Outside in, so each layer covers the bases of the one behind it */}
      <Layer size={size} style={outerStyle} glowStyle={glowOverlayStyle} render={(b, foil) => <OuterDisc bright={b} foil={foil} />} />
      <Layer size={size} style={petalsStyle} glowStyle={glowOverlayStyle} render={(b, foil) => <BigPetals bright={b} foil={foil} />} />
      <Layer size={size} style={lotusStyle} glowStyle={glowOverlayStyle} render={(b, foil) => <Lotus bright={b} foil={foil} />} />
      <Layer
        size={size}
        style={centreStyle}
        glowStyle={glowOverlayStyle}
        defs={<Defs>{centreAuraGradient(auraId)}</Defs>}
        render={(b, foil) => <CentreRound bright={b} foil={foil} aura={`url(#${auraId})`} />}
      />

      {/* Loading comet running along the edge of the outer disc */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, cometStyle]}>
        <Svg width={size} height={size} viewBox={VIEWBOX}>
          <Defs>
            <LinearGradient id={cometId} x1="0" y1={-DISC_R} x2="-123.04" y2="-123.04" gradientUnits="userSpaceOnUse">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
              <Stop offset="30%" stopColor="#FFF8D0" stopOpacity="0.70" />
              <Stop offset="70%" stopColor="#C9B96A" stopOpacity="0.25" />
              <Stop offset="100%" stopColor="#8A7730" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Path
            d={`M 0 ${-DISC_R} A ${DISC_R} ${DISC_R} 0 0 0 -123.04 -123.04`}
            stroke={`url(#${cometId})`}
            strokeWidth="3.0"
            strokeLinecap="round"
            fill="none"
          />
          <Polygon points={`0,${-DISC_R - 7} 5,${-DISC_R} 0,${-DISC_R + 7} -5,${-DISC_R}`} fill="#FFFFFF" />
          <Circle cx="0" cy={-DISC_R} r="3.2" fill="#FFFBE0" />
          <Circle cx="0" cy={-DISC_R} r="1.4" fill="#FFFFFF" />
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
