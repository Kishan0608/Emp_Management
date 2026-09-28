import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, gradients, radius, shadow, spacing } from '@/theme/tokens';

import { Logo } from './Logo';

/** Shared layout for sign-in, 2FA, password and consent screens. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.top, { paddingTop: insets.top + 36 }]}>
        <View style={styles.decorA} />
        <View style={styles.decorB} />
        <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: 'center' }}>
          <Logo size={64} />
          <Text style={styles.brand}>Emp Management</Text>
        </Animated.View>
      </LinearGradient>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.delay(120).duration(500)} style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            <View style={{ gap: spacing.lg, marginTop: spacing.xl }}>{children}</View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { height: 260, alignItems: 'center', overflow: 'hidden' },
  decorA: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.06)', top: -90, right: -70 },
  decorB: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(124,58,237,0.3)', bottom: -60, left: -40 },
  brand: { marginTop: 14, fontFamily: fonts.bold, fontSize: 20, color: colors.white, letterSpacing: -0.3 },
  card: {
    marginTop: -64,
    marginHorizontal: spacing.lg,
    alignSelf: 'center',
    width: '92%',
    maxWidth: 460,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    ...shadow.lg,
  },
  title: { fontFamily: fonts.bold, fontSize: 24, color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 6 },
});
