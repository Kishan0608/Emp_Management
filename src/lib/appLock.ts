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

export async function hashSecret(secret: string, customSalt?: string): Promise<{ hash: string; salt: string }> {
  const salt = customSalt || Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${secret}`);
  return { hash, salt };
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
