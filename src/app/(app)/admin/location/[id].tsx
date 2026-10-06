import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Divider, EmptyState, ListSkeleton, PageHeader, Screen, SectionTitle } from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { usePolling } from '@/hooks/usePolling';
import { api } from '@/lib/api';
import { dayKey, formatClockTime, formatDayLabel, shiftDay } from '@/lib/format';
import { detectStops, formatAccuracy, formatDistance, formatMinutes, mapsUrl, routeUrl, travelledMeters } from '@/lib/geo';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

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
      <View style={styles.responsiveContainer}>
        {trail.error && <Banner tone="danger">{trail.error}</Banner>}

        <Card style={styles.dayCard}>
          <Pressable
            onPress={() => { setShowAll(false); setDate((d) => shiftDay(d, -1)); }}
            hitSlop={12}
            accessibilityLabel="Previous day"
            style={({ pressed }) => [styles.dayBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.dayInfo}>
            <Ionicons name="calendar-outline" size={16} color={colors.brand} />
            <Text style={styles.dayTitle}>{isToday ? 'Today' : formatDayLabel(date)}</Text>
            {isToday && (
              <View style={styles.todayBadge}>
                <Text style={styles.todayBadgeText}>Active</Text>
              </View>
            )}
          </View>
          <Pressable
            onPress={() => { setShowAll(false); setDate((d) => shiftDay(d, 1)); }}
            disabled={isToday}
            hitSlop={12}
            accessibilityLabel="Next day"
            style={({ pressed }) => [styles.dayBtn, isToday ? { opacity: 0.25 } : pressed && { opacity: 0.7 }]}>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        </Card>

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
            {/* Latest Position Card */}
            <Card style={styles.latestCard}>
              <View style={styles.latestHeader}>
                <View style={styles.latestIconWrap}>
                  <Ionicons name="navigate" size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.latestHeading}>Latest Position</Text>
                  <Text style={type.small}>
                    Recorded at {formatClockTime(latest.recorded_at)}
                    {latest.accuracy_m != null ? ` · ${formatAccuracy(latest.accuracy_m)}` : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.latestCoordBox}>
                <Text style={styles.coordNumbers}>
                  {latest.latitude.toFixed(5)}, {latest.longitude.toFixed(5)}
                </Text>
              </View>

              <View style={styles.actionBtnsRow}>
                <Button
                  title="Open in Maps"
                  icon="map-outline"
                  variant="primary"
                  style={{ flex: 1 }}
                  onPress={() => open(mapsUrl(latest.latitude, latest.longitude))}
                />
                {route && (
                  <Button
                    title="Day's Route"
                    icon="git-commit-outline"
                    variant="outline"
                    style={{ flex: 1 }}
                    onPress={() => open(route)}
                  />
                )}
              </View>
            </Card>

            {/* Day Telemetry Stats */}
            <View style={styles.statsGrid}>
              <StatItem
                icon="speedometer-outline"
                label="Distance travelled"
                value={formatDistance(summary.meters)}
                color={colors.brand}
              />
              <StatItem
                icon="business-outline"
                label="Visits (10+ min)"
                value={String(stops.length)}
                color="#2563EB"
              />
              <StatItem
                icon="time-outline"
                label="First fix seen"
                value={formatClockTime(summary.first)}
                color="#0D9488"
              />
              <StatItem
                icon="checkmark-done-outline"
                label="Last fix seen"
                value={formatClockTime(summary.last)}
                color="#16A34A"
              />
            </View>

            {stops.length > 0 && (
              <>
                <SectionTitle title={`Visits & Stops (${stops.length})`} />
                <Card padded={false} style={styles.timelineCard}>
                  {stops.map((st, i) => (
                    <View key={st.arrived_at}>
                      {i > 0 && <Divider inset={16} />}
                      <Pressable
                        style={({ pressed }) => [styles.pointRow, pressed && { backgroundColor: colors.surfaceAlt }]}
                        onPress={() => open(mapsUrl(st.latitude, st.longitude))}
                        accessibilityLabel="Open visit in maps">
                        <View style={styles.timeTag}>
                          <Text style={styles.timeTagText}>{formatClockTime(st.arrived_at)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[type.bodyMedium, { fontFamily: fonts.semibold, fontSize: 14 }]}>
                            Stayed {formatMinutes(st.minutes)}
                          </Text>
                          <Text style={type.small}>Departed at {formatClockTime(st.left_at)}</Text>
                        </View>
                        <Ionicons name="map-outline" size={18} color={colors.brand} />
                      </Pressable>
                    </View>
                  ))}
                </Card>
              </>
            )}

            <SectionTitle title={`All Updates (${summary.count}), newest first`} />
            <Card padded={false} style={styles.timelineCard}>
              {listed.map((p, i) => (
                <View key={p.recorded_at}>
                  {i > 0 && <Divider inset={16} />}
                  <View style={styles.pointRow}>
                    <View style={styles.timeTag}>
                      <Text style={styles.timeTagText}>{formatClockTime(p.recorded_at)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.bodyMedium, { fontSize: 13, fontFamily: fonts.medium }]}>
                        {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                      </Text>
                      <Text style={type.small}>
                        {formatAccuracy(p.accuracy_m)}
                        {p.speed_mps != null && p.speed_mps > 0.5 ? ` · ${Math.round(p.speed_mps * 3.6)} km/h` : ''}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </Card>

            {!showAll && newestFirst.length > LIST_LIMIT && (
              <Button
                title={`Show all ${newestFirst.length} updates`}
                variant="secondary"
                full
                onPress={() => setShowAll(true)}
              />
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

function StatItem({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string }) {
  return (
    <Card style={styles.statTile}>
      <View style={styles.statTileHeader}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={styles.statTileValue}>{value}</Text>
      </View>
      <Text style={type.small}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  responsiveContainer: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    gap: spacing.lg,
  },

  // Day Card
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  dayBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dayTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
  },
  todayBadge: {
    backgroundColor: '#DCFCE7',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
  },
  todayBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: '#15803D',
  },

  // Latest Position Card
  latestCard: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  latestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  latestIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  latestHeading: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
  },
  latestCoordBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  coordNumbers: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
    letterSpacing: 0.5,
  },
  actionBtnsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statTile: {
    flex: 1,
    minWidth: 140,
    padding: spacing.md,
    gap: 4,
  },
  statTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statTileValue: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.text,
  },

  // Timeline & Point Row
  timelineCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  timeTag: {
    backgroundColor: colors.surfaceAlt,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeTagText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
