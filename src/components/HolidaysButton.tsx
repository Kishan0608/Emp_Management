import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { dayKey } from '@/lib/format';
import { colors, fonts, radius } from '@/theme/tokens';

const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000);

/**
 * Quiet outlined button for the charcoal Attendance header. A small gold dot appears
 * only when a holiday falls within the next week; the details live on the Holidays screen.
 */
export function HolidaysButton({ onPress }: { onPress: () => void }) {
  const year = new Date().getFullYear();
  const list = useLoad(() => api.listHolidays(year).catch(() => []), [year]);

  const soon = useMemo(() => {
    const today = dayKey();
    const next = (list.data ?? []).filter((h) => h.holiday_date >= today).sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))[0];
    if (!next) return null;
    const n = daysBetween(today, next.holiday_date);
    return n <= 7 ? { name: next.name, when: n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days` } : null;
  }, [list.data]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={soon ? `Holidays. ${soon.name} ${soon.when}` : 'Holidays'}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
      <View>
        <Ionicons name="calendar-outline" size={16} color={colors.white} />
        {soon && <View style={styles.dot} />}
      </View>
      <Text style={styles.label}>Holidays</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  pressed: { backgroundColor: 'rgba(255,255,255,0.16)' },
  dot: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.gold,
  },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.white, letterSpacing: 0.2 },
});
