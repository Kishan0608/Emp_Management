import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { PASSCODE_LENGTH } from '@/lib/appLock';
import { colors, fonts } from '@/theme/tokens';

type Tone = 'dark' | 'light';

const tap = () => {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

/** Row of passcode dots. Shakes when `errorKey` changes. */
export function PasscodeDots({ length, tone = 'dark', errorKey = 0 }: { length: number; tone?: Tone; errorKey?: number }) {
  const x = useSharedValue(0);
  useEffect(() => {
    if (!errorKey) return;
    x.set(withSequence(withTiming(-12, { duration: 50 }), withTiming(12, { duration: 60 }), withTiming(-8, { duration: 60 }), withTiming(8, { duration: 60 }), withTiming(0, { duration: 50 })));
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, [errorKey, x]);
  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const t = tone === 'dark' ? dark : light;
  return (
    <Animated.View style={[styles.dots, shake]} accessibilityLabel={`${length} of ${PASSCODE_LENGTH} digits entered`}>
      {Array.from({ length: PASSCODE_LENGTH }, (_, i) => (
        <Dot key={i} filled={i < length} error={errorKey > 0 && length === 0} t={t} />
      ))}
    </Animated.View>
  );
}

function Dot({ filled, error, t }: { filled: boolean; error: boolean; t: Palette }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (filled) s.set(withSequence(withTiming(1.35, { duration: 90 }), withSpring(1)));
  }, [filled, s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  return <Animated.View style={[styles.dot, { borderColor: error ? colors.danger : t.dotBorder }, filled && { backgroundColor: t.dotFill, borderColor: t.dotFill }, anim]} />;
}

/** 3×4 number pad. `leftKey` is an optional icon button (e.g. fingerprint) in the bottom-left slot. */
export function Keypad({
  value,
  onChange,
  tone = 'dark',
  disabled,
  leftKey,
}: {
  value: string;
  onChange: (v: string) => void;
  tone?: Tone;
  disabled?: boolean;
  leftKey?: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void };
}) {
  const t = tone === 'dark' ? dark : light;
  const press = (d: string) => {
    if (disabled || value.length >= PASSCODE_LENGTH) return;
    tap();
    onChange(value + d);
  };
  const back = () => {
    if (disabled || !value) return;
    tap();
    onChange(value.slice(0, -1));
  };
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
  ];
  return (
    <View style={styles.pad}>
      {rows.map((r) => (
        <View key={r[0]} style={styles.row}>
          {r.map((d) => (
            <Key key={d} label={d} t={t} onPress={() => press(d)} />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        {leftKey ? (
          <Pressable onPress={leftKey.onPress} accessibilityLabel={leftKey.label} style={({ pressed }) => [styles.key, styles.ghost, pressed && { backgroundColor: t.keyPressed }]}>
            <Ionicons name={leftKey.icon} size={30} color={t.accent} />
          </Pressable>
        ) : (
          <View style={styles.key} />
        )}
        <Key label="0" t={t} onPress={() => press('0')} />
        <Pressable onPress={back} accessibilityLabel="Delete digit" style={({ pressed }) => [styles.key, styles.ghost, pressed && { backgroundColor: t.keyPressed }]}>
          <Ionicons name="backspace-outline" size={26} color={t.text} />
        </Pressable>
      </View>
    </View>
  );
}

function Key({ label, onPress, t }: { label: string; onPress: () => void; t: Palette }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.key, { backgroundColor: pressed ? t.keyPressed : t.key, borderColor: t.keyBorder }]}>
      <Text style={[styles.keyText, { color: t.text }]}>{label}</Text>
    </Pressable>
  );
}

interface Palette {
  key: string;
  keyPressed: string;
  keyBorder: string;
  text: string;
  accent: string;
  dotBorder: string;
  dotFill: string;
}

const dark: Palette = {
  key: 'rgba(255,255,255,0.07)',
  keyPressed: 'rgba(229,227,172,0.28)',
  keyBorder: 'rgba(229,227,172,0.16)',
  text: colors.white,
  accent: colors.goldLight,
  dotBorder: 'rgba(229,227,172,0.6)',
  dotFill: colors.goldLight,
};
const light: Palette = {
  key: colors.surfaceAlt,
  keyPressed: colors.brandTint,
  keyBorder: colors.border,
  text: colors.text,
  accent: colors.brand,
  dotBorder: colors.borderStrong,
  dotFill: colors.brand,
};

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 18, justifyContent: 'center', paddingVertical: 6 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  pad: { gap: 14, alignItems: 'center' },
  row: { flexDirection: 'row', gap: 22 },
  key: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  ghost: { backgroundColor: 'transparent' },
  keyText: { fontFamily: fonts.semibold, fontSize: 28 },
});
