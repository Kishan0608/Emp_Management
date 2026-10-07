import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing } from '@/theme/tokens';

/** Rows per page in every long list (server pages and loaded lists). */
export const PAGE_SIZE = 20;

/** Page numbers around the current one, e.g. [0, '…', 4, 5, 6, '…', 11]. Fewer on a phone. */
function pageList(current: number, count: number): (number | '…')[] {
  if (count <= 5) return Array.from({ length: count }, (_, i) => i);
  const out: (number | '…')[] = [0];
  const from = Math.max(1, current - 1);
  const to = Math.min(count - 2, current + 1);
  if (from > 1) out.push('…');
  for (let i = from; i <= to; i++) out.push(i);
  if (to < count - 2) out.push('…');
  out.push(count - 1);
  return out;
}

/** "21–40 of 57" + ‹ 1 2 3 › under a list. Hidden when everything fits on one page. */
export function Pagination({
  page,
  total,
  onChange,
  size = PAGE_SIZE,
  busy,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
  size?: number;
  busy?: boolean;
}) {
  const count = Math.ceil(total / size);
  if (count <= 1) return null;
  const prev = page > 0 && !busy;
  const next = page + 1 < count && !busy;
  return (
    <View style={styles.wrap}>
      <Text style={styles.summary}>
        {page * size + 1}–{Math.min((page + 1) * size, total)} of {total}
      </Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => prev && onChange(page - 1)}
          disabled={!prev}
          accessibilityRole="button"
          accessibilityLabel="Previous page"
          hitSlop={6}
          style={({ pressed }) => [styles.btn, !prev && styles.off, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={16} color={colors.text} />
        </Pressable>
        {pageList(page, count).map((n, i) =>
          n === '…' ? (
            <Text key={`gap-${i}`} style={styles.gap}>
              …
            </Text>
          ) : (
            <Pressable
              key={n}
              onPress={() => !busy && n !== page && onChange(n)}
              accessibilityRole="button"
              accessibilityLabel={`Page ${n + 1}`}
              accessibilityState={{ selected: n === page }}
              hitSlop={4}
              style={({ pressed }) => [styles.btn, n === page && styles.current, pressed && styles.pressed]}>
              <Text style={[styles.num, n === page && styles.numCurrent]}>{n + 1}</Text>
            </Pressable>
          ),
        )}
        <Pressable
          onPress={() => next && onChange(page + 1)}
          disabled={!next}
          accessibilityRole="button"
          accessibilityLabel="Next page"
          hitSlop={6}
          style={({ pressed }) => [styles.btn, !next && styles.off, pressed && styles.pressed]}>
          <Ionicons name="chevron-forward" size={16} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * One page of a list that is already loaded (lists that grow with headcount, not with time).
 * Goes back to page 1 when `resetKey` changes (search, filters); stays valid if the list shrinks.
 */
export function usePaged<T>(rows: T[], resetKey: unknown, size = PAGE_SIZE) {
  const [state, setState] = useState<{ key: string; page: number }>({ key: '', page: 0 });
  const key = JSON.stringify(resetKey);
  const wanted = state.key === key ? state.page : 0;
  const page = Math.min(wanted, Math.max(0, Math.ceil(rows.length / size) - 1));
  return {
    page,
    rows: rows.slice(page * size, (page + 1) * size),
    total: rows.length,
    setPage: (p: number) => setState({ key, page: p }),
  };
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  summary: { fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  btn: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  current: { backgroundColor: colors.brandDeep, borderColor: colors.brandDeep },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  num: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  numCurrent: { color: colors.white },
  gap: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted, paddingHorizontal: 2 },
});
