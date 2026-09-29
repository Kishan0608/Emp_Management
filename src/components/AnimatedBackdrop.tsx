import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';

interface OrbSpec {
  size: number;
  colors: readonly [string, string];
  top: `${number}%`;
  left: `${number}%`;
  dx: number;
  dy: number;
  duration: number;
  delay: number;
}

const FULL: OrbSpec[] = [
  { size: 360, colors: ['rgba(212,164,55,0.42)', 'rgba(212,164,55,0)'], top: '-14%', left: '-32%', dx: 60, dy: 40, duration: 9000, delay: 0 },
  { size: 320, colors: ['rgba(246,222,141,0.22)', 'rgba(246,222,141,0)'], top: '38%', left: '52%', dx: -70, dy: 50, duration: 11000, delay: 400 },
  { size: 280, colors: ['rgba(176,125,26,0.40)', 'rgba(176,125,26,0)'], top: '72%', left: '-18%', dx: 50, dy: -60, duration: 10000, delay: 800 },
  { size: 200, colors: ['rgba(231,185,74,0.28)', 'rgba(231,185,74,0)'], top: '8%', left: '66%', dx: -40, dy: 30, duration: 8000, delay: 200 },
];

const SUBTLE: OrbSpec[] = [
  { size: 260, colors: ['rgba(212,164,55,0.22)', 'rgba(212,164,55,0)'], top: '-55%', left: '55%', dx: -40, dy: 20, duration: 9000, delay: 0 },
  { size: 180, colors: ['rgba(246,222,141,0.12)', 'rgba(246,222,141,0)'], top: '35%', left: '-15%', dx: 40, dy: -15, duration: 11000, delay: 500 },
];

/**
 * Slowly drifting glow orbs plus rising particles.
 * "full" is for sign-in screens, "subtle" for page headers.
 */
export function AnimatedBackdrop({ variant = 'full' }: { variant?: 'full' | 'subtle' }) {
  const orbs = variant === 'full' ? FULL : SUBTLE;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {orbs.map((o, i) => (
        <Orb key={i} spec={o} />
      ))}
      {variant === 'full' && PARTICLES.map((p, i) => <Particle key={i} {...p} />)}
    </View>
  );
}

function Orb({ spec }: { spec: OrbSpec }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(spec.delay, withRepeat(withTiming(1, { duration: spec.duration, easing: Easing.inOut(Easing.sin) }), -1, true)));
  }, [t, spec.delay, spec.duration]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: t.get() * spec.dx }, { translateY: t.get() * spec.dy }, { scale: 1 + t.get() * 0.15 }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', top: spec.top, left: spec.left, width: spec.size, height: spec.size }, style]}>
      <LinearGradient colors={spec.colors} start={{ x: 0.5, y: 0.5 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: spec.size / 2 }} />
    </Animated.View>
  );
}

const PARTICLES = [
  { left: '12%', size: 5, duration: 7000, delay: 0 },
  { left: '28%', size: 3, duration: 9000, delay: 1500 },
  { left: '46%', size: 4, duration: 8000, delay: 3000 },
  { left: '63%', size: 6, duration: 10000, delay: 800 },
  { left: '78%', size: 3, duration: 7500, delay: 2200 },
  { left: '90%', size: 4, duration: 9500, delay: 4000 },
] as const;

function Particle({ left, size, duration, delay }: { left: `${number}%`; size: number; duration: number; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false)));
  }, [t, delay, duration]);
  const style = useAnimatedStyle(() => ({
    opacity: t.get() < 0.1 ? t.get() * 7 : 0.7 * (1 - t.get()),
    transform: [{ translateY: -t.get() * 700 }, { translateX: Math.sin(t.get() * 6.28) * 12 }],
  }));
  return (
    <Animated.View
      style={[{ position: 'absolute', bottom: -10, left, width: size, height: size, borderRadius: size / 2, backgroundColor: '#F6DE8D' }, style]}
    />
  );
}
