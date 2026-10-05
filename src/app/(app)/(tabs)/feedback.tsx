import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { FeedbackCard } from '@/components/cards';
import {
  Banner,
  Card,
  EmptyState,
  HeaderAddButton,
  HeroHeader,
  ListSkeleton,
  Screen,
} from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { useMe } from '@/providers/AuthProvider';
import { useOrganization } from '@/providers/OrganizationProvider';
import { colors, fonts, gradients, radius, shadow, spacing } from '@/theme/tokens';

export type FeedbackScope = 'inbox' | 'mine' | 'blockers' | 'qa';

export default function Feedback() {
  const { me, isEmployee, isBoss } = useMe();
  const { selectedOrgId } = useOrganization();
  const isStaff = !isEmployee;
  const params = useLocalSearchParams<{ scope?: FeedbackScope }>();
  const [scope, setScope] = useState<FeedbackScope>(params.scope ?? 'inbox');
  const [q, setQ] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  // Follow deep links like /feedback?scope=blockers
  const [lastParam, setLastParam] = useState(params.scope);
  if (params.scope !== lastParam) {
    setLastParam(params.scope);
    if (params.scope) setScope(params.scope);
  }

  const { data, loading, refreshing, refresh, error } = useLoad(
    () => api.feedback(scope, me.id, isStaff, isBoss ? selectedOrgId : null),
    [scope, me.id, isStaff, selectedOrgId]
  );

  const counts = useLoad(
    () => api.feedbackCounts(me.id, isStaff),
    [me.id, isStaff]
  );

  const handleRefresh = () => {
    refresh();
    counts.reload();
  };

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter(
      (f) =>
        !term ||
        f.title.toLowerCase().includes(term) ||
        f.body.toLowerCase().includes(term) ||
        f.author?.full_name?.toLowerCase().includes(term)
    );
  }, [data, q]);

  // 4 scopes with icons, colors, counts, and descriptions
  const scopes: {
    value: FeedbackScope;
    label: string;
    sublabel: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    count?: number;
  }[] = [
    {
      value: 'inbox',
      label: 'Inbox',
      sublabel: isStaff ? 'Incoming team submissions' : 'Your feedback inbox',
      icon: 'mail-outline',
      color: colors.brand,
      count: counts.data?.inbox,
    },
    {
      value: 'mine',
      label: 'Mine',
      sublabel: 'Posts you submitted',
      icon: 'person-outline',
      color: colors.info,
      count: counts.data?.mine,
    },
    {
      value: 'blockers',
      label: 'Blockers',
      sublabel: 'Urgent work blockers',
      icon: 'hand-left-outline',
      color: colors.danger,
      count: counts.data?.blockers,
    },
    {
      value: 'qa',
      label: 'Q&A',
      sublabel: 'Verified questions & answers',
      icon: 'library-outline',
      color: colors.success,
      count: counts.data?.qa,
    },
  ];

  const selectedScopeObj = scopes.find((s) => s.value === scope) ?? scopes[0];

  const searchPlaceholder =
    scope === 'inbox'
      ? 'Search inbox…'
      : scope === 'mine'
        ? 'Search my submissions…'
        : scope === 'blockers'
          ? 'Search blockers…'
          : 'Search Q&A board…';

  return (
    <View style={{ flex: 1 }}>
      <Screen
        refreshing={refreshing}
        onRefresh={handleRefresh}
        header={
          <HeroHeader
            title="Feedback"
            subtitle="Questions · ideas · blockers"
            colorsOverride={gradients.feedback}
            right={<HeaderAddButton label="New" icon="create-outline" onPress={() => router.push('/feedback/new')} />}
          />
        }
      >
        <View style={{ gap: spacing.md }}>
          {/* SEARCH & FILTER ROW */}
          <View style={{ position: 'relative', zIndex: 20 }}>
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={searchPlaceholder}
                  placeholderTextColor={colors.textMuted}
                  value={q}
                  onChangeText={setQ}
                  onFocus={() => setFilterOpen(false)}
                  autoCorrect={false}
                />
                {q.length > 0 && (
                  <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Clear search">
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>

              <Pressable
                onPress={() => setFilterOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Filter by category"
                style={({ pressed }) => [
                  styles.filterIconBtn,
                  filterOpen && styles.filterIconBtnActive,
                  pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] },
                ]}>
                <Ionicons
                  name={filterOpen ? 'funnel' : 'funnel-outline'}
                  size={18}
                  color={filterOpen ? colors.brand : colors.text}
                />
                {scope !== 'inbox' && <View style={styles.filterActiveDot} />}
              </Pressable>
            </View>

            {/* ATTACHED DROPDOWN LIST */}
            {filterOpen && (
              <View style={styles.filterDropdown}>
                {scopes.map((s, idx) => {
                  const active = s.value === scope;
                  return (
                    <Pressable
                      key={s.value}
                      onPress={() => {
                        setScope(s.value);
                        setFilterOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.filterOption,
                        active && styles.filterOptionActive,
                        pressed && styles.filterOptionPressed,
                        idx < scopes.length - 1 && styles.filterOptionBorder,
                      ]}>
                      <View style={[styles.filterOptionIcon, { backgroundColor: active ? s.color + '20' : colors.surfaceAlt }]}>
                        <Ionicons name={s.icon} size={18} color={active ? s.color : colors.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.filterOptionTitle, active && { color: s.color, fontFamily: fonts.bold }]}>
                            {s.label}
                          </Text>
                          {typeof s.count === 'number' && s.count > 0 && (
                            <View style={[styles.optionCountBadge, active && { backgroundColor: s.color }]}>
                              <Text style={[styles.optionCountText, active && { color: colors.white }]}>
                                {s.count}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.filterOptionSubtitle}>{s.sublabel}</Text>
                      </View>
                      {active && <Ionicons name="checkmark-circle" size={18} color={s.color} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {error && <Banner tone="danger">{error}</Banner>}

          {loading ? (
            <ListSkeleton rows={4} />
          ) : list.length === 0 ? (
            <Card>
              <EmptyState
                icon={
                  scope === 'qa'
                    ? 'library-outline'
                    : scope === 'blockers'
                      ? 'shield-checkmark-outline'
                      : scope === 'mine'
                        ? 'create-outline'
                        : 'mail-unread-outline'
                }
                title={
                  scope === 'qa'
                    ? 'No published Q&A yet'
                    : scope === 'blockers'
                      ? 'No open blockers'
                      : scope === 'mine'
                        ? 'No submissions yet'
                        : 'No feedback in your inbox'
                }
                body={
                  scope === 'mine'
                    ? 'Ask a question, share feedback, or report what is stopping your work.'
                    : scope === 'blockers'
                      ? 'There are currently no active blockers stopping work.'
                      : scope === 'qa'
                        ? 'Questions answered and published to the Q&A board will show here.'
                        : 'Questions, feedback, or blockers sent to your team appear here.'
                }
              />
            </Card>
          ) : (
            list.map((f, i) => (
              <FeedbackCard
                key={f.id}
                item={f}
                index={i}
                currentUserId={me.id}
              />
            ))
          )}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14.5,
    color: colors.text,
    paddingVertical: 0,
  },
  filterIconBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterIconBtnActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  filterActiveDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  filterDropdown: {
    marginTop: 6,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadow.md,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  filterOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterOptionActive: {
    backgroundColor: colors.brandSoft,
  },
  filterOptionPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  filterOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterOptionTitle: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text,
  },
  filterOptionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  optionCountBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCountText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.textSecondary,
  },
});
