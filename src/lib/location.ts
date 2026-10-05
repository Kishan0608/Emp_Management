import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { api, errorMessage } from './api';
import { distanceMeters } from './geo';
import { supabase } from './supabase';
import type { LocationDeviceStatus, LocationPoint } from './types';

/**
 * Phone side of location sharing.
 *
 * The task is defined when this module loads. index.js imports it before Expo Router,
 * so the OS can deliver fixes even when it starts the app in the background with no
 * screens. Fixes are queued on the phone first, so a weak connection delays them
 * instead of losing them.
 */

export const LOCATION_TASK = 'skfl-location-tracking';
const NATIVE = Platform.OS !== 'web';
/** About eight hours at one fix a minute. Older fixes are dropped if the phone stays offline that long. */
const MAX_QUEUE = 500;
const UPLOAD_BATCH = 200;
const SHARING_OFF = 'Location sharing is off';
/** Keep a fix when this much time has passed since the last kept one... */
const KEEP_EVERY_MS = 50_000;
/** ...or when the person has moved this far. iOS ignores timeInterval, so without this it sends a fix every second. */
const KEEP_EVERY_M = 100;
/** Fixes vaguer than this (cell-tower guesses) are useless for a trail. */
const MAX_ACCURACY_M = 500;

export type LocationAccess = { foreground: boolean; background: boolean };

// ---------- per-user storage: fixes from one account can never be sent under another ----------
const queueKey = (userId: string) => `skfl.location.queue.${userId}`;
const lastKeptKey = (userId: string) => `skfl.location.last.${userId}`;

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the next fix will try again.
  }
}

/** Runs async jobs one at a time, so overlapping callers never interleave. */
function makeSerial() {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };
}
const uploads = makeSerial();
const control = makeSerial();

// ---------- thinning ----------
async function thin(userId: string, points: LocationPoint[]): Promise<LocationPoint[]> {
  let last = await readJson<LocationPoint | null>(lastKeptKey(userId), null);
  const kept: LocationPoint[] = [];
  for (const p of points) {
    if (p.accuracy_m != null && p.accuracy_m > MAX_ACCURACY_M) continue;
    const t = new Date(p.recorded_at).getTime();
    const lastT = last ? new Date(last.recorded_at).getTime() : 0;
    if (!last || t - lastT >= KEEP_EVERY_MS || distanceMeters(last, p) >= KEEP_EVERY_M) {
      kept.push(p);
      last = p;
    }
  }
  if (kept.length) await writeJson(lastKeptKey(userId), last);
  return kept;
}

// ---------- upload ----------
async function uploadQueued(userId: string, incoming: LocationPoint[]): Promise<void> {
  let remaining = [...(await readJson<LocationPoint[]>(queueKey(userId), [])), ...incoming];
  try {
    while (remaining.length > 0) {
      await api.recordLocationPoints(remaining.slice(0, UPLOAD_BATCH));
      remaining = remaining.slice(UPLOAD_BATCH);
    }
  } catch (e) {
    if (errorMessage(e).includes(SHARING_OFF)) {
      // Sharing was switched off for this account (e.g. from another phone): stop and forget.
      await stopLocationTracking();
      await writeJson(queueKey(userId), []);
      return;
    }
    // Offline or server error: keep what has not been accepted yet and retry on the next fix.
  }
  await writeJson(queueKey(userId), remaining.slice(-MAX_QUEUE));
}

function toPoint(l: Location.LocationObject): LocationPoint {
  return {
    recorded_at: new Date(l.timestamp).toISOString(),
    latitude: l.coords.latitude,
    longitude: l.coords.longitude,
    accuracy_m: l.coords.accuracy,
    speed_mps: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
  };
}

if (NATIVE) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    // No signed-in session means the fixes belong to nobody who can send them: drop them.
    const userId = await currentUserId();
    if (!userId) return;
    // Mock-location fixes (fake GPS apps) are dropped rather than shared.
    const raw = data.locations
      .filter((l) => !l.mocked)
      .map(toPoint)
      .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
    await uploads(async () => {
      const points = await thin(userId, raw);
      if (points.length > 0) await uploadQueued(userId, points);
    });
  });
}

// ---------- permissions & phone state ----------
export async function getLocationAccess(): Promise<LocationAccess> {
  if (!NATIVE) return { foreground: false, background: false };
  const [fg, bg] = await Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync()]);
  return { foreground: fg.status === 'granted', background: bg.status === 'granted' };
}

/** Asks for "while using" first, then "all the time". Background access is what keeps the trail going with the app closed. */
export async function requestLocationAccess(): Promise<'granted' | 'foreground_denied' | 'background_denied'> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'foreground_denied';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted' ? 'granted' : 'background_denied';
}

export async function getDeviceStatus(): Promise<LocationDeviceStatus> {
  const access = await getLocationAccess();
  if (!access.foreground) return 'permission_denied';
  if (!(await Location.hasServicesEnabledAsync())) return 'services_off';
  return access.background ? 'ok' : 'foreground_only';
}

// ---------- start / stop ----------
async function startNow(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 60_000, // Android: about one fix a minute, so a stationary person still shows as live
    distanceInterval: 0,
    // iOS: deliver in batches while in the background to save battery (thinned to ~1/min above).
    deferredUpdatesInterval: 60_000,
    activityType: Location.LocationActivityType.Other,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'SKFL is sharing your location',
      notificationBody: 'Your manager can see where you are. Turn this off in Settings.',
      notificationColor: '#7D6E22',
    },
  });
}

async function stopNow(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

export function startLocationTracking(): Promise<void> {
  return NATIVE ? control(startNow) : Promise.resolve();
}

export function stopLocationTracking(): Promise<void> {
  return NATIVE ? control(stopNow) : Promise.resolve();
}

/**
 * Makes the phone match the saved setting and tells the server the phone's state,
 * so a manager can see "GPS off" instead of just a stale time.
 */
export function syncLocationTracking(enabled: boolean): Promise<void> {
  if (!NATIVE) return Promise.resolve();
  return control(async () => {
    if (!enabled) return stopNow();
    const status = await getDeviceStatus();
    api.reportLocationStatus(status).catch(() => {});
    if (status === 'ok') await startNow();
    else if (status === 'permission_denied' || status === 'foreground_only') await stopNow();
    // services_off: keep the task registered; it resumes by itself when GPS comes back on.
  });
}
