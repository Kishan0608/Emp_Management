import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Banner, Button, Card, EmptyState, ListSkeleton, PageHeader, Screen } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { NotificationRow } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { colors, radius, spacing, type } from '@/theme/tokens';

function target(n: NotificationRow): Href | null {
  if (!n.ref_id) return null;
  switch (n.ref_table) {
    case 'tasks':
      return `/task/${n.ref_id}`;
    case 'feedback_items':
      return `/feedback/${n.ref_id}`;
    case 'disciplinary_cases':
      return `/case/${n.ref_id}`;
    case 'confidential_reports':
      return '/complaints';
    case 'users':
      return n.kind === 'complaint_flag' ? '/complaints' : `/people/${n.ref_id}`;
    default:
      return null;
  }
}

function icon(kind: string): { name: keyof typeof Ionicons.glyphMap; color: string; bg: string } {
  if (kind.startsWith('task')) return { name: 'checkbox', color: colors.task, bg: colors.taskSoft };
  if (kind.includes('blocker')) return { name: 'hand-left', color: colors.danger, bg: colors.dangerSoft };
  if (kind.startsWith('feedback')) return { name: 'chatbubbles', color: colors.feedback, bg: colors.feedbackSoft };
  if (kind.startsWith('case') || kind.startsWith('complaint') || kind.startsWith('confidential')) return { name: 'shield', color: colors.complaint, bg: colors.complaintSoft };
  return { name: 'notifications', color: colors.brand, bg: colors.brandSoft };
}

export default function Notifications() {
  const { me } = useMe();
  const list = useLoad(() => api.notifications());
  const unread = (list.data ?? []).filter((n) => !n.is_read).length;

  const open = async (n: NotificationRow) => {
    if (!n.is_read) {
      list.setData((list.data ?? []).map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      api.markRead(n.id).catch(() => {});
    }
    const href = target(n);
    if (href) router.push(href);
  };

  return (
    <Screen
      refreshing={list.refreshing}
      onRefresh={list.refresh}
      header={
        <PageHeader
          title="Notifications"
          subtitle={unread ? `${unread} unread` : 'All caught up'}
          right={
            unread > 0 ? (
              <Button
                title="Mark all read"
                size="sm"
                variant="secondary"
                onPress={async () => {
                  await api.markAllRead(me.id);
                  list.reload();
                }}
              />
            ) : undefined
          }
        />
      }>
      {list.error && <Banner tone="danger">{list.error}</Banner>}
      {list.loading ? (
        <ListSkeleton rows={5} />
      ) : (list.data ?? []).length === 0 ? (
        <Card>
          <EmptyState icon="notifications-off-outline" title="No notifications" body="You'll see task assignments, replies and escalations here." />
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {(list.data ?? []).map((n, i) => {
            const ic = icon(n.kind);
            return (
              <Animated.View key={n.id} entering={FadeInDown.delay(Math.min(i, 10) * 30)}>
                <Pressable onPress={() => open(n)} style={({ pressed }) => [styles.row, !n.is_read && styles.unread, pressed && { opacity: 0.8 }]}>
                  <View style={[styles.icon, { backgroundColor: ic.bg }]}>
                    <Ionicons name={ic.name} size={18} color={ic.color} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={type.bodyMedium} numberOfLines={1}>
                      {n.title}
                    </Text>
                    {n.body && (
                      <Text style={type.small} numberOfLines={2}>
                        {n.body}
                      </Text>
                    )}
                    <Text style={[type.small, { fontSize: 12, color: colors.textMuted }]}>{timeAgo(n.created_at)}</Text>
                  </View>
                  {!n.is_read && <View style={styles.dot} />}
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unread: { backgroundColor: '#FFFBF0', borderColor: colors.brandTint },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },
});
