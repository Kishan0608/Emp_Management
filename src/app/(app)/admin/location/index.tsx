import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Avatar,
  Banner,
  Card,
  EmptyState,
  ListSkeleton,
  PageHeader,
  Pagination,
  Screen,
  TextField,
  usePaged,
} from '@/components/ui';
import { useLoad } from '@/hooks/useLoad';
import { usePolling } from '@/hooks/usePolling';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { formatAccuracy } from '@/lib/geo';
import type { LiveLocation, LocationDeviceStatus } from '@/lib/types';
import { useOrganization } from '@/providers/OrganizationProvider';
import { colors, fonts, radius, shadow, spacing } from '@/theme/tokens';

/** A fix newer than this counts as "live"; the phone sends roughly one a minute. */
const LIVE_WINDOW_MS = 5 * 60_000;
const REFRESH_MS = 30_000;

/** What the phone last said about itself, when that explains a gap in updates. */
const PHONE_PROBLEM: Partial<Record<LocationDeviceStatus, string>> = {
  services_off: 'GPS is turned off on their phone',
  permission_denied: 'Location permission removed on their phone',
  foreground_only: 'Only updates while SKFL is open ("Allow all the time" is off)',
};

const isLive = (p: LiveLocation) =>
  p.sharing_enabled && !!p.last_point && Date.now() - new Date(p.last_point.recorded_at).getTime() < LIVE_WINDOW_MS;

type FilterMode = 'all' | 'live' | 'offline';

export default function LiveLocations() {
  const { selectedOrg, selectedOrgId } = useOrganization();
  const live = useLoad(() => api.liveLocations(true), []);
  const setLive = live.setData;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  // Background refreshes do not write audit rows; only opening this screen does.
  const poll = useCallback(async () => {
    try {
      setLive(await api.liveLocations(false));
    } catch {
      // Keep the last good board on screen; the next tick tries again.
    }
  }, [setLive]);
  usePolling(poll, REFRESH_MS);

  const allRows = useMemo(
    () => (live.data ?? []).filter((p) => !selectedOrgId || !p.organization_id || p.organization_id === selectedOrgId),
    [live.data, selectedOrgId],
  );

  const onlineCount = useMemo(() => allRows.filter(isLive).length, [allRows]);
  const sharingCount = useMemo(() => allRows.filter((p) => p.sharing_enabled).length, [allRows]);

  const filteredRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return allRows.filter((p) => {
      const liveNow = isLive(p);
      if (filter === 'live' && !liveNow) return false;
      if (filter === 'offline' && liveNow) return false;
      if (!term) return true;
      return (
        p.full_name.toLowerCase().includes(term) ||
        (p.job_title ?? '').toLowerCase().includes(term) ||
        (p.department ?? '').toLowerCase().includes(term) ||
        (p.organization ?? '').toLowerCase().includes(term)
      );
    });
  }, [allRows, q, filter]);
  const paged = usePaged(filteredRows, [q, filter, selectedOrgId]);

  return (
    <Screen
      refreshing={live.refreshing}
      onRefresh={live.refresh}
      header={
        <PageHeader
          title="Live locations"
          subtitle={
            live.loading
              ? 'Loading…'
              : `${selectedOrg ? `${selectedOrg.name} · ` : ''}${onlineCount} live · ${sharingCount} sharing · ${allRows.length} ${allRows.length === 1 ? 'person' : 'people'}`
          }
        />
      }>
      <View style={styles.responsiveContainer}>
        {live.error && <Banner tone="danger">{live.error}</Banner>}

        {/* Search & Filter Controls */}
        {!live.loading && allRows.length > 0 && (
          <View style={styles.filterSection}>
            <TextField
              icon="search"
              placeholder="Search by name, role or department…"
              value={q}
              onChangeText={setQ}
              autoCapitalize="none"
              right={
                q.length > 0 ? (
                  <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Clear search">
                    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                  </Pressable>
                ) : undefined
              }
            />

            <View style={styles.chipsRow}>
              <Pressable
                onPress={() => setFilter('all')}
                style={[styles.chip, filter === 'all' && styles.chipActive]}>
                <Text style={[styles.chipText, filter === 'all' && styles.chipTextActive]}>
                  All
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setFilter('live')}
                style={[styles.chip, filter === 'live' && styles.chipActiveLive]}>
                <View style={[styles.filterDot, { backgroundColor: '#16A34A' }]} />
                <Text style={[styles.chipText, filter === 'live' && styles.chipTextActiveLive]}>
                  Live Now
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setFilter('offline')}
                style={[styles.chip, filter === 'offline' && styles.chipActive]}>
                <View style={[styles.filterDot, { backgroundColor: colors.textMuted }]} />
                <Text style={[styles.chipText, filter === 'offline' && styles.chipTextActive]}>
                  Offline
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {live.loading ? (
          <ListSkeleton rows={4} />
        ) : allRows.length === 0 ? (
          <Card>
            <EmptyState
              icon="location-outline"
              title="No location data"
              body="Nobody in this organization has switched on location sharing yet."
            />
          </Card>
        ) : filteredRows.length === 0 ? (
          <Card>
            <EmptyState
              icon="search-outline"
              title="No matching members"
              body={`No team members match "${q}" under the current filter.`}
            />
          </Card>
        ) : (
          <View style={styles.cardsGrid}>
            {paged.rows.map((p) => (
              <LocationRow
                key={p.user_id}
                person={p}
                onPress={() => router.push(`/admin/location/${p.user_id}` as Href)}
              />
            ))}
            <Pagination page={paged.page} total={paged.total} onChange={paged.setPage} />
          </View>
        )}
      </View>
    </Screen>
  );
}

