import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, gradients, radius, shadow, spacing } from '@/theme/tokens';

import { AnimatedBackdrop } from './AnimatedBackdrop';
import { Logo } from './Logo';

/**
 * Shared layout for sign-in, 2FA, password and consent screens:
 * animated gradient background, a brand row, and one content card.
 * Everything scrolls together, so nothing is ever hidden under the header.
 */
export function AuthShell({ title, subtitle, children, icon }: { title: string; subtitle: string; children: ReactNode; icon?: keyof typeof Ionicons.glyphMap }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <AnimatedBackdrop variant="full" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(600)} style={styles.brandRow}>
            <Logo size={52} />
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.brand} numberOfLines={1} adjustsFontSizeToFit>
                Emp Management
              </Text>
              <View style={styles.tagRow}>
                <View style={[styles.dot, { backgroundColor: colors.task }]} />
                <Text style={styles.tag}>Tasks</Text>
                <View style={[styles.dot, { backgroundColor: colors.complaint }]} />
                <Text style={styles.tag}>Complaints</Text>
                <View style={[styles.dot, { backgroundColor: colors.feedback }]} />
                <Text style={styles.tag}>Feedback</Text>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(150).duration(600).springify().damping(18)} style={styles.card}>
            <LinearGradient
              colors={[colors.task, colors.feedback, colors.accent, colors.complaint]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.accentBar}
            />
            {icon && (
              <View style={styles.iconBadge}>
                <Ionicons name={icon} size={24} color={colors.brand} />
              </View>
            )}
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            <View style={{ gap: spacing.lg, marginTop: spacing.xl }}>{children}</View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(400).duration(600)} style={styles.footer}>
            <Ionicons name="shield-checkmark" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.footerText}>Role-based access · encrypted · audit logged</Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brandDeep, overflow: 'hidden' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, alignItems: 'center' },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
    maxWidth: 460,
    marginBottom: spacing.xxl,
    paddingHorizontal: spacing.xs,
  },
  brand: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.white, letterSpacing: -0.5 },
  tagRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  tag: { fontFamily: fonts.medium, fontSize: 12, color: 'rgba(255,255,255,0.75)', marginRight: 10 },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: spacing.xxl,
    paddingTop: spacing.xxl + 4,
    overflow: 'hidden',
    ...shadow.lg,
  },
  accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.md + 2,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontFamily: fonts.bold, fontSize: 24, color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.textSecondary, marginTop: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xl },
  footerText: { fontFamily: fonts.medium, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
});
