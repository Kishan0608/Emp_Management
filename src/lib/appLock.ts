import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { AppLockType } from './types';

/**
 * App lock security suite:
 * 1. 4-digit Passcode (PIN)
 * 2. 3x3 Pattern Lock
 * 3. Biometrics (Fingerprint / Face ID)
 *
 * Persisted in the Supabase database (public.users) AND synchronized
 * with device secure storage (SecureStore / AsyncStorage fallback).
 */
const LOCK_ENABLED_KEY = 'skfl.appLock.enabled';
const LOCK_TYPE_KEY = 'skfl.appLock.type';
const BIO_KEY = 'skfl.appLock.biometrics';

const PASSCODE_HASH_KEY = 'skfl.passcode.hash';
const PASSCODE_SALT_KEY = 'skfl.passcode.salt';
const PASSCODE_FAILS_KEY = 'skfl.passcode.fails';

const PATTERN_HASH_KEY = 'skfl.pattern.hash';
const PATTERN_SALT_KEY = 'skfl.pattern.salt';
const PATTERN_FAILS_KEY = 'skfl.pattern.fails';

const OWNER_KEY = 'skfl.appLock.owner';

export const PASSCODE_LENGTH = 4;
export const MIN_PATTERN_LENGTH = 4;
export const MAX_LOCK_ATTEMPTS = 5;

/** Biometrics are mobile only, but PIN/Pattern work across all platforms including Web */
export const biometricSupported = Platform.OS !== 'web';
export const lockSupported = true;

export interface AppLockSupport {
  available: boolean;
  /** Label for biometrics: "Fingerprint", "Face unlock". */
  method: string;
  icon: 'finger-print' | 'scan-outline';
  reason?: string;
}

