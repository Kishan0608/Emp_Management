import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useEffect, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedBackdrop } from '@/components/AnimatedBackdrop';
import { BrandTile } from '@/components/brand/SkflLogo';
import { COMPANY } from '@/components/brand/skflPaths';
import { colors, fonts, gradients, layout, radius, spacing, type } from '@/theme/tokens';

import { KeyboardScrollProvider, useKeyboardScroll } from '@/providers/KeyboardScrollProvider';

/** Standard scrollable page with a max width (tablet/web) and pull-to-refresh. */
export function Screen(props: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  header?: ReactNode;
  footer?: ReactNode;
  contentStyle?: ViewStyle;
  keyboard?: boolean;
}) {
  return (
    <KeyboardScrollProvider>
      <ScreenContent {...props} />
    </KeyboardScrollProvider>
  );
}

function ScreenContent({
  children,
  refreshing,
  onRefresh,
  header,
  footer,
  contentStyle,
  keyboard,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  header?: ReactNode;
  footer?: ReactNode;
  contentStyle?: ViewStyle;
  keyboard?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { scrollRef, onScroll, keyboardHeight, isKeyboardVisible } = useKeyboardScroll();

  const body = (
    <View style={styles.root}>
      {header}
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: (footer ? 16 : insets.bottom) + (isKeyboardVisible ? keyboardHeight + spacing.xl : 96),
          },
          contentStyle,
        ]}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} /> : undefined}>
        <Animated.View entering={FadeIn.duration(320)} style={styles.inner}>
          {children}
        </Animated.View>
      </ScrollView>
      {footer && <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>{footer}</View>}
    </View>
  );

  if (footer || keyboard) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {body}
      </KeyboardAvoidingView>
    );
  }

  return body;
}

/** Plain header for pushed (detail) screens. */
export function PageHeader({ title, subtitle, right, back = true }: { title: string; subtitle?: string; right?: ReactNode; back?: boolean }) {
  const insets = useSafeAreaInsets();
  useFocusEffect(useCallback(() => setStatusBarStyle('dark', true), []));
  return (
    <View style={[styles.pageHeader, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.pageHeaderInner}>
        {back && (
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            hitSlop={10}
            accessibilityLabel="Go back"
            style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={type.h2} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={type.small} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        {right}
      </View>
    </View>
  );
}

/** Gradient header for tab screens. */
export function HeroHeader({
  title,
  subtitle,
  right,
  children,
  colorsOverride,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children?: ReactNode;
  colorsOverride?: readonly [string, string, ...string[]];
}) {
  const insets = useSafeAreaInsets();
  useFocusEffect(useCallback(() => setStatusBarStyle('light', true), []));
  return (
    <LinearGradient colors={colorsOverride ?? gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
      <AnimatedBackdrop variant="subtle" />
      <View style={styles.inner}>
        <View style={styles.brandStrip}>
          <BrandTile size={26} />
          <Text style={styles.brandText} numberOfLines={1}>
            {COMPANY.name.toUpperCase()}
          </Text>
        </View>
        <Animated.View entering={FadeInDown.duration(420)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            {subtitle && <Text style={styles.heroSubtitle}>{subtitle}</Text>}
            <Text style={styles.heroTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {right}
        </Animated.View>
        {children}
      </View>
      <LinearGradient colors={gradients.goldLine} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.heroRule} />
    </LinearGradient>
  );
}

/** Placeholder block with a soft gold shimmer, used while content loads. */
export function Skeleton({ height = 16, width = '100%', radiusSize = 8, style }: { height?: number; width?: number | `${number}%`; radiusSize?: number; style?: ViewStyle }) {
  const x = useSharedValue(0);
  useEffect(() => {
    x.set(withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }), -1, false));
  }, [x]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: -160 + x.get() * 560 }] }));
  return (
    <View style={[{ height, width, borderRadius: radiusSize, backgroundColor: '#EEEAE1', overflow: 'hidden' }, style]}>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 160 }, anim]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,248,230,0.95)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.skelCard}>
          <Skeleton height={40} width={40} radiusSize={20} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton height={14} width="70%" />
            <Skeleton height={12} width="45%" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Floating action button. */
export function Fab({ icon = 'add', label, onPress }: { icon?: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 84 }, pressed && { transform: [{ scale: 0.96 }] }]}>
      <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabInner}>
        <Ionicons name={icon} size={22} color={colors.ink} />
        <Text style={styles.fabText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: spacing.lg },
  inner: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center' },
  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pageHeader: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.md, paddingHorizontal: spacing.lg },
  pageHeaderInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center' },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  hero: { paddingHorizontal: layout.screenPadding, paddingBottom: spacing.xxl, overflow: 'hidden', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroSubtitle: { fontFamily: fonts.medium, fontSize: 13, color: '#E5E3AC', marginBottom: 2 },
  heroRule: { position: 'absolute', left: 24, right: 24, bottom: 0, height: 1.5 },
  brandStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.lg },
  brandText: { flex: 1, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.8, color: 'rgba(229,227,172,0.9)' },
  heroTitle: { fontFamily: fonts.bold, fontSize: 24, color: colors.white, letterSpacing: -0.4 },
  skelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fab: { position: 'absolute', right: spacing.lg, borderRadius: radius.pill, overflow: 'hidden' },
  fabInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 20, height: 52, borderRadius: radius.pill },
  fabText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
});