function LocationRow({ person, onPress }: { person: LiveLocation; onPress: () => void }) {
  const last = person.last_point;
  const live = isLive(person);
  const sharingOff = !person.sharing_enabled;
  // A phone problem only matters while the person is still meant to be sharing.
  const problem = !sharingOff && person.device_status ? PHONE_PROBLEM[person.device_status] : undefined;

  return (
    <Card
      style={[
        styles.personCard,
        live && styles.personCardLive,
      ]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.personCardInner, pressed && { opacity: 0.88 }]}>
        
        {/* Person Header */}
        <View style={styles.topRow}>
          <View style={styles.avatarContainer}>
            <Avatar name={person.full_name} id={person.user_id} size={48} />
            <View
              style={[
                styles.avatarStatusBadge,
                live ? styles.avatarStatusLive : styles.avatarStatusOffline,
              ]}
            />
          </View>

          <View style={styles.infoCol}>
            <View style={styles.nameRow}>
              <Text style={styles.personName} numberOfLines={1}>
                {person.full_name}
              </Text>
            </View>
            <Text style={styles.personMeta} numberOfLines={1}>
              {[person.job_title, person.department].filter(Boolean).join(' · ') || 'Staff Member'}
            </Text>
          </View>

          {/* Status Badge */}
          {sharingOff ? (
            <View style={styles.seenBadge}>
              <Ionicons name="cloud-offline-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.seenBadgeText}>Offline</Text>
            </View>
          ) : live ? (
            <View style={styles.liveBadge}>
              <View style={styles.liveBeaconOuterSmall}>
                <View style={styles.liveBeaconInnerSmall} />
              </View>
              <Text style={styles.liveBadgeText}>Live</Text>
            </View>
          ) : (
            <View style={styles.seenBadge}>
              <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.seenBadgeText}>
                {last ? timeAgo(last.recorded_at) : 'No data'}
              </Text>
            </View>
          )}
        </View>

        {/* Sharing off: Offline, but the last position and today's route stay visible below. */}
        {sharingOff && (
          <View style={styles.noLocationBox}>
            <Ionicons name="eye-off-outline" size={18} color={colors.textMuted} />
            <Text style={styles.noLocationText}>
              {last ? `Location sharing is off · last seen ${timeAgo(last.recorded_at)}` : 'Location sharing is off'}
            </Text>
          </View>
        )}

        {/* Telemetry Block */}
        {last ? (
          <View style={styles.telemetryBox}>
            <View style={styles.coordsRow}>
              <View style={styles.coordItem}>
                <Ionicons name="navigate-circle" size={16} color={live ? '#16A34A' : colors.brand} />
                <Text style={styles.coordText}>
                  {last.latitude.toFixed(4)}, {last.longitude.toFixed(4)}
                </Text>
              </View>

              {last.accuracy_m != null && (
                <View style={styles.accuracyTag}>
                  <Text style={styles.accuracyText}>{formatAccuracy(last.accuracy_m)}</Text>
                </View>
              )}
            </View>

            <View style={styles.statsStrip}>
              <View style={styles.statPill}>
                <Ionicons name="trail-sign-outline" size={13} color={colors.textSecondary} />
                <Text style={styles.statPillText}>
                  {person.points_today} {person.points_today === 1 ? 'fix' : 'fixes'} today
                </Text>
              </View>

              {last.speed_mps != null && last.speed_mps > 0.6 && (
                <View style={styles.statPill}>
                  <Ionicons name="speedometer-outline" size={13} color={colors.brand} />
                  <Text style={styles.statPillText}>{Math.round(last.speed_mps * 3.6)} km/h</Text>
                </View>
              )}

              <View style={styles.viewTrailLink}>
                <Text style={styles.viewTrailText}>Trail</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.brand} />
              </View>
            </View>
          </View>
        ) : !sharingOff ? (
          <View style={styles.noLocationBox}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.textMuted} />
            <Text style={styles.noLocationText}>No GPS fix recorded yet today</Text>
          </View>
        ) : null}

        {/* Device Alert Warning (if GPS or permission issue) */}
        {problem && (
          <View style={styles.problemBox}>
            <Ionicons name="warning-outline" size={15} color="#DC2626" />
            <Text style={styles.problemText}>
              {problem} · reported {timeAgo(person.status_at)}
            </Text>
          </View>
        )}
      </Pressable>
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

  // Search & Filter
  filterSection: {
    gap: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.brandDeep,
    borderColor: colors.brandDeep,
  },
  chipActiveLive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  chipText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  chipTextActive: {
    fontFamily: fonts.semibold,
    color: colors.white,
  },
  chipTextActiveLive: {
    fontFamily: fonts.semibold,
    color: '#15803D',
  },
  filterDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },

  cardsGrid: {
    gap: spacing.sm,
  },

  // Person Card
  personCard: {
    padding: 0,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.sm,
  },
  personCardLive: {
    borderColor: '#86EFAC',
    backgroundColor: '#FCFDFB',
  },
  personCardInner: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarStatusBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2,
    borderColor: colors.white,
  },
  avatarStatusLive: {
    backgroundColor: '#16A34A',
  },
  avatarStatusOffline: {
    backgroundColor: colors.textMuted,
  },
  infoCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  personName: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
  },
  personMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },

  // Badges
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  liveBeaconOuterSmall: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#86EFAC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBeaconInnerSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  liveBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#15803D',
    letterSpacing: 0.2,
  },
  seenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  seenBadgeText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },

  // Telemetry Box
  telemetryBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  coordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coordText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.text,
    letterSpacing: 0.1,
  },
  accuracyTag: {
    backgroundColor: colors.white,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accuracyText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statPillText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  viewTrailLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  viewTrailText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.brand,
  },

  // No Location
  noLocationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  noLocationText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },

  // Problem Warning
  problemBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  problemText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#B91C1C',
    flex: 1,
  },
});
