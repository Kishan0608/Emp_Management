import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Banner, Button, Card, EmptyState, ListSkeleton, PageHeader, Screen } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { notificationHref, notificationIcon } from '@/lib/notificationLinks';
import type { NotificationRow } from '@/lib/types';
import { useMe } from '@/providers/AuthProvider';
import { useNotifications } from '@/providers/NotificationsProvider';
import { colors, radius, spacing, type } from '@/theme/tokens';

const target = notificationHref;
const icon = notificationIcon;

export default function Notifications() {
  const { me } = useMe();
  const { refresh: refreshUnread, lastArrival } = useNotifications();
  const list = useLoad(() => api.notifications(), [lastArrival]);
  const unread = (list.data ?? []).filter((n) => !n.is_read).length;

  const open = async (n: NotificationRow) => {
    if (!n.is_read) {
      list.setData((list.data ?? []).map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      api.markRead(n.id).then(refreshUnread).catch(() => {});
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
                  refreshUnread();
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