// Resilient storage helper (SecureStore on iOS/Android, AsyncStorage on Web/fallback)
async function storeGet(key: string): Promise<string | null> {
  if (Platform.OS !== 'web') {
    try {
      const v = await SecureStore.getItemAsync(key);
      if (v != null) return v;
    } catch {}
  }
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function storeSet(key: string, value: string): Promise<void> {
  if (Platform.OS !== 'web') {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch {}
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch {}
}

async function storeDelete(key: string): Promise<void> {
  if (Platform.OS !== 'web') {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  }
  try {
    await AsyncStorage.removeItem(key);
  } catch {}
}

export async function getAppLockSupport(): Promise<AppLockSupport> {
  if (!biometricSupported) {
    return { available: false, method: 'Fingerprint', icon: 'finger-print', reason: 'Biometrics are available on phones only.' };
  }
  try {
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) && !types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
    const method = face ? 'Face unlock' : 'Fingerprint';
    const icon = face ? 'scan-outline' : 'finger-print';
    if (!hardware) return { available: false, method, icon, reason: 'This phone has no fingerprint or face sensor.' };
    if (!enrolled) return { available: false, method, icon, reason: `Add a ${method.toLowerCase()} in your phone settings first.` };
    return { available: true, method, icon };
  } catch {
    return { available: false, method: 'Fingerprint', icon: 'finger-print', reason: 'Could not access biometric hardware.' };
  }
}

export async function isAppLockEnabled(): Promise<boolean> {
  return (await storeGet(LOCK_ENABLED_KEY)) === '1';
}

export async function setAppLockEnabled(on: boolean): Promise<void> {
  if (on) await storeSet(LOCK_ENABLED_KEY, '1');
  else await storeDelete(LOCK_ENABLED_KEY);
}

export async function getAppLockType(): Promise<AppLockType> {
  const t = await storeGet(LOCK_TYPE_KEY);
  if (t === 'pattern' || t === 'biometric' || t === 'passcode') return t;
  return 'passcode';
}

export async function setAppLockType(type: AppLockType): Promise<void> {
  await storeSet(LOCK_TYPE_KEY, type);
}

export async function isBiometricEnabled(): Promise<boolean> {
  return (await storeGet(BIO_KEY)) === '1';
}

export async function setBiometricEnabled(on: boolean): Promise<void> {
  if (on) await storeSet(BIO_KEY, '1');
  else await storeDelete(BIO_KEY);
}

/** Robust salt generator that works across all native platforms, Web Crypto, and HTTP fallbacks */
function generateSalt(): string {
  try {
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      const arr = new Uint8Array(16);
      window.crypto.getRandomValues(arr);
      return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    if (Crypto.getRandomBytes) {
      const arr = Crypto.getRandomBytes(16);
      return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {}
  let s = '';
  for (let idx = 0; idx < 32; idx++) {
    s += Math.floor(Math.random() * 16).toString(16);
  }
  return s;
}

/** Pure JS SHA-256 fallback for environments without WebCrypto subtle (e.g. non-HTTPS web, local IPs) */
function sha256Pure(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  for (let i = 0; i < ascii.length; i++) {
    const code = ascii.charCodeAt(i);
    words[i >> 2] |= (code & 0xff) << ((3 - (i % 4)) * 8);
  }
  words[asciiBitLength >> 5] |= 0x80 << ((3 - ((asciiBitLength >> 3) % 4)) * 8);
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  for (let i = 0; i < words.length; i += 16) {
    const w = words.slice(i, i + 16);
    const oldHash = hash.slice(0);

    for (let j = 0; j < 64; j++) {
      if (j >= 16) {
        const s0 = rightRotate(w[j - 15] | 0, 7) ^ rightRotate(w[j - 15] | 0, 18) ^ ((w[j - 15] | 0) >>> 3);
        const s1 = rightRotate(w[j - 2] | 0, 17) ^ rightRotate(w[j - 2] | 0, 19) ^ ((w[j - 2] | 0) >>> 10);
        w[j] = ((w[j - 16] | 0) + s0 + (w[j - 7] | 0) + s1) | 0;
      }
      const s1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const temp1 = (hash[7] + s1 + ch + k[j] + (w[j] | 0)) | 0;
      const s0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 = (s0 + maj) | 0;

      hash = [(temp1 + temp2) | 0, hash[0], hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]];
    }

    for (let j = 0; j < 8; j++) {
      hash[j] = (hash[j] + oldHash[j]) | 0;
    }
  }

  let result = '';
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

export async function hashSecret(secret: string, customSalt?: string): Promise<{ hash: string; salt: string }> {
  const salt = customSalt || generateSalt();
  const input = `${salt}:${secret}`;
  try {
    if (Crypto.digestStringAsync) {
      const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
      if (hash) return { hash, salt };
    }
  } catch {}
  return { hash: sha256Pure(input), salt };
}

// ----------------- PASSCODE -----------------

export async function hasPasscode(): Promise<boolean> {
  return !!(await storeGet(PASSCODE_HASH_KEY));
}

export async function setPasscode(pin: string): Promise<{ hash: string; salt: string }> {
  const { hash, salt } = await hashSecret(pin);
  await storeSet(PASSCODE_SALT_KEY, salt);
  await storeSet(PASSCODE_HASH_KEY, hash);
  await storeDelete(PASSCODE_FAILS_KEY);
  return { hash, salt };
}

export async function verifyPasscode(pin: string): Promise<{ ok: boolean; attemptsLeft: number }> {
  const [salt, stored, fails] = await Promise.all([
    storeGet(PASSCODE_SALT_KEY),
    storeGet(PASSCODE_HASH_KEY),
    storeGet(PASSCODE_FAILS_KEY),
  ]);
  if (!salt || !stored) return { ok: false, attemptsLeft: 0 };
  const { hash } = await hashSecret(pin, salt);
  if (hash === stored) {
    await storeDelete(PASSCODE_FAILS_KEY);
    return { ok: true, attemptsLeft: MAX_LOCK_ATTEMPTS };
  }
  const n = Number(fails ?? 0) + 1;
  await storeSet(PASSCODE_FAILS_KEY, String(n));
  return { ok: false, attemptsLeft: Math.max(0, MAX_LOCK_ATTEMPTS - n) };
}

// ----------------- PATTERN LOCK -----------------

export async function hasPattern(): Promise<boolean> {
  return !!(await storeGet(PATTERN_HASH_KEY));
}

export async function setPattern(pattern: string): Promise<{ hash: string; salt: string }> {
  const { hash, salt } = await hashSecret(pattern);
  await storeSet(PATTERN_SALT_KEY, salt);
  await storeSet(PATTERN_HASH_KEY, hash);
  await storeDelete(PATTERN_FAILS_KEY);
  return { hash, salt };
}

export async function verifyPattern(pattern: string): Promise<{ ok: boolean; attemptsLeft: number }> {
  const [salt, stored, fails] = await Promise.all([
    storeGet(PATTERN_SALT_KEY),
    storeGet(PATTERN_HASH_KEY),
    storeGet(PATTERN_FAILS_KEY),
  ]);
  if (!salt || !stored) return { ok: false, attemptsLeft: 0 };
  const { hash } = await hashSecret(pattern, salt);
  if (hash === stored) {
    await storeDelete(PATTERN_FAILS_KEY);
    return { ok: true, attemptsLeft: MAX_LOCK_ATTEMPTS };
  }
  const n = Number(fails ?? 0) + 1;
  await storeSet(PATTERN_FAILS_KEY, String(n));
  return { ok: false, attemptsLeft: Math.max(0, MAX_LOCK_ATTEMPTS - n) };
}

/** Verify passcode or pattern secret without affecting global lockout fail counters */
export async function verifySecretOnly(type: 'passcode' | 'pattern', secret: string): Promise<boolean> {
  const saltKey = type === 'passcode' ? PASSCODE_SALT_KEY : PATTERN_SALT_KEY;
  const hashKey = type === 'passcode' ? PASSCODE_HASH_KEY : PATTERN_HASH_KEY;
  const [salt, stored] = await Promise.all([storeGet(saltKey), storeGet(hashKey)]);
  if (!salt || !stored) return false;
  const { hash } = await hashSecret(secret, salt);
  return hash === stored;
}

// ----------------- BIOMETRICS -----------------

export async function authenticate(prompt = 'Unlock SKFL'): Promise<{ ok: boolean; error?: string }> {
  if (!biometricSupported) return { ok: false, error: 'Biometrics unavailable on this device.' };
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      cancelLabel: 'Use PIN / Pattern',
      disableDeviceFallback: true,
      requireConfirmation: false,
    });
    if (r.success) return { ok: true };
    if (r.error === 'user_cancel' || r.error === 'system_cancel' || r.error === 'app_cancel' || r.error === 'user_fallback') {
      return { ok: false };
    }
    if (r.error === 'lockout') {
      return { ok: false, error: 'Biometric is locked after too many tries. Use your PIN or pattern.' };
    }
    return { ok: false, error: 'Not recognized. Try again or use PIN/pattern.' };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Biometric authentication failed.' };
  }
}

// ----------------- OWNER & MANAGEMENT -----------------

export async function getLockOwner(): Promise<string | null> {
  return storeGet(OWNER_KEY);
}

export async function setLockOwner(userId: string): Promise<void> {
  await storeSet(OWNER_KEY, userId);
}

export async function resetLockFails(): Promise<void> {
  await Promise.all([
    storeDelete(PASSCODE_FAILS_KEY),
    storeDelete(PATTERN_FAILS_KEY),
  ]);
}

/** Reset alias for compatibility */
export const resetPasscodeFails = resetLockFails;

export async function clearAppLock(): Promise<void> {
  await Promise.all([
    storeDelete(LOCK_ENABLED_KEY),
    storeDelete(LOCK_TYPE_KEY),
    storeDelete(BIO_KEY),
    storeDelete(PASSCODE_HASH_KEY),
    storeDelete(PASSCODE_SALT_KEY),
    storeDelete(PASSCODE_FAILS_KEY),
    storeDelete(PATTERN_HASH_KEY),
    storeDelete(PATTERN_SALT_KEY),
    storeDelete(PATTERN_FAILS_KEY),
    storeDelete(OWNER_KEY),
  ]);
}
