import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * App lock: after the first password sign-in, the session stays on this phone
 * and opening the app asks for fingerprint / face / phone PIN instead of the
 * password. No password is ever stored on the device.
 */
const KEY = 'skfl.appLock.enabled';

export interface AppLockSupport {
  available: boolean;
  /** What the phone will ask for, for labels: "Fingerprint", "Face unlock", "Phone PIN". */
  method: string;
  icon: 'finger-print' | 'scan-outline' | 'keypad-outline';
  reason?: string;
}

export async function getAppLockSupport(): Promise<AppLockSupport> {
  if (Platform.OS === 'web') return { available: false, method: 'Not available', icon: 'keypad-outline', reason: 'App lock works on phones only.' };
  const [hardware, level, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  if (level === LocalAuthentication.SecurityLevel.NONE) {
    return { available: false, method: 'Not set up', icon: 'keypad-outline', reason: 'Set a screen lock (fingerprint, face or PIN) in your phone settings first.' };
  }
  const biometric = hardware && level !== LocalAuthentication.SecurityLevel.SECRET;
  if (biometric && types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return { available: true, method: 'Fingerprint', icon: 'finger-print' };
  if (biometric && types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return { available: true, method: 'Face unlock', icon: 'scan-outline' };
  return { available: true, method: 'Phone PIN', icon: 'keypad-outline' };
}

export async function isAppLockEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await SecureStore.getItemAsync(KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setAppLockEnabled(on: boolean) {
  if (Platform.OS === 'web') return;
  if (on) await SecureStore.setItemAsync(KEY, '1');
  else await SecureStore.deleteItemAsync(KEY);
}

/** Shows the phone's own fingerprint / face / PIN prompt. PIN is allowed as a fallback. */
export async function authenticate(prompt = 'Unlock SKFL'): Promise<{ ok: boolean; error?: string }> {
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: prompt,
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
    requireConfirmation: false,
  });
  if (r.success) return { ok: true };
  if (r.error === 'user_cancel' || r.error === 'system_cancel' || r.error === 'app_cancel') return { ok: false };
  if (r.error === 'lockout') return { ok: false, error: 'Too many attempts. Unlock your phone first, then try again.' };
  return { ok: false, error: 'Could not verify. Try again or sign in with your password.' };
}
