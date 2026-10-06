import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { RangoliArt } from './RangoliMandala';

/**
 * The loading-screen rangoli as a faint, slowly turning watermark, centred on
 * its parent. Used behind the SKFL logo on the sign-in screens so they carry
 * on from the loading screen.
 */
export function RangoliWatermark({ size, opacity = 0.16 }: { size: number; opacity?: number }) {
  const turn = useSharedValue(0);

  useEffect(() => {
    turn.set(withRepeat(withTiming(1, { duration: 180_000, easing: Easing.linear }), -1, false));
  }, [turn]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 360}deg` }] }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
      <Animated.View style={{ width: size, height: size, opacity }}>
        <Animated.View style={[{ width: size, height: size }, style]}>
          <RangoliArt size={size} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Centre a child larger than the parent: let it overflow equally on every side.
  center: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
});
