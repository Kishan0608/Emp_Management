import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from './api';
import type { Organization } from './types';

/**
 * Small cache for the public "pick your company" list shown on the sign-up form.
 * That screen used to fetch the list itself on mount, so every visit paid the
 * full network round trip (slower still if the backend had gone idle). Priming
 * this from the sign-in screen means the list is usually already on hand by the
 * time someone taps through to sign-up, and a disk cache makes the very first
 * paint instant even before that network call lands.
 */

const STORAGE_KEY = 'skfl.organizations.cache.v1';

let memoryCache: Organization[] | null = null;
let diskRead: Promise<Organization[] | null> | null = null;
let inFlight: Promise<Organization[]> | null = null;

function readDiskCache(): Promise<Organization[] | null> {
  if (!diskRead) {
    diskRead = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as Organization[]) : null;
      })
      .catch(() => null);
  }
  return diskRead;
}

/** Starts (or reuses) the network fetch; safe to call from several places at once. */
export function primeOrganizations(): Promise<Organization[]> {
  if (!inFlight) {
    inFlight = api
      .organizations()
      .then((list) => {
        memoryCache = list;
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list)).catch(() => {});
        return list;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** What we already know, with nothing awaited — for an instant first paint. */
export function peekOrganizations(): Organization[] | null {
  return memoryCache;
}

/**
 * Resolves as fast as possible: memory, then the on-disk cache, then the network.
 * Always kicks off a background network refresh too, so the list stays current.
 */
export async function loadOrganizationsFast(): Promise<Organization[]> {
  if (memoryCache) {
    primeOrganizations().catch(() => {});
    return memoryCache;
  }
  const network = primeOrganizations();
  const disk = await readDiskCache();
  if (disk && disk.length > 0 && !memoryCache) return disk;
  return network;
}
