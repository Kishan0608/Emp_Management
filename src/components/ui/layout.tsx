import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, gradients, layout, radius, spacing, type } from '@/theme/tokens';

/** Standard scrollable page with a max width (tablet/web) and pull-to-refresh. */
export function Screen({
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
  const body = (
    <View style={styles.root}>
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: (footer ? 16 : insets.bottom) + 96 }, contentStyle]}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} /> : undefined}>
        <View style={styles.inner}>{children}</View>
      </ScrollView>
      {footer && <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>{footer}</View>}
    </View>
  );
  if (!keyboard) return body;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {body}
    </KeyboardAvoidingView>
  );
}

/** Plain header for pushed (detail) screens. */
export function PageHeader({ title, subtitle, right, back = true }: { title: string; subtitle?: string; right?: ReactNode; back?: boolean }) {
  const insets = useSafeAreaInsets();
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
  return (
    <LinearGradient colors={colorsOverride ?? gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.heroDecorA} />
      <View style={styles.heroDecorB} />
      <View style={styles.inner}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            {subtitle && <Text style={styles.heroSubtitle}>{subtitle}</Text>}
            <Text style={styles.heroTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {right}
        </View>
        {children}
      </View>
    </LinearGradient>
  );
}

/** Shimmering placeholder block used while lists load. */
export function Skeleton({ height = 16, width = '100%', radiusSize = 8, style }: { height?: number; width?: number | `${number}%`; radiusSize?: number; style?: ViewStyle }) {
  const o = useSharedValue(0.45);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height, width, borderRadius: radiusSize, backgroundColor: '#E3E6EF' }, anim, style]} />;
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
      <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabInner}>
        <Ionicons name={icon} size={22} color={colors.white} />
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
  heroDecorA: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.07)', top: -80, right: -60 },
  heroDecorB: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.05)', bottom: -60, left: -30 },
  heroSubtitle: { fontFamily: fonts.medium, fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 2 },
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
  fabText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
});
