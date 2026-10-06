import { LinearGradient } from 'expo-linear-gradient';
import { NavigationBar } from 'expo-navigation-bar';
import { useId, useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { KeyboardScrollProvider, useKeyboardScroll } from '@/providers/KeyboardScrollProvider';
import { colors, fonts, gradients, shadow, spacing } from '@/theme/tokens';

import { rangoliBeadRadius, rangoliSizeForClearRadius } from './brand/RangoliMandala';
import { RangoliWatermark } from './brand/RangoliWatermark';
import { SkflMark } from './brand/SkflLogo';
import { COMPANY } from './brand/skflPaths';

/**
 * Shared layout for sign-in, sign-up, onboarding and password screens.
 * Carries on from the loading screen: dark ink background, a soft gold glow,
 * the rangoli turning slowly behind the SKFL logo, then one white card with a
 * centred title and optional links below it.
 */

const INK = ['#1B1914', '#0E0D0A', '#070705'] as const;

/** Gap (px) between the corners of the logo + company name and the rangoli's inner ring. */
const MEDALLION_MARGIN = 10;

export function AuthShell(props: {
  title: string;
  subtitle?: string;
  /** Small gold caption above the title, e.g. "Employee portal". */
  eyebrow?: string;
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
  eyebrow,
  children,
  below,
  compactLogo,
  narrow,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children: ReactNode;
  below?: ReactNode;
  compactLogo?: boolean;
  narrow?: boolean;
  icon?: string;
}) {
  const insets = useSafeAreaInsets();
  const { scrollRef, onScroll, keyboardHeight, isKeyboardVisible } = useKeyboardScroll();
  // Dense: form-heavy screens (sign-up, reset, onboarding) that should fit on one phone
  // screen. Slim logo header unless the medallion fits, tighter card spacing.
  const dense = !!compactLogo;
  const compact = dense || isKeyboardVisible;
  const logoWidth = compact ? 112 : 168;

  // The logo and company name must sit entirely inside the rangoli's plain centre, so no
  // line crosses the text: measure them and size the rangoli from their corners.
  const [brandBox, setBrandBox] = useState<{ w: number; h: number } | null>(null);
  const onBrandLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setBrandBox((prev) => (prev && Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }));
  };
  const medallionSize = brandBox ? rangoliSizeForClearRadius(Math.hypot(brandBox.w / 2, brandBox.h / 2) + MEDALLION_MARGIN) : 0;
  const beadRadius = rangoliBeadRadius(medallionSize);
  // Room above for the whole medallion; below, the card overlaps its lower edge.
  const medallionPadTop = Math.max(spacing.xxxl, beadRadius - (brandBox?.h ?? 0) / 2 + spacing.sm);
  const padTop = insets.top + (compact ? spacing.md : spacing.lg);
  const padBottom = insets.bottom + (isKeyboardVisible ? keyboardHeight + spacing.xxl : dense ? spacing.md : spacing.xl);
  const showMedallion = !!brandBox && !isKeyboardVisible;

  // Dense screens keep the slim header's height: their smaller medallion overlaps the top
  // and sides of the page instead of adding space above the logo.
  const brandPadTop = showMedallion && !dense ? medallionPadTop : spacing.sm;
  const brandPadBottom = showMedallion && !dense ? spacing.lg : spacing.sm;

  return (
    <View style={styles.root}>
      {/* Light buttons on the dark background; the bar itself stays transparent over the page. */}
      <NavigationBar style="dark" />
      <LinearGradient colors={INK} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />

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
            { paddingTop: padTop, paddingBottom: padBottom, justifyContent: isKeyboardVisible ? 'flex-start' : 'center' },
          ]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.column}>
            <View style={[styles.brandBlock, { paddingTop: brandPadTop, paddingBottom: brandPadBottom }, (!showMedallion || dense) && { marginBottom: spacing.md }]}>
              {/* Glow and rangoli sit behind the logo and spill past the screen edges; the card covers the bottom */}
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: brandPadTop, bottom: brandPadBottom }]}>
                <BrandGlow size={Math.max(logoWidth * 2.6, showMedallion ? beadRadius * 2.4 : 0)} />
                {showMedallion && <RangoliWatermark size={medallionSize} />}
              </View>
              <Animated.View entering={FadeIn.duration(500)} onLayout={onBrandLayout} style={{ alignItems: 'center', gap: compact ? 8 : 10 }}>
                <SkflMark width={logoWidth} />
                <Text style={styles.brand} numberOfLines={1} adjustsFontSizeToFit>
                  {COMPANY.name.toUpperCase()}
                </Text>
              </Animated.View>
            </View>

            <Animated.View
              entering={FadeInUp.delay(150).duration(600).springify().damping(18)}
              style={[styles.card, dense && styles.cardDense, narrow && styles.cardNarrow]}>
              <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.accentBar} />
              {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
              <Text style={[styles.title, dense && { fontSize: 23 }, narrow && { fontSize: 22 }]}>{title}</Text>
              {!!subtitle && <Text style={[styles.subtitle, dense && { marginTop: 4 }]}>{subtitle}</Text>}
              <View style={{ gap: dense ? spacing.md : spacing.lg, marginTop: dense || narrow ? spacing.lg : spacing.xl }}>{children}</View>
            </Animated.View>

            {below && (
              <Animated.View entering={FadeInUp.delay(350).duration(600)} style={[styles.below, dense && { marginTop: spacing.md }]}>
                {below}
              </Animated.View>
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

/** Feathered gold glow behind the logo (a real radial fade, no hard edge). */
function BrandGlow({ size }: { size: number }) {
  // Unique per instance: a screen hidden in the stack keeps its SVG, and ids are global on web.
  const gid = `authBrandGlow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Svg width={size} height={size} viewBox="-50 -50 100 100">
        <Defs>
          <RadialGradient id={gid} cx="0%" cy="0%" r="50%" fx="0%" fy="0%">
            <Stop offset="0%" stopColor="#E5E3AC" stopOpacity="0.20" />
            <Stop offset="45%" stopColor="#C9B96A" stopOpacity="0.08" />
            <Stop offset="100%" stopColor="#070705" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="0" cy="0" r="50" fill={`url(#${gid})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0A08', overflow: 'hidden' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, alignItems: 'center' },
  column: { width: '100%', alignItems: 'center' },
  brandBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 460,
    marginBottom: spacing.lg,
  },
  brand: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 3, color: colors.goldLight, textAlign: 'center' },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(229, 227, 172, 0.55)',
    padding: spacing.xxl,
    paddingTop: spacing.xxl + 6,
    overflow: 'hidden',
    ...shadow.lg,
  },
  cardDense: { padding: spacing.xl, paddingTop: spacing.xl + 4 },
  cardNarrow: { maxWidth: 360, padding: spacing.lg, paddingTop: spacing.xl, borderRadius: 22 },
  accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    color: colors.brand,
    textAlign: 'center',
    marginBottom: 6,
  },
  title: { fontFamily: fonts.extrabold, fontSize: 26, color: colors.text, letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.textSecondary, marginTop: 6, textAlign: 'center' },
  below: { width: '100%', maxWidth: 460, alignItems: 'center', marginTop: spacing.xl, gap: spacing.sm },
});
