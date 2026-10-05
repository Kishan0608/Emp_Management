import { router, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Badge, Banner, Card, EmptyState, ListSkeleton, PageHeader, Screen, SectionTitle } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { usePolling } from '@/hooks/usePolling';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { LiveLocation, LocationDeviceStatus } from '@/lib/types';
import { useOrganization } from '@/providers/OrganizationProvider';
import { colors, spacing, type } from '@/theme/tokens';

/** A fix newer than this counts as "live"; the phone sends roughly one a minute. */
const LIVE_WINDOW_MS = 5 * 60_000;
const REFRESH_MS = 30_000;

/** What the phone last said about itself, when that explains a gap in updates. */
const PHONE_PROBLEM: Partial<Record<LocationDeviceStatus, string>> = {
  services_off: 'GPS is turned off on their phone',
  permission_denied: 'Location permission removed on their phone',
  foreground_only: 'Only updates while SKFL is open ("Allow all the time" is off)',
};

const isLive = (p: LiveLocation) => !!p.last_point && Date.now() - new Date(p.last_point.recorded_at).getTime() < LIVE_WINDOW_MS;

export default function LiveLocations() {
  const { selectedOrgId } = useOrganization();
  const live = useLoad(() => api.liveLocations(true), []);
  const setLive = live.setData;

  // Background refreshes do not write audit rows; only opening this screen does.
  const poll = useCallback(async () => {
    try {
      setLive(await api.liveLocations(false));
    } catch {
      // Keep the last good board on screen; the next tick tries again.
    }
  }, [setLive]);
  usePolling(poll, REFRESH_MS);

  const rows = useMemo(
    () => (live.data ?? []).filter((p) => !selectedOrgId || !p.organization_id || p.organization_id === selectedOrgId),
    [live.data, selectedOrgId],
  );
  const onlineCount = rows.filter(isLive).length;

  return (
    <Screen
      refreshing={live.refreshing}
      onRefresh={live.refresh}
      header={
        <PageHeader
          title="Live locations"
          subtitle={live.loading ? 'Loading…' : `${rows.length} sharing · ${onlineCount} live now`}
        />
      }>
      <View style={{ gap: spacing.lg }}>
        {live.error && <Banner tone="danger">{live.error}</Banner>}

        {live.loading ? (
          <ListSkeleton rows={4} />
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState icon="location-outline" title="No one is sharing" body="Nobody you can track has switched on location sharing." />
          </Card>
        ) : (
          <>
            <SectionTitle title="People" />
            {rows.map((p) => (
              <LocationRow key={p.user_id} person={p} onPress={() => router.push(`/admin/location/${p.user_id}` as Href)} />
            ))}
          </>
        )}
      </View>
    </Screen>
  );
}

function LocationRow({ person, onPress }: { person: LiveLocation; onPress: () => void }) {
  const last = person.last_point;
  const live = isLive(person);
  const problem = person.device_status ? PHONE_PROBLEM[person.device_status] : undefined;
  return (
    <Card onPress={onPress} style={{ gap: spacing.sm }}>
      <View style={styles.top}>
        <Avatar name={person.full_name} id={person.user_id} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.bodyMedium}>{person.full_name}</Text>
          <Text style={type.small} numberOfLines={1}>
            {[person.job_title, person.department].filter(Boolean).join(' · ') || '—'}
          </Text>
        </View>
        <Badge label={live ? 'Live' : `Seen ${timeAgo(last?.recorded_at)}`} tone={live ? 'success' : 'neutral'} />
      </View>
      {last ? (
        <Text style={styles.coords}>
          {last.latitude.toFixed(4)}, {last.longitude.toFixed(4)}
          {last.accuracy_m != null ? ` · ±${Math.round(last.accuracy_m)} m` : ''}
          {` · ${person.points_today} today`}
        </Text>
      ) : (
        <Text style={type.small}>No location received yet</Text>
      )}
      {problem && (
        <Text style={styles.problem}>
          {problem} · reported {timeAgo(person.status_at)}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  coords: { ...type.small, color: colors.textSecondary },
  problem: { ...type.small, color: colors.danger },
});
