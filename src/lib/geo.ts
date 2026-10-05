import type { LocationPoint } from './types';

const EARTH_RADIUS_M = 6_371_000;

type Coords = Pick<LocationPoint, 'latitude' | 'longitude'>;

/** Great-circle distance between two fixes, in metres (haversine). */
export function distanceMeters(a: Coords, b: Coords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Fixes vaguer than this are left out of distance and stops. */
const TRAIL_ACCURACY_M = 100;
/** Moves shorter than this are GPS wobble, not travel. */
const MIN_MOVE_M = 30;

/**
 * Distance travelled, in metres. Ignores vague fixes and counts movement only once the
 * person is MIN_MOVE_M from the last counted spot, so sitting still for an hour adds nothing.
 */
export function travelledMeters(points: LocationPoint[]): number {
  let total = 0;
  let anchor: LocationPoint | null = null;
  for (const p of points) {
    if (p.accuracy_m != null && p.accuracy_m > TRAIL_ACCURACY_M) continue;
    if (!anchor) {
      anchor = p;
      continue;
    }
    const d = distanceMeters(anchor, p);
    if (d >= MIN_MOVE_M) {
      total += d;
      anchor = p;
    }
  }
  return total;
}

export interface Stop {
  latitude: number;
  longitude: number;
  arrived_at: string;
  left_at: string;
  minutes: number;
}

/**
 * Places the person stayed within `radiusM` for at least `minMinutes` — on a sales
 * route, these are usually customer visits. Points must be in time order.
 */
export function detectStops(points: LocationPoint[], radiusM = 120, minMinutes = 10): Stop[] {
  const good = points.filter((p) => p.accuracy_m == null || p.accuracy_m <= TRAIL_ACCURACY_M);
  const stops: Stop[] = [];
  let i = 0;
  while (i < good.length) {
    let lat = good[i].latitude;
    let lng = good[i].longitude;
    let j = i + 1;
    // Grow the cluster while each new fix stays near its running centre.
    while (j < good.length && distanceMeters({ latitude: lat, longitude: lng }, good[j]) <= radiusM) {
      const n = j - i + 1;
      lat += (good[j].latitude - lat) / n;
      lng += (good[j].longitude - lng) / n;
      j++;
    }
    const first = good[i];
    const last = good[j - 1];
    const minutes = (new Date(last.recorded_at).getTime() - new Date(first.recorded_at).getTime()) / 60_000;
    if (minutes >= minMinutes) {
      stops.push({ latitude: lat, longitude: lng, arrived_at: first.recorded_at, left_at: last.recorded_at, minutes: Math.round(minutes) });
    }
    i = j;
  }
  return stops;
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const ll = (c: Coords) => `${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`;

/** Opens one spot in the phone's maps app. Only the coordinates go to the maps provider. */
export function mapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

/** Google Maps allows few waypoints in a link, so the day's route is drawn through at most this many. */
const MAX_WAYPOINTS = 8;

/**
 * The day's route in Google Maps: start → visits → latest spot. Uses the detected stops as
 * waypoints when there are any, otherwise evenly spaced fixes.
 */
export function routeUrl(points: LocationPoint[], stops: Stop[]): string | null {
  if (points.length < 2) return null;
  const origin = points[0];
  const destination = points[points.length - 1];
  let middle: Coords[] = stops.length > 0 ? stops : points.slice(1, -1);
  if (middle.length > MAX_WAYPOINTS) {
    const step = middle.length / MAX_WAYPOINTS;
    middle = Array.from({ length: MAX_WAYPOINTS }, (_, k) => middle[Math.floor(k * step)]);
  }
  const waypoints = middle.length ? `&waypoints=${middle.map(ll).join('%7C')}` : '';
  return `https://www.google.com/maps/dir/?api=1&origin=${ll(origin)}&destination=${ll(destination)}${waypoints}&travelmode=driving`;
}
