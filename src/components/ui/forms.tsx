import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDate, toDateOnly } from '@/lib/format';
import { useKeyboardScroll } from '@/providers/KeyboardScrollProvider';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme/tokens';

import { AppText, Button, type IconName } from './primitives';

// ---------- field wrapper ----------
function Field({ label, hint, error, children, right }: { label?: string; hint?: string; error?: string | null; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      {(label || right) && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          {label && <Text style={styles.label}>{label}</Text>}
          {right}
        </View>
      )}
      {children}
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

// ---------- text input ----------
interface TextFieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: IconName;
  secureToggle?: boolean;
  counter?: number;
  right?: ReactNode;
}

export function TextField({ label, hint, error, icon, secureToggle, counter, right, multiline, style, value, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureToggle);
  const containerRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);
  const { scrollToView } = useKeyboardScroll();

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      right={counter ? <Text style={styles.hint}>{`${value?.length ?? 0}/${counter}`}</Text> : undefined}>
      <Pressable
        ref={containerRef}
        onPress={() => inputRef.current?.focus()}
        style={[
          styles.inputWrap,
          multiline && { alignItems: 'flex-start', paddingVertical: spacing.md },
          focused && styles.inputFocused,
          !!error && { borderColor: colors.danger },
        ]}>
        {icon && (
          <Ionicons
            name={icon}
            size={18}
            color={focused ? colors.brand : colors.textMuted}
            style={multiline ? styles.iconMultiline : undefined}
          />
        )}
        <TextInput
          ref={inputRef}
          placeholderTextColor={colors.textMuted}
          {...rest}
          value={value}
          maxLength={counter ?? rest.maxLength}
          multiline={multiline}
          secureTextEntry={secureToggle ? hidden : rest.secureTextEntry}
          onFocus={(e) => {
            setFocused(true);
            scrollToView(containerRef.current);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, multiline && styles.inputMultiline, style]}
        />
        {secureToggle && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
          </Pressable>
        )}
        {right}
      </Pressable>
    </Field>
  );
}

// ---------- segmented ----------
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  scroll,
  dark,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  scroll?: boolean;
  /** Use on dark (header) backgrounds: translucent track, gold active pill. */
  dark?: boolean;
}) {
  const body = options.map((o) => {
    const active = o.value === value;
    return (
      <Pressable
        key={o.value}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        onPress={() => onChange(o.value)}
        style={[styles.segItem, scroll && { flex: 0, paddingHorizontal: 14 }, active && (dark ? styles.segActiveDark : styles.segActive)]}>
        <Text style={[styles.segText, dark && { color: 'rgba(255,255,255,0.72)' }, active && { color: dark ? colors.ink : colors.brand }]} numberOfLines={1}>
          {o.label}
        </Text>
        {!!o.count && (
          <View style={[styles.segCount, active && { backgroundColor: colors.brand }]}>
            <Text style={[styles.segCountText, active && { color: colors.white }]}>{o.count}</Text>
          </View>
        )}
      </Pressable>
    );
  });
  if (scroll) {
    return (
      <View style={[styles.segWrap, dark && styles.segWrapDark]}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[0]}
          keyExtractor={() => 'seg'}
          renderItem={() => <View style={{ flexDirection: 'row', gap: 4 }}>{body}</View>}
        />
      </View>
    );
  }
  return <View style={[styles.segWrap, dark && styles.segWrapDark, { flexDirection: 'row' }]}>{body}</View>;
}

// ---------- chips (single choice) ----------
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label?: string;
  options: { value: T; label: string; icon?: IconName; tint?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <View style={styles.chips}>
        {options.map((o) => {
          const active = o.value === value;
          const tint = o.tint ?? colors.brand;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => onChange(o.value)}
              style={[styles.chip, active && { borderColor: tint, backgroundColor: tint + '14' }]}>
              {o.icon && <Ionicons name={o.icon} size={15} color={active ? tint : colors.textSecondary} />}
              <Text style={[styles.chipText, active && { color: tint }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}

// ---------- luxury animated switch ----------
export function AppSwitch({
  value,
  onValueChange,
  disabled,
  color,
}: {
  value: boolean;
  onValueChange?: (val: boolean) => void;
  disabled?: boolean;
  color?: string;
}) {
  const offset = useSharedValue(value ? 20 : 0);

  useEffect(() => {
    offset.set(
      withTiming(value ? 20 : 0, {
        duration: 200,
        easing: Easing.bezier(0.2, 0, 0, 1),
      }),
    );
  }, [value, offset]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() }],
  }));

  const handlePress = () => {
    if (disabled) return;
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    onValueChange?.(!value);
  };

  const activeColor = color ?? colors.brand;

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      style={[
        styles.switchTrack,
        value
          ? [styles.switchTrackOn, color ? { backgroundColor: activeColor, borderColor: activeColor } : null]
          : styles.switchTrackOff,
        disabled && { opacity: 0.45 },
      ]}>
      <Animated.View style={[styles.switchThumb, thumbStyle]} />
    </Pressable>
  );
}

