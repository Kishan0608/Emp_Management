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

export type FeedbackScope = 'inbox' | 'mine' | 'blockers' | 'all';

export default function Feedback() {
  const { me, isEmployee, isBoss } = useMe();
  const { selectedOrgId } = useOrganization();
  const isStaff = !isEmployee;
  const params = useLocalSearchParams<{ scope?: FeedbackScope; category?: string }>();
  const [scope, setScope] = useState<FeedbackScope>(params.scope ?? (isStaff ? 'all' : 'inbox'));
  const [category, setCategory] = useState<string>(params.category ?? 'all');
  const [q, setQ] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  // Follow deep links like /feedback?scope=blockers or /feedback?category=leave
  const [lastParam, setLastParam] = useState(params.scope);
  if (params.scope !== lastParam) {
    setLastParam(params.scope);
    if (params.scope) setScope(params.scope);
  }

  const [lastCatParam, setLastCatParam] = useState(params.category);
  if (params.category !== lastCatParam) {
    setLastCatParam(params.category);
    if (params.category) {
      setCategory(params.category);
      if (!params.scope && params.category !== 'blockers' && isStaff) {
        setScope('all');
      }
    }
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
    return (data ?? []).filter((f) => {
      if (category === 'leave') {
        const isLeave = f.title.startsWith('[Leave]') || f.title.toLowerCase().startsWith('[leave]') || f.title.toLowerCase().includes('leave');
        if (!isLeave) return false;
      } else if (category === 'general_question' || category === 'question') {
        const isQ = f.title.startsWith('[General Question]') || f.title.toLowerCase().startsWith('[general') || f.type === 'question';
        if (!isQ) return false;
      } else if (category === 'feedback') {
        const isF = f.type === 'feedback' && !f.title.toLowerCase().includes('leave');
        if (!isF) return false;
      } else if (category === 'blockers' || category === 'blocker') {
        if (f.type !== 'blocker') return false;
      }

      if (!term) return true;
      return (
        f.title.toLowerCase().includes(term) ||
        f.body.toLowerCase().includes(term) ||
        (f.author?.full_name?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [data, q, category]);

  const filters: {
    value: string;
    label: string;
    sublabel: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
  }[] = [
    { value: 'all', label: 'All', sublabel: 'Every post', icon: 'grid-outline', color: colors.brand },
    { value: 'leave', label: 'Leave', sublabel: 'Time-off requests', icon: 'calendar-outline', color: colors.warning },
    { value: 'general_question', label: 'Q & A', sublabel: 'Questions and answers', icon: 'help-circle-outline', color: colors.info },
    { value: 'feedback', label: 'Feedback', sublabel: 'Suggestions and ideas', icon: 'chatbubbles-outline', color: colors.feedback },
    { value: 'blocker', label: 'Blocker', sublabel: 'Urgent work blockers', icon: 'hand-left-outline', color: colors.danger },
  ];

  const searchPlaceholder =
    scope === 'inbox'
      ? 'Search inbox…'
      : scope === 'all'
        ? 'Search all submissions…'
        : scope === 'mine'
          ? 'Search my submissions…'
          : 'Search blockers…';

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
                {category !== 'all' && <View style={styles.filterActiveDot} />}
              </Pressable>
            </View>

            {/* ATTACHED DROPDOWN LIST */}
            {filterOpen && (
              <View style={styles.filterDropdown}>
                {filters.map((f, idx) => {
                  const active = f.value === category;
                  return (
                    <Pressable
                      key={f.value}
                      onPress={() => {
                        setCategory(f.value);
                        setFilterOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.filterOption,
                        active && styles.filterOptionActive,
                        pressed && styles.filterOptionPressed,
                        idx < filters.length - 1 && styles.filterOptionBorder,
                      ]}>
                      <View style={[styles.filterOptionIcon, { backgroundColor: active ? f.color + '20' : colors.surfaceAlt }]}>
                        <Ionicons name={f.icon} size={18} color={active ? f.color : colors.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.filterOptionTitle, active && { color: f.color, fontFamily: fonts.bold }]}>
                          {f.label}
                        </Text>
                        <Text style={styles.filterOptionSubtitle}>{f.sublabel}</Text>
                      </View>
                      {active && <Ionicons name="checkmark-circle" size={18} color={f.color} />}
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
                  category === 'leave'
                    ? 'calendar-outline'
                    : category === 'general_question' || category === 'question'
                      ? 'help-circle-outline'
                      : category === 'feedback'
                        ? 'chatbubbles-outline'
                        : scope === 'blockers'
                          ? 'shield-checkmark-outline'
                          : scope === 'mine'
                            ? 'create-outline'
                            : 'mail-unread-outline'
                }
                title={
                  category === 'leave'
                    ? 'No leave requests'
                    : category === 'general_question' || category === 'question'
                      ? 'No general questions'
                      : category === 'feedback'
                        ? 'No feedback entries'
                        : scope === 'blockers'
                          ? 'No open blockers'
                          : scope === 'mine'
                            ? 'No submissions yet'
                            : 'No feedback in your inbox'
                }
                body={
                  category === 'leave'
                    ? 'Time-off and vacation requests submitted by employees appear here.'
                    : category === 'general_question' || category === 'question'
                      ? 'General company inquiries and workplace questions appear here.'
                      : category === 'feedback'
                        ? 'Suggestions and ideas shared by employees appear here.'
                        : scope === 'mine'
                          ? 'Ask a question, share feedback, or report what is stopping your work.'
                          : scope === 'blockers'
                            ? 'There are currently no active blockers stopping work.'
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
});
