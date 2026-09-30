import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { notificationHref, notificationIcon } from '@/lib/notificationLinks';
import { listenForPushTaps } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import type { NotificationRow } from '@/lib/types';
import { colors, fonts, radius, shadow, spacing } from '@/theme/tokens';

import { useAuth } from './AuthProvider';

interface NotificationsValue {
  /** Unread count, updated live. */
  unread: number;
  /** Changes every time a new notification arrives (use as a reload dependency). */
  lastArrival: number;
  refresh: () => void;
}

const Ctx = createContext<NotificationsValue>({ unread: 0, lastArrival: 0, refresh: () => {} });

/**
 * Real-time notifications for the signed-in person:
 *  - live stream of new rows (Supabase Realtime, RLS: own rows only)
 *  - slide-down in-app banner while the app is open (tap to open the item)
 *  - live unread badge
 *  - tapping a phone push notification opens the right screen
 * Phone pushes themselves are sent by the database (Expo push service -> FCM / APNs).
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { ctx, locked } = useAuth();
  const userId = ctx?.user.id;
  const [unread, setUnread] = useState(0);
  const [lastArrival, setLastArrival] = useState(0);
  const [banner, setBanner] = useState<NotificationRow | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (!userId) return;
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
      .then(({ count }) => setUnread(count ?? 0));
  }, [userId]);

  // Initial count + live stream.
  useEffect(() => {
    if (!userId) return;
    refresh();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new as NotificationRow;
        setUnread((u) => u + 1);
        setLastArrival(Date.now());
        setBanner(n);
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setBanner(null), 5000);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [userId, refresh]);

  // Phone push tapped (app in background or closed) -> open the item.
  useEffect(() => {
    if (!userId) return;
    let remove: (() => void) | undefined;
    listenForPushTaps((data) => {
      const href = notificationHref({ kind: String(data.kind ?? ''), ref_table: (data.ref_table as string) ?? null, ref_id: (data.ref_id as string) ?? null });
      if (href) setTimeout(() => router.push(href), 300);
    }).then((fn) => (remove = fn));
    return () => remove?.();
  }, [userId]);

  const openBanner = () => {
    if (!banner) return;
    const href = notificationHref(banner);
    setBanner(null);
    supabase.from('notifications').update({ is_read: true }).eq('id', banner.id).then(() => refresh());
    if (href) router.push(href);
  };

  return (
    <Ctx.Provider value={{ unread, lastArrival, refresh }}>
      {children}
      {banner && !locked && <LiveBanner n={banner} onPress={openBanner} onClose={() => setBanner(null)} />}
    </Ctx.Provider>
  );
}

export const useNotifications = () => useContext(Ctx);

function LiveBanner({ n, onPress, onClose }: { n: NotificationRow; onPress: () => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const ic = notificationIcon(n.kind);
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing.sm }]}>
      <Animated.View key={n.id} entering={SlideInUp.springify().damping(18)} exiting={SlideOutUp.duration(220)} style={styles.bannerWrap}>
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${n.title}. Open`} style={({ pressed }) => [styles.banner, pressed && { opacity: 0.92 }]}>
          <View style={[styles.icon, { backgroundColor: ic.bg }]}>
            <Ionicons name={ic.name} size={20} color={ic.color} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.title} numberOfLines={1}>
              {n.title}
            </Text>
            {!!n.body && (
              <Text style={styles.body} numberOfLines={2}>
                {n.body}
              </Text>
            )}
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Dismiss">
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: spacing.md, zIndex: 800 },
  bannerWrap: { width: '100%', maxWidth: 560 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.gold,
    ...shadow.lg,
  },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
});
