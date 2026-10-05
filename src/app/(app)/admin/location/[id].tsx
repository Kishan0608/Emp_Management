import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Divider, EmptyState, ListSkeleton, PageHeader, Screen, SectionTitle } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { usePolling } from '@/hooks/usePolling';
import { api } from '@/lib/api';
import { dayKey, formatClockTime, formatDayLabel, shiftDay } from '@/lib/format';
import { detectStops, formatDistance, formatMinutes, mapsUrl, routeUrl, travelledMeters } from '@/lib/geo';
import { colors, spacing, type } from '@/theme/tokens';

const REFRESH_MS = 30_000;
/** Rows shown before "Show all"; a full day can hold several hundred updates. */
const LIST_LIMIT = 50;

const open = (url: string) => Linking.openURL(url).catch(() => {});

export default function LocationTrail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [date, setDate] = useState(() => dayKey());
  const [showAll, setShowAll] = useState(false);
  const isToday = date === dayKey();

  // Opening the trail is logged once; the 30-second refreshes below are not.
  const trail = useLoad(() => api.locationDay(id, date, true), [id, date]);
  const setTrail = trail.setData;

  const poll = useCallback(async () => {
    try {
      setTrail(await api.locationDay(id, date, false));
    } catch {
      // Keep the last good trail on screen.
    }
  }, [id, date, setTrail]);
  usePolling(poll, isToday ? REFRESH_MS : null);

  const points = useMemo(() => trail.data?.points ?? [], [trail.data]);
  const summary = useMemo(() => {
    const first = points[0];
    const last = points[points.length - 1];
    return {
      count: points.length,
      first: first?.recorded_at ?? null,
      last: last?.recorded_at ?? null,
      meters: travelledMeters(points),
    };
  }, [points]);
  const stops = useMemo(() => detectStops(points), [points]);
  const route = useMemo(() => routeUrl(points, stops), [points, stops]);
  const latest = points[points.length - 1];
  const newestFirst = useMemo(() => [...points].reverse(), [points]);
  const listed = showAll ? newestFirst : newestFirst.slice(0, LIST_LIMIT);

  return (
    <Screen
      refreshing={trail.refreshing}
      onRefresh={trail.refresh}
      header={<PageHeader title={trail.data?.person.full_name ?? 'Location trail'} subtitle={formatDayLabel(date)} />}>
      <View style={{ gap: spacing.lg }}>
        {trail.error && <Banner tone="danger">{trail.error}</Banner>}

        <View style={styles.dayRow}>
          <Pressable onPress={() => { setShowAll(false); setDate((d) => shiftDay(d, -1)); }} hitSlop={12} accessibilityLabel="Previous day">
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={type.h3}>{isToday ? 'Today' : formatDayLabel(date)}</Text>
          <Pressable
            onPress={() => { setShowAll(false); setDate((d) => shiftDay(d, 1)); }}
            disabled={isToday}
            hitSlop={12}
            accessibilityLabel="Next day"
            style={{ opacity: isToday ? 0.3 : 1 }}>
            <Ionicons name="chevron-forward" size={22} color={colors.text} />
          </Pressable>
        </View>

        {trail.data && !trail.data.person.sharing_enabled && (
          <Banner tone="warning" icon="alert-circle-outline">
            This person has switched location sharing off. Earlier history is kept until the retention period ends.
          </Banner>
        )}

        {trail.loading ? (
          <ListSkeleton rows={4} />
        ) : points.length === 0 ? (
          <Card>
            <EmptyState icon="location-outline" title="No locations this day" body="Nothing was received for this day." />
          </Card>
        ) : (
          <>
            <Card style={{ gap: spacing.sm }}>
              <Text style={type.small}>Latest position</Text>
              <Text style={type.bodyMedium}>
                {latest.latitude.toFixed(5)}, {latest.longitude.toFixed(5)}
              </Text>
              <Text style={type.small}>
                {formatClockTime(latest.recorded_at)}
                {latest.accuracy_m != null ? ` · ±${Math.round(latest.accuracy_m)} m` : ''}
              </Text>
              <Button
                title="Open in maps"
                icon="map-outline"
                variant="secondary"
                full
                onPress={() => open(mapsUrl(latest.latitude, latest.longitude))}
              />
              {route && <Button title="View day's route" icon="git-commit-outline" variant="secondary" full onPress={() => open(route)} />}
            </Card>

            <View style={styles.stats}>
              <Stat label="Distance travelled" value={formatDistance(summary.meters)} />
              <Stat label="Visits (10+ min)" value={String(stops.length)} />
              <Stat label="First seen" value={formatClockTime(summary.first)} />
              <Stat label="Last seen" value={formatClockTime(summary.last)} />
            </View>

            {stops.length > 0 && (
              <>
                <SectionTitle title="Visits" />
                <Card padded={false}>
                  {stops.map((st, i) => (
                    <View key={st.arrived_at}>
                      {i > 0 && <Divider inset={16} />}
                      <Pressable style={styles.pointRow} onPress={() => open(mapsUrl(st.latitude, st.longitude))} accessibilityLabel="Open visit in maps">
                        <Text style={[type.bodyMedium, { width: 74 }]}>{formatClockTime(st.arrived_at)}</Text>
                        <Text style={[type.small, { flex: 1 }]}>
                          Stayed {formatMinutes(st.minutes)} · left {formatClockTime(st.left_at)}
                        </Text>
                        <Ionicons name="map-outline" size={18} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  ))}
                </Card>
              </>
            )}

            <SectionTitle title={`Updates (${summary.count}), newest first`} />
            <Card padded={false}>
              {listed.map((p, i) => (
                <View key={p.recorded_at}>
                  {i > 0 && <Divider inset={16} />}
                  <View style={styles.pointRow}>
                    <Text style={[type.bodyMedium, { width: 74 }]}>{formatClockTime(p.recorded_at)}</Text>
                    <Text style={[type.small, { flex: 1 }]}>
                      {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                      {p.accuracy_m != null ? ` · ±${Math.round(p.accuracy_m)} m` : ''}
                      {p.speed_mps != null ? ` · ${Math.round(p.speed_mps * 3.6)} km/h` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
            {!showAll && newestFirst.length > LIST_LIMIT && (
              <Button title={`Show all ${newestFirst.length} updates`} variant="secondary" full onPress={() => setShowAll(true)} />
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: { flexBasis: '46%', flexGrow: 1, gap: 2 },
  statValue: { ...type.h3 },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: 16, paddingVertical: 12 },
});
