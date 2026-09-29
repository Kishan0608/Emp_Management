import { LinearGradient as ViewGradient } from 'expo-linear-gradient';
import { useEffect, useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { shadow } from '@/theme/tokens';

import { GOLD_STOPS, SKFL_LETTERS, SKFL_STROKE, SKFL_VIEWBOX } from './skflPaths';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The SKFL gold monogram as crisp vector art.
 * With `animated`, each letter draws itself in, one after another.
 */
export function SkflMark({
  width = 160,
  animated = false,
  delay = 0,
  letterGap = 260,
  duration = 900,
  color,
}: {
  width?: number;
  animated?: boolean;
  delay?: number;
  letterGap?: number;
  duration?: number;
  color?: string;
}) {
  const gid = `gold${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const height = (width * SKFL_VIEWBOX.height) / SKFL_VIEWBOX.width;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${SKFL_VIEWBOX.width} ${SKFL_VIEWBOX.height}`}>
      <Defs>
        <LinearGradient id={gid} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={SKFL_VIEWBOX.width} y2={SKFL_VIEWBOX.height}>
          {GOLD_STOPS.map((s) => (
            <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </LinearGradient>
      </Defs>
      {SKFL_LETTERS.map((l, i) => (
        <Letter key={l.key} d={l.d} length={l.length} stroke={color ?? `url(#${gid})`} animated={animated} delay={delay + i * letterGap} duration={duration} />
      ))}
    </Svg>
  );
}

function Letter({ d, length, stroke, animated, delay, duration }: { d: string; length: number; stroke: string; animated: boolean; delay: number; duration: number }) {
  const p = useSharedValue(animated ? 0 : 1);
  useEffect(() => {
    if (animated) p.set(withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) })));
  }, [animated, delay, duration, p]);
  return <DrawnPath d={d} length={length} stroke={stroke} progress={p} />;
}

function DrawnPath({ d, length, stroke, progress }: { d: string; length: number; stroke: string; progress: SharedValue<number> }) {
  const props = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.get()) }));
  return (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={SKFL_STROKE}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      strokeDasharray={[length, length]}
      animatedProps={props}
    />
  );
}

/** App-icon style tile: charcoal square, gold hairline border, SKFL inside. */
export function BrandTile({ size = 56, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size * 0.26 }, styles.tileShadow, style]}>
      <ViewGradient colors={['#E9CF7A', '#A67C1B', '#F2D27A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fill, { borderRadius: size * 0.26, padding: 1.2 }]}>
        <ViewGradient
          colors={['#26221A', '#141416', '#0B0B0D']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={[styles.fill, styles.center, { borderRadius: size * 0.26 - 1 }]}>
          <SkflMark width={size * 0.74} />
        </ViewGradient>
      </ViewGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  tileShadow: shadow.lg,
});