// ---------- switch row ----------
export function SwitchRow({
  label,
  description,
  value,
  onChange,
  disabled,
  color,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      disabled={disabled}
      style={({ pressed }) => [
        styles.switchRow,
        pressed && !disabled && { opacity: 0.8 },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}>
      <View style={{ flex: 1, gap: 2, paddingRight: spacing.md }}>
        <Text style={type.bodyMedium}>{label}</Text>
        {description && <Text style={type.small}>{description}</Text>}
      </View>
      <View pointerEvents="none">
        <AppSwitch value={value} disabled={disabled} color={color} />
      </View>
    </Pressable>
  );
}

// ---------- bottom sheet ----------
export function Sheet({
  visible,
  onClose,
  title,
  children,
  scroll = true,
  placement = 'bottom',
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Scrolls the content when it is taller than the screen (so buttons at the bottom stay reachable). Turn off when the content is its own list. */
  scroll?: boolean;
  /** 'bottom' slides up from the bottom edge; 'center' shows a centred card (dialogs and day details). */
  placement?: 'bottom' | 'center';
}) {
  const insets = useSafeAreaInsets();
  const centered = placement === 'center';
  const body = (
    <>
      {!centered && <View style={styles.grabber} />}
      <View style={styles.sheetHeader}>
        <AppText variant="h2" style={{ flex: 1 }}>
          {title}
        </AppText>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </Pressable>
      </View>
      {scroll ? (
        <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </>
  );
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        {centered ? (
          <View style={styles.centerWrap} pointerEvents="box-none">
            <Animated.View entering={ZoomIn.springify().damping(16).mass(0.7)} exiting={ZoomOut.duration(150)} style={styles.dialog}>
              {body}
            </Animated.View>
          </View>
        ) : (
          <Animated.View
            entering={ZoomIn.springify().damping(16).mass(0.7)}
            exiting={ZoomOut.duration(150)}
            style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            {body}
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------- select (searchable) ----------
export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string | null;
}

export function SelectField({
  label,
  placeholder = 'Select',
  options,
  value,
  onChange,
  hint,
  error,
  allowClear,
  icon,
}: {
  label?: string;
  placeholder?: string;
  options: SelectOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  hint?: string;
  error?: string | null;
  allowClear?: boolean;
  icon?: IconName;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(
    () => options.filter((o) => (o.label + ' ' + (o.sublabel ?? '')).toLowerCase().includes(q.trim().toLowerCase())),
    [options, q],
  );

  return (
    <Field label={label} hint={hint} error={error}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.inputWrap, pressed && styles.inputFocused, !!error && { borderColor: colors.danger }]}>
        {icon && <Ionicons name={icon} size={18} color={colors.textMuted} />}
        <View style={{ flex: 1, paddingVertical: 12 }}>
          <Text style={[type.body, !selected && { color: colors.textMuted }]} numberOfLines={1}>
            {selected?.label ?? placeholder}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label ?? placeholder} scroll={false}>
        {options.length > 7 && (
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
            <TextField icon="search" placeholder="Search" value={q} onChangeText={setQ} autoCorrect={false} />
          </View>
        )}
        <FlatList
          style={{ maxHeight: 420 }}
          data={allowClear ? [{ value: '__clear', label: 'None' }, ...filtered] : filtered}
          keyExtractor={(o) => o.value}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const active = item.value === value || (item.value === '__clear' && !value);
            return (
              <Pressable
                onPress={() => {
                  onChange(item.value === '__clear' ? null : item.value);
                  setOpen(false);
                  setQ('');
                }}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surfaceAlt }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.bodyMedium, active && { color: colors.brand }]}>{item.label}</Text>
                  {!!(item as SelectOption).sublabel && <Text style={type.small}>{(item as SelectOption).sublabel}</Text>}
                </View>
                {active && <Ionicons name="checkmark-circle" size={20} color={colors.brand} />}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={[type.small, { padding: spacing.lg, textAlign: 'center' }]}>No matches</Text>}
        />
      </Sheet>
    </Field>
  );
}

