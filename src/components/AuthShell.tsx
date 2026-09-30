import { LinearGradient } from 'expo-linear-gradient';
import { NavigationBar } from 'expo-navigation-bar';
import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, gradients, shadow, spacing } from '@/theme/tokens';

import { AnimatedBackdrop } from './AnimatedBackdrop';
import { SkflMark } from './brand/SkflLogo';
import { CHARCOAL_STOPS, COMPANY } from './brand/skflPaths';

/**
 * Shared layout for sign-in, sign-up, onboarding and password screens:
 * brushed-charcoal animated background (drawn edge to edge, under the system
 * navigation bar), the SKFL logo, one card with a centred title, and optional
 * links below the card.
 */
import { KeyboardScrollProvider, useKeyboardScroll } from '@/providers/KeyboardScrollProvider';

export function AuthShell(props: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  below?: ReactNode;
  compactLogo?: boolean;
  /** Smaller card, for short content like the passcode pad. */
  narrow?: boolean;
  /** @deprecated kept for older screens; no longer shown */
  icon?: string;
}) {
  return (
    <KeyboardScrollProvider>
      <AuthShellContent {...props} />
    </KeyboardScrollProvider>
  );
}

function AuthShellContent({
  title,
  subtitle,
  children,
  below,
  compactLogo,
  narrow,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  below?: ReactNode;
  compactLogo?: boolean;
  /** Smaller card, for short content like the passcode pad. */
  narrow?: boolean;
  /** @deprecated kept for older screens; no longer shown */
  icon?: string;
}) {
  const insets = useSafeAreaInsets();
  const { scrollRef, onScroll, keyboardHeight, isKeyboardVisible } = useKeyboardScroll();

  return (
    <View style={styles.root}>
      {/* Light buttons on the charcoal background; the bar itself stays transparent over the page. */}
      <NavigationBar style="dark" />
      <LinearGradient colors={CHARCOAL_STOPS} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <AnimatedBackdrop variant="full" />

      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top + (isKeyboardVisible ? spacing.md : spacing.xxl),
              paddingBottom: insets.bottom + (isKeyboardVisible ? keyboardHeight + spacing.xxl : spacing.xxl),
              justifyContent: isKeyboardVisible ? 'flex-start' : 'center',
            },
          ]}
          showsVerticalScrollIndicator={false}>
          <Animated.View
            entering={FadeInDown.duration(600)}
            style={[styles.brandBlock, (compactLogo || isKeyboardVisible) && { marginBottom: spacing.md }]}>
            <SkflMark width={compactLogo || isKeyboardVisible ? 120 : 200} />
            <Text style={styles.brand} numberOfLines={1} adjustsFontSizeToFit>
              {COMPANY.name.toUpperCase()}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(150).duration(600).springify().damping(18)} style={[styles.card, narrow && styles.cardNarrow]}>
            <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.accentBar} />
            <Text style={[styles.title, narrow && { fontSize: 22 }]}>{title}</Text>
            {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            <View style={{ gap: spacing.lg, marginTop: narrow ? spacing.lg : spacing.xl }}>{children}</View>
          </Animated.View>

          {below && (
            <Animated.View entering={FadeInUp.delay(350).duration(600)} style={styles.below}>
              {below}
            </Animated.View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#3A3935', overflow: 'hidden' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, alignItems: 'center' },
  brandBlock: { alignItems: 'center', gap: spacing.md, width: '100%', maxWidth: 460, marginBottom: spacing.xxl },
  brand: { fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 3.5, color: colors.goldLight, textAlign: 'center' },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: spacing.xxl,
    paddingTop: spacing.xxl + 8,
    overflow: 'hidden',
    ...shadow.lg,
  },
  cardNarrow: { maxWidth: 360, padding: spacing.lg, paddingTop: spacing.xl, borderRadius: 24 },
  accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  title: { fontFamily: fonts.extrabold, fontSize: 26, color: colors.text, letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.textSecondary, marginTop: 6, textAlign: 'center' },
  below: { width: '100%', maxWidth: 460, alignItems: 'center', marginTop: spacing.xl, gap: spacing.sm },
});
