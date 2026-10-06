import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { avatarColor, initials, toneColors, type Tone } from '@/lib/format';
import { colors, fonts, gradients, radius, shadow, spacing, type } from '@/theme/tokens';

export type IconName = keyof typeof Ionicons.glyphMap;

// ---------- text ----------
type Variant = keyof typeof type;
export function AppText({ variant = 'body', color, style, ...rest }: TextProps & { variant?: Variant; color?: string }) {
  return <Text {...rest} style={[type[variant], color ? { color } : null, style]} />;
}

// ---------- button ----------
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  loading?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, variant = 'primary', size = 'md', icon, loading, full, disabled, style, ...rest }: ButtonProps) {
  const height = size === 'sm' ? 38 : size === 'lg' ? 54 : 46;
  const fg =
    variant === 'primary'
      ? colors.ink
      : variant === 'danger'
        ? colors.white
      : variant === 'secondary'
        ? colors.brand
        : variant === 'outline'
          ? colors.text
          : colors.brand;
  const inactive = disabled || loading;

  const content = (
    <View style={[styles.btnInner, { height, paddingHorizontal: size === 'sm' ? 14 : 20 }]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={fg} />}
          <Text style={[styles.btnText, { color: fg, fontSize: size === 'sm' ? 13 : 15 }]}>{title}</Text>
        </>
      )}
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      {...rest}
      style={({ pressed }) => [
        styles.btn,
        full && { alignSelf: 'stretch' },
        variant === 'secondary' && { backgroundColor: colors.brandSoft },
        variant === 'outline' && { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
        variant === 'danger' && { backgroundColor: colors.danger },
        variant === 'primary' && shadow.md,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 },
        inactive && { opacity: 0.55 },
        style,
      ]}>
      {variant === 'primary' ? (
        <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnGradient}>
          {!inactive && <Shine />}
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Pressable>
  );
}

/** A soft light band that sweeps across primary buttons every few seconds. */
function Shine() {
  const x = useSharedValue(0);
  useEffect(() => {
    x.set(
      withRepeat(
        withSequence(withDelay(2600, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) })), withTiming(0, { duration: 0 })),
        -1,
      ),
    );
  }, [x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -120 + x.get() * 620 }, { skewX: '-20deg' }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.shine, style]}>
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
    </Animated.View>
  );
}

// ---------- icon button ----------
export function IconButton({
  icon,
  onPress,
  color = colors.text,
  bg = colors.surface,
  size = 40,
  badge,
  label,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  bg?: string;
  size?: number;
  badge?: number;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' },
        pressed && { opacity: 0.7 },
      ]}>
      <Ionicons name={icon} size={size * 0.5} color={color} />
      {!!badge && badge > 0 && (
        <View style={styles.badgeDot}>
          <Text style={styles.badgeDotText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ---------- card ----------
export function Card({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}) {
  const base = [styles.card, padded && { padding: spacing.lg }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [...base, pressed && { transform: [{ scale: 0.99 }], backgroundColor: colors.surfaceAlt }]}>
      {children}
    </Pressable>
  );
}

// ---------- badge ----------
export function Badge({ label, tone = 'neutral', icon, style }: { label: string; tone?: Tone; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }, style]}>
      {icon && <Ionicons name={icon} size={12} color={c.fg} />}
      <Text style={[styles.badgeText, { color: c.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ---------- avatar ----------
export function Avatar({ name, id, size = 40 }: { name: string | null | undefined; id?: string; size?: number }) {
  const bg = avatarColor(id ?? name ?? '?');
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.white, fontFamily: fonts.semibold, fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
}

// ---------- icon tile ----------
export function IconTile({ icon, color, bg, size = 40 }: { icon: IconName; color: string; bg: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </View>
  );
}

// ---------- section title ----------
export function SectionTitle({
  title,
  action,
  onAction,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionRow, style]}>
      <AppText variant="h3">{title}</AppText>
      {action && (
        <Pressable onPress={onAction} hitSlop={8}>
          <AppText variant="smallMedium" color={colors.brand}>
            {action}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

// ---------- banner ----------
export function Banner({ tone = 'info', icon, title, children }: { tone?: Tone; icon?: IconName; title?: string; children?: ReactNode }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.banner, { backgroundColor: c.bg, borderColor: c.fg + '33' }]}>
      <Ionicons name={icon ?? (tone === 'danger' || tone === 'warning' ? 'warning' : 'information-circle')} size={20} color={c.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        {title && <Text style={[styles.bannerTitle, { color: c.fg }]}>{title}</Text>}
        {typeof children === 'string' ? <Text style={styles.bannerBody}>{children}</Text> : children}
      </View>
    </View>
  );
}

// ---------- row ----------
export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  chevron = !!onPress,
  titleStyle,
}: {
  title: string;
  subtitle?: string | null;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  titleStyle?: StyleProp<TextStyle>;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.bodyMedium, titleStyle]} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={type.small} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
      {chevron && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }} />;
}

// ---------- stat ----------
export function StatCard({
  label,
  value,
  icon,
  tint,
  soft,
  onPress,
  hint,
}: {
  label: string;
  value: string | number;
  icon: IconName;
  tint: string;
  soft: string;
  onPress?: () => void;
  hint?: string;
}) {
  return (
    <Card onPress={onPress} style={styles.stat}>
      <IconTile icon={icon} color={tint} bg={soft} size={36} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={type.small} numberOfLines={1}>
        {label}
      </Text>
      {hint && (
        <Text style={[type.small, { color: tint, fontFamily: fonts.medium, fontSize: 12 }]} numberOfLines={1}>
          {hint}
        </Text>
      )}
    </Card>
  );
}

// ---------- empty ----------
export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.brand} />
      </View>
      <AppText variant="h3" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      {body && (
        <AppText variant="small" style={{ textAlign: 'center', maxWidth: 300 }}>
          {body}
        </AppText>
      )}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: radius.md, backgroundColor: 'transparent', overflow: 'hidden' },
  btnGradient: { borderRadius: radius.md, overflow: 'hidden' },
  shine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 80 },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  btnText: { fontFamily: fonts.semibold, letterSpacing: 0.1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11.5, letterSpacing: 0.2, textAlign: 'center' },
  badgeDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDotText: { color: colors.white, fontFamily: fonts.bold, fontSize: 9 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.md },
  banner: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  bannerTitle: { fontFamily: fonts.semibold, fontSize: 14 },
  bannerBody: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  stat: { flex: 1, minWidth: 140, gap: 6, padding: spacing.lg },
  statValue: { fontFamily: fonts.bold, fontSize: 26, letterSpacing: -0.5, color: colors.text, marginTop: 4 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.huge, paddingHorizontal: spacing.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
});