// ---------- date (quick picks + manual) ----------
export function DateField({ label, value, onChange, hint }: { label: string; value: string | null; onChange: (v: string | null) => void; hint?: string }) {
  const [text, setText] = useState(value ?? '');
  const containerRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);
  const { scrollToView } = useKeyboardScroll();

  const add = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const v = toDateOnly(d);
    setText(v);
    onChange(v);
  };
  const valid = !text || /^\d{4}-\d{2}-\d{2}$/.test(text);
  return (
    <Field label={label} hint={value ? formatDate(value) : hint} error={valid ? null : 'Use the format YYYY-MM-DD'}>
      <View style={styles.chips}>
        {[
          ['Today', 0],
          ['Tomorrow', 1],
          ['In 3 days', 3],
          ['Next week', 7],
        ].map(([l, d]) => (
          <Pressable key={l as string} onPress={() => add(d as number)} style={styles.chip}>
            <Text style={styles.chipText}>{l}</Text>
          </Pressable>
        ))}
        {value && (
          <Pressable
            onPress={() => {
              setText('');
              onChange(null);
            }}
            style={styles.chip}>
            <Ionicons name="close" size={14} color={colors.textSecondary} />
            <Text style={styles.chipText}>Clear</Text>
          </Pressable>
        )}
      </View>
      <Pressable ref={containerRef} onPress={() => inputRef.current?.focus()} style={styles.inputWrap}>
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
        <TextInput
          ref={inputRef}
          value={text}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted}
          onFocus={() => scrollToView(containerRef.current)}
          onChangeText={(t) => {
            setText(t);
            if (/^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t))) onChange(t);
            if (!t) onChange(null);
          }}
          style={styles.input}
          keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
          maxLength={10}
        />
      </Pressable>
    </Field>
  );
}

// ---------- prompt sheet (reason / note) ----------
export function PromptSheet({
  visible,
  onClose,
  title,
  message,
  placeholder,
  confirmLabel,
  danger,
  required = true,
  minLength = 3,
  onConfirm,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel: string;
  danger?: boolean;
  required?: boolean;
  minLength?: number;
  onConfirm: (text: string) => Promise<void> | void;
  children?: ReactNode;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = !required || text.trim().length >= minLength;
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        {message && <AppText variant="small">{message}</AppText>}
        {children}
        <TextField multiline value={text} onChangeText={setText} placeholder={placeholder} counter={2000} />
        <Button
          title={confirmLabel}
          variant={danger ? 'danger' : 'primary'}
          disabled={!ok}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await onConfirm(text.trim());
              setText('');
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textSecondary, letterSpacing: 0.1 },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  error: { fontFamily: fonts.medium, fontSize: 12, color: colors.danger },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  inputFocused: { borderColor: colors.brand, backgroundColor: '#FFFDF7' },
  iconMultiline: {
    marginTop: 2,
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    paddingVertical: Platform.OS === 'web' ? 12 : 10,
    paddingHorizontal: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  inputMultiline: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: 0,
    paddingBottom: 0,
    lineHeight: 22,
    includeFontPadding: false,
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', resize: 'none' } as object)
      : null),
  },
  segWrap: { backgroundColor: '#EFECE4', borderRadius: radius.md, padding: 4, gap: 4 },
  segWrapDark: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(229,227,172,0.2)' },
  segActiveDark: { backgroundColor: colors.goldLight, ...shadow.sm },
  segItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: radius.sm,
  },
  segActive: { backgroundColor: colors.surface, ...shadow.sm },
  segText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textSecondary },
  segCount: { minWidth: 20, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: '#E2DDD0', alignItems: 'center', justifyContent: 'center' },
  segCountText: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textSecondary },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14 },
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 2.5,
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  switchTrackOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brandDark,
  },
  switchTrackOff: {
    backgroundColor: '#E5E2D9',
    borderColor: '#D4CFC3',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 2.5,
    elevation: 3,
  },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 640,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.lg,
  },
  centerWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  dialog: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '86%',
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    ...shadow.lg,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginTop: spacing.sm },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14 },
});
