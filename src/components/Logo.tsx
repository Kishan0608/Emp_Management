import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, type SharedValue } from 'react-native-reanimated';
import { useEffect } from 'react';

import { colors, shadow } from '@/theme/tokens';

/**
 * Brand mark: three bars for the three modules (Tasks, Complaints, Feedback).
 * With `animated`, the bars draw in one after another.
 */
export function Logo({ size = 64, animated = false, delay = 0 }: { size?: number; animated?: boolean; delay?: number }) {
  const a = useSharedValue(animated ? 0 : 1);
  const b = useSharedValue(animated ? 0 : 1);
  const c = useSharedValue(animated ? 0 : 1);

  useEffect(() => {
    if (!animated) return;
    const spring = { damping: 14, stiffness: 120 };
    a.set(withDelay(delay, withSpring(1, spring)));
    b.set(withDelay(delay + 150, withSpring(1, spring)));
    c.set(withDelay(delay + 300, withSpring(1, spring)));
  }, [animated, delay, a, b, c]);

  const bar = size * 0.14;
  const gap = size * 0.09;
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: size * 0.28, padding: size * 0.2, gap }, shadow.lg]}>
      <Bar progress={a} width={size * 0.5} height={bar} color={colors.task} />
      <Bar progress={b} width={size * 0.34} height={bar} color={colors.complaint} />
      <Bar progress={c} width={size * 0.6} height={bar} color={colors.feedback} />
    </View>
  );
}

function Bar({ progress, width, height, color }: { progress: SharedValue<number>; width: number; height: number; color: string }) {
  const style = useAnimatedStyle(() => ({ width: width * progress.get(), opacity: Math.min(1, progress.get() * 1.5) }));
  return <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.white, justifyContent: 'center', alignItems: 'flex-start' },
});
