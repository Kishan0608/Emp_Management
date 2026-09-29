import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useKeyboardScroll } from '@/providers/KeyboardScrollProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

/** Six boxes for a 6-digit code. Full-width touch overlay drives the native keyboard instantly; shakes on `error`. */
export function OtpInput({ value, onChange, error, autoFocus = true }: { value: string; onChange: (v: string) => void; error?: boolean; autoFocus?: boolean }) {
  const ref = useRef<TextInput>(null);
  const containerRef = useRef<View>(null);
  const [focused, setFocused] = useState(false);
  const shake = useSharedValue(0);
  const { scrollToView } = useKeyboardScroll();

  useEffect(() => {
    if (error) shake.set(withSequence(withTiming(-8, { duration: 50 }), withTiming(8, { duration: 50 }), withTiming(-6, { duration: 50 }), withTiming(0, { duration: 50 })));
  }, [error, shake]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));

  return (
    <Pressable
      ref={containerRef}
      onPress={() => ref.current?.focus()}
      accessibilityLabel="Enter the 6-digit code"
      style={styles.otpContainer}>
      <Animated.View pointerEvents="none" style={[styles.otpRow, shakeStyle]}>
        {Array.from({ length: 6 }).map((_, i) => {
          const char = value[i] ?? '';
          const active = focused && i === Math.min(value.length, 5);
          return (
            <View key={i} style={[styles.otpBox, char && styles.otpFilled, active && styles.otpActive, error && styles.otpError]}>
              <Text style={styles.otpChar}>{char}</Text>
            </View>
          );
        })}
      </Animated.View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        maxLength={6}
        onFocus={() => {
          setFocused(true);
          scrollToView(containerRef.current);
        }}
        onBlur={() => setFocused(false)}
        style={[StyleSheet.absoluteFill, styles.otpOverlay]}
        caretHidden
        showSoftInputOnFocus={true}
      />
    </Pressable>
  );
}

/** "Resend code" with a 60-second cool-down that matches the server rule. */
export function ResendButton({ onResend, initialWait = 60 }: { onResend: () => Promise<void>; initialWait?: number }) {
  const [wait, setWait] = useState(initialWait);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  return (
    <Pressable
      disabled={wait > 0 || busy}
      onPress={async () => {
        setBusy(true);
        try {
          await onResend();
          setWait(60);
        } finally {
          setBusy(false);
        }
      }}
      style={{ alignSelf: 'center', padding: spacing.sm }}>
      {busy ? (
        <ActivityIndicator color={colors.brand} />
      ) : (
        <Text style={[styles.link, wait > 0 && { color: colors.textMuted }]}>{wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}</Text>
      )}
    </Pressable>
  );
}

function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </Svg>
  );
}

export function GoogleButton({ onPress, loading, label = 'Continue with Google' }: { onPress: () => void; loading?: boolean; label?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.google, pressed && { backgroundColor: colors.surfaceAlt, transform: [{ scale: 0.99 }] }, loading && { opacity: 0.6 }]}>
      {loading ? <ActivityIndicator color={colors.text} /> : <GoogleG />}
      <Text style={styles.googleText}>{label}</Text>
    </Pressable>
  );
}

export function OrDivider() {
  return (
    <View style={styles.or}>
      <View style={styles.orLine} />
      <Text style={styles.orText}>or</Text>
      <View style={styles.orLine} />
    </View>
  );
}

/** Light text link for below the auth card: "New here? Create account". */
export function AuthLink({ lead, action, onPress }: { lead: string; action: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
      <Text style={styles.leadText}>{lead} </Text>
      <Text style={styles.actionText}>{action}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  otpContainer: { position: 'relative', width: '100%' },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  otpBox: {
    flex: 1,
    maxWidth: 52,
    height: 58,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpFilled: { borderColor: colors.gold, backgroundColor: colors.brandSoft },
  otpActive: { borderColor: colors.brand, borderWidth: 2, backgroundColor: colors.surface },
  otpError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  otpChar: { fontFamily: fonts.bold, fontSize: 24, color: colors.text },
  otpOverlay: {
    opacity: 0.01,
    fontSize: 1,
    color: 'transparent',
    zIndex: 2,
  },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brand },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  googleText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  or: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  leadText: { fontFamily: fonts.regular, fontSize: 14, color: 'rgba(255,255,255,0.75)' },
  actionText: { fontFamily: fonts.bold, fontSize: 14, color: colors.goldLight },
});
