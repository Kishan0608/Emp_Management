import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { createElement, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Sheet } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

/** 'YYYY-MM-DD' in the device's local time. */
function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fromKey(key: string | null): Date {
  return key ? new Date(`${key}T00:00:00`) : new Date();
}

function pretty(key: string): string {
  return fromKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * A real date picker on every platform: the browser's date field on web, the system
 * calendar dialog on Android and a calendar sheet on iOS. Value is 'YYYY-MM-DD' or null.
 */
export function DateInput({
  label,
  value,
  onChange,
  min,
  placeholder = 'Pick a date',
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  /** Earliest selectable day, 'YYYY-MM-DD'. */
  min?: string | null;
  placeholder?: string;
}) {
  const [iosOpen, setIosOpen] = useState(false);

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode: 'date',
        value: fromKey(value ?? min ?? null),
        minimumDate: min ? fromKey(min) : undefined,
        onValueChange: (_e, picked) => {
          if (picked) onChange(toKey(picked));
        },
      });
    } else {
      setIosOpen(true);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === 'web' ? (
        createElement('input', {
          type: 'date',
          value: value ?? '',
          min: min ?? undefined,
          'aria-label': label,
          onChange: (e: { target: { value: string } }) => onChange(e.target.value || null),
          style: {
            fontFamily: fonts.regular,
            fontSize: 15,
            color: colors.text,
            background: colors.surface,
            border: `1.5px solid ${colors.border}`,
            borderRadius: radius.md,
            padding: '12px 12px',
            minHeight: 48,
            outline: 'none',
            width: '100%',
            boxSizing: 'border-box',
          },
        })
      ) : (
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed }) => [styles.field, pressed && { borderColor: colors.brand }]}>
          <Ionicons name="calendar-outline" size={18} color={value ? colors.brand : colors.textMuted} />
          <Text style={[styles.value, !value && { color: colors.textMuted }]}>{value ? pretty(value) : placeholder}</Text>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </Pressable>
      )}

      {Platform.OS === 'ios' && (
        <Sheet visible={iosOpen} onClose={() => setIosOpen(false)} title={label} scroll={false}>
          <View style={{ paddingHorizontal: spacing.lg }}>
            <DateTimePicker
              value={fromKey(value ?? min ?? null)}
              mode="date"
              display="inline"
              minimumDate={min ? fromKey(min) : undefined}
              accentColor={colors.brand}
              themeVariant="light"
              onValueChange={(_e, picked) => {
                if (picked) onChange(toKey(picked));
              }}
            />
            <Button title="Done" size="lg" onPress={() => setIosOpen(false)} style={{ marginTop: spacing.md }} />
          </View>
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.text },
  field: {
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
  value: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.text },
});
