import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * App lock: after the first password sign-in the session stays on this phone.
 * Opening the app again asks for a 4-digit app passcode or fingerprint / face
 * instead of email + password. Only a salted hash of the passcode is stored,
 * in the phone's secure keystore; no password is ever stored.
 */
const BIO_KEY = 'skfl.appLock.enabled';
const HASH_KEY = 'skfl.passcode.hash';
const SALT_KEY = 'skfl.passcode.salt';
const FAILS_KEY = 'skfl.passcode.fails';
const OWNER_KEY = 'skfl.passcode.owner';

export const PASSCODE_LENGTH = 4;
export const MAX_PASSCODE_ATTEMPTS = 5;

/** Web has no secure keystore, so the lock is phone-only. */
export const lockSupported = Platform.OS !== 'web';

export interface AppLockSupport {
  available: boolean;
  /** What the phone will ask for, for labels: "Fingerprint", "Face unlock". */
  method: string;
  icon: 'finger-print' | 'scan-outline';
  reason?: string;
}

export async function getAppLockSupport(): Promise<AppLockSupport> {
  if (!lockSupported) return { available: false, method: 'Fingerprint', icon: 'finger-print', reason: 'Works on phones only.' };
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
}

async function get(key: string) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function isAppLockEnabled(): Promise<boolean> {
  if (!lockSupported) return false;
  return (await get(BIO_KEY)) === '1';
}

export async function setAppLockEnabled(on: boolean) {
  if (!lockSupported) return;
  if (on) await SecureStore.setItemAsync(BIO_KEY, '1');
  else await SecureStore.deleteItemAsync(BIO_KEY);
}

const hash = (salt: string, pin: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);

export async function hasPasscode() {
  if (!lockSupported) return false;
  return !!(await get(HASH_KEY));
}

export async function setPasscode(pin: string) {
  const salt = Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(SALT_KEY, salt);
  await SecureStore.setItemAsync(HASH_KEY, await hash(salt, pin));
  await SecureStore.deleteItemAsync(FAILS_KEY);
}

/** Checks the passcode. Wrong tries survive app restarts so they cannot be reset by closing the app. */
export async function verifyPasscode(pin: string): Promise<{ ok: boolean; attemptsLeft: number }> {
  const [salt, stored, fails] = await Promise.all([get(SALT_KEY), get(HASH_KEY), get(FAILS_KEY)]);
  if (!salt || !stored) return { ok: false, attemptsLeft: 0 };
  if ((await hash(salt, pin)) === stored) {
    await SecureStore.deleteItemAsync(FAILS_KEY);
    return { ok: true, attemptsLeft: MAX_PASSCODE_ATTEMPTS };
  }
  const n = Number(fails ?? 0) + 1;
  await SecureStore.setItemAsync(FAILS_KEY, String(n));
  return { ok: false, attemptsLeft: Math.max(0, MAX_PASSCODE_ATTEMPTS - n) };
}

/** The account the saved passcode belongs to, so it survives sign-out for that same person only. */
export async function getLockOwner() {
  if (!lockSupported) return null;
  return get(OWNER_KEY);
}

export async function setLockOwner(userId: string) {
  if (!lockSupported) return;
  await SecureStore.setItemAsync(OWNER_KEY, userId);
}

/** A correct password sign-in proves identity, so earlier wrong passcode tries no longer count. */
export async function resetPasscodeFails() {
  if (!lockSupported) return;
  await SecureStore.deleteItemAsync(FAILS_KEY).catch(() => {});
}

/** Removes the passcode and fingerprint setting from this phone. */
export async function clearAppLock() {
  if (!lockSupported) return;
  await Promise.all([HASH_KEY, SALT_KEY, FAILS_KEY, BIO_KEY, OWNER_KEY].map((k) => SecureStore.deleteItemAsync(k).catch(() => {})));
}

/** Shows the phone's fingerprint / face prompt. The app passcode is the fallback, not the phone PIN. */
export async function authenticate(prompt = 'Unlock SKFL'): Promise<{ ok: boolean; error?: string }> {
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: prompt,
    cancelLabel: 'Use passcode',
    disableDeviceFallback: true,
    requireConfirmation: false,
  });
  if (r.success) return { ok: true };
  if (r.error === 'user_cancel' || r.error === 'system_cancel' || r.error === 'app_cancel' || r.error === 'user_fallback') return { ok: false };
  if (r.error === 'lockout') return { ok: false, error: 'Fingerprint is locked after too many tries. Use your passcode.' };
  return { ok: false, error: 'Not recognised. Try again or use your passcode.' };
}
