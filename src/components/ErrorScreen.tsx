import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, gradients, radius, shadow, spacing } from '@/theme/tokens';

import { AnimatedBackdrop } from './AnimatedBackdrop';
import { BrandTile } from './brand/SkflLogo';
import { COMPANY } from './brand/skflPaths';
import { Button } from './ui/primitives';

/**
 * Friendly full-screen fallback used by route error boundaries and for
 * configuration problems, so the app never shows a raw crash to employees.
 */
export function ErrorScreen({
  title = 'Something went wrong',
  message = 'This screen ran into a problem. Your data is safe. Try again, or go back to the home screen.',
  error,
  onRetry,
  showHome = true,
}: {
  title?: string;
  message?: string;
  error?: Error;
  onRetry?: () => void;
  showHome?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <AnimatedBackdrop variant="full" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}>
        <Animated.View entering={ZoomIn.springify().damping(14)}>
          <BrandTile size={64} />
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(120).springify().damping(18)} style={styles.card}>
          <View style={styles.icon}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.brand} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {__DEV__ && error?.message ? (
            <Text style={styles.details} selectable>
              {error.message}
            </Text>
          ) : null}
          <View style={{ gap: spacing.sm, marginTop: spacing.xl, alignSelf: 'stretch' }}>
            {onRetry && <Button title="Try again" icon="refresh" size="lg" onPress={onRetry} />}
            {showHome && <Button title="Go to home" icon="home-outline" variant="outline" onPress={() => router.replace('/')} />}
          </View>
        </Animated.View>
        <Text style={styles.footer}>{COMPANY.name}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brandDeep },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, gap: spacing.xl },
  card: {
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: spacing.xxl,
    ...shadow.lg,
  },
  icon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { fontFamily: fonts.bold, fontSize: 21, color: colors.text, textAlign: 'center' },
  message: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },
  details: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.danger,
  },
  footer: { fontFamily: fonts.medium, fontSize: 12, letterSpacing: 1.5, color: 'rgba(229,227,172,0.7)' },
});
