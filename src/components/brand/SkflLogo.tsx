import { LinearGradient as ViewGradient } from 'expo-linear-gradient';
import { useEffect, useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { shadow } from '@/theme/tokens';

import { CHARCOAL_STOPS, GOLD_STOPS, SKFL_SHAPES, SKFL_VIEWBOX } from './skflPaths';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The official SKFL logo in champagne gold, as crisp vector art.
 * With `animated`, the shapes appear one after another from left to right.
 */
export function SkflMark({
  width = 160,
  animated = false,
  delay = 0,
  stagger = 140,
  duration = 520,
  color,
}: {
  width?: number;
  animated?: boolean;
  delay?: number;
  stagger?: number;
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
      {SKFL_SHAPES.map((d, i) => (
        <Shape key={i} d={d} fill={color ?? `url(#${gid})`} animated={animated} delay={delay + i * stagger} duration={duration} />
      ))}
    </Svg>
  );
}

function Shape({ d, fill, animated, delay, duration }: { d: string; fill: string; animated: boolean; delay: number; duration: number }) {
  const p = useSharedValue(animated ? 0 : 1);
  useEffect(() => {
    if (animated) p.set(withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) })));
  }, [animated, delay, duration, p]);
  return <FadedPath d={d} fill={fill} progress={p} />;
}

function FadedPath({ d, fill, progress }: { d: string; fill: string; progress: SharedValue<number> }) {
  const props = useAnimatedProps(() => ({ fillOpacity: progress.get() }));
  return <AnimatedPath d={d} fill={fill} animatedProps={props} />;
}

/** Logo tile: the brushed-charcoal background of the official logo with the gold mark. */
export function BrandTile({ size = 56, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size * 0.24 }, styles.tileShadow, style]}>
      <ViewGradient
        colors={CHARCOAL_STOPS}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={[styles.fill, styles.center, { borderRadius: size * 0.24, borderWidth: 1, borderColor: 'rgba(229,227,172,0.35)' }]}>
        <SkflMark width={size * 0.8} />
      </ViewGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  tileShadow: shadow.lg,
});
