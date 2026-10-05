import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { api, errorMessage } from '@/lib/api';
import {
  authenticate,
  clearAppLock,
  getAppLockSupport,
  getAppLockType,
  getLockOwner,
  hasPasscode,
  hasPattern,
  isAppLockEnabled,
  isBiometricEnabled,
  lockSupported,
  resetLockFails,
  setAppLockEnabled,
  setAppLockType,
  setBiometricEnabled,
  setLockOwner,
  setPasscode,
  setPattern,
  verifyPasscode,
  verifyPattern,
} from '@/lib/appLock';
import { googleSignIn } from '@/lib/oauth';
import { registerForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import type { AppLockType, MyContext, Role } from '@/lib/types';

/**
 * Where the signed-in person is in the entry flow. The router shows exactly
 * one group of screens for each state (see app/_layout.tsx).
 */
export type AuthStatus = 'loading' | 'signedOut' | 'needsOnboarding' | 'needsMfa' | 'needsPassword' | 'needsConsent' | 'needsPasscode' | 'ready';

interface AuthValue {
  status: AuthStatus;
  session: Session | null;
  ctx: MyContext | null;
  role: Role | null;
  notice: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  /** `forgetPasscode` also removes this phone's passcode and fingerprint setting. */
  signOut: (allDevices?: boolean, notice?: string, forgetPasscode?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  clearNotice: () => void;
  /** When `locked`, the app shows the AppLock screen (Passcode, Pattern, or Fingerprint). */
  locked: boolean;
  /** Whether App Lock is active. When false, protected by Email + Password only. */
  appLockEnabled: boolean;
  appLockType: AppLockType;
  biometricEnabled: boolean;
  hasConfiguredPasscode: boolean;
  hasConfiguredPattern: boolean;
  unlock: () => Promise<string | null>;
  unlockWithPasscode: (pin: string) => Promise<{ ok: boolean; attemptsLeft: number }>;
  unlockWithPattern: (pattern: string) => Promise<{ ok: boolean; attemptsLeft: number }>;
  setAppLock: (on: boolean) => Promise<string | null>;
  setAppLockTypePref: (type: AppLockType) => Promise<void>;
  setBiometricPref: (on: boolean) => Promise<string | null>;
  disableAppLock: () => Promise<void>;
  savePasscode: (pin: string, biometrics?: boolean) => Promise<void>;
  savePatternLock: (pattern: string, biometrics?: boolean) => Promise<void>;
  testAppLock: () => void;
}

// Returning to the app after this long in the background asks for the passcode / pattern / fingerprint again.
const BACKGROUND_LOCK_MS = 15_000;

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ctx, setCtx] = useState<MyContext | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [appLockEnabled, setAppLockState] = useState(false);
  const [appLockType, setAppLockTypeState] = useState<AppLockType>('passcode');
  const [biometricEnabled, setBiometricState] = useState(false);
  const [hasConfiguredPasscode, setHasConfiguredPasscode] = useState(false);
  const [hasConfiguredPattern, setHasConfiguredPattern] = useState(false);

  const freshSignIn = useRef(false); // true right after typing the password: no need to unlock again
  const pushRegistered = useRef(false);

  const syncLocalLockFlags = useCallback(async () => {
    const [enabled, type, bio, pass, pat] = await Promise.all([
      isAppLockEnabled(),
      getAppLockType(),
      isBiometricEnabled(),
      hasPasscode(),
      hasPattern(),
    ]);
    setAppLockState(enabled);
    setAppLockTypeState(type);
    setBiometricState(bio);
    setHasConfiguredPasscode(pass);
    setHasConfiguredPattern(pat);
  }, []);

  const signOut = useCallback(async (allDevices = false, message?: string, forgetPasscode = false) => {
    try {
      await api.recordLogout(allDevices);
    } catch {
      // logging out must work even offline
    }
    await supabase.auth.signOut({ scope: allDevices ? 'global' : 'local' });
    if (forgetPasscode) {
      await clearAppLock();
      setAppLockState(false);
      setBiometricState(false);
    }
    pushRegistered.current = false;
    setLocked(false);
    setCtx(null);
    setSession(null);
    setStatus('signedOut');
    if (message) setNotice(message);
  }, []);

  const resolve = useCallback(
    async (s: Session | null) => {
      if (!s) {
        setCtx(null);
        setStatus('signedOut');
        return;
      }
      try {
        const c = await api.myContext();
        if (!c.user.is_active) {
          await signOut(false, 'This account is deactivated. Contact your administrator.');
          return;
        }
        if (c.user.account_status === 'awaiting_approval') {
          await signOut(false, 'Your account is waiting for approval from the administrator. Try again once approved.');
          return;
        }
        if (c.user.account_status && c.user.account_status !== 'active') {
          // Self sign-up in progress: email code, key/QR, profile, approver code.
          setCtx(c);
          setStatus('needsOnboarding');
          return;
        }
        setCtx(c);

        // Check DB for App Lock preference
        const dbLockEnabled = !!c.user.app_lock_enabled;
        const dbLockType = (c.user.app_lock_type as AppLockType) || 'passcode';
        const dbBio = !!c.user.app_lock_biometric_enabled;
        const dbHasPasscode = !!c.user.has_passcode;
        const dbHasPattern = !!c.user.has_pattern;

        setHasConfiguredPasscode(dbHasPasscode);
        setHasConfiguredPattern(dbHasPattern);

        // Manage ownership and sync DB state with local device storage
        const owner = await getLockOwner();
        if (owner && owner !== c.user.id) {
          // Different user on this phone
          await clearAppLock();
          await setLockOwner(c.user.id);
        } else if (!owner) {
          await setLockOwner(c.user.id);
        }

        if (dbLockEnabled) {
          await setAppLockEnabled(true);
          await setAppLockType(dbLockType);
          await setBiometricEnabled(dbBio);
          setAppLockState(true);
          setAppLockTypeState(dbLockType);
          setBiometricState(dbBio);
        } else {
          // Explicitly disabled in DB
          await setAppLockEnabled(false);
          setAppLockState(false);
        }

        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (c.mfa_required && aal?.currentLevel !== 'aal2') {
          setStatus('needsMfa');
        } else if (c.user.must_change_password) {
          setStatus('needsPassword');
        } else if ((c.user.consent_version ?? 0) < c.settings.privacy_notice_version) {
          setStatus('needsConsent');
        } else {
          // NO FORCED NEEDS_PASSCODE!
          // If App Lock is enabled AND this is a restored session (not freshly typed password),
          // show the App Lock screen.
          if (dbLockEnabled && !freshSignIn.current) {
            setLocked(true);
          } else {
            setLocked(false);
          }
          freshSignIn.current = false;
          setStatus('ready');
        }
      } catch (e) {
        await signOut(false, errorMessage(e));
      }
    },
    [signOut],
  );

  useEffect(() => {
    syncLocalLockFlags();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      resolve(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') {
        setCtx(null);
        setStatus('signedOut');
      }
      if (event === 'MFA_CHALLENGE_VERIFIED') resolve(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [resolve, syncLocalLockFlags]);

  // Record the login once the person is fully in, then register for push.
  useEffect(() => {
    if (status !== 'ready' || !ctx || pushRegistered.current) return;
    pushRegistered.current = true;
    api.recordLogin().catch(() => {});
    registerForPush()
      .then((token) => token && api.savePushToken(ctx.user.id, token))
      .catch(() => {});
  }, [status, ctx]);

  // Background timer: lock the app when returning after a while if app lock is enabled
  useEffect(() => {
    if (status !== 'ready' || !appLockEnabled) return;
    let backgroundAt = 0;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundAt = Date.now();
      if (state === 'active') {
        if (backgroundAt > 0 && Date.now() - backgroundAt > BACKGROUND_LOCK_MS) {
          setLocked(true);
        }
        backgroundAt = 0;
      }
    });
    return () => sub.remove();
  }, [status, appLockEnabled]);

  const unlock = useCallback(async () => {
    const r = await authenticate('Unlock SKFL');
    if (r.ok) {
      setLocked(false);
      return null;
    }
    return r.error ?? null;
  }, []);

  const unlockWithPasscode = useCallback(
    async (pin: string) => {
      const r = await verifyPasscode(pin);
      if (r.ok) {
        setLocked(false);
      } else if (r.attemptsLeft === 0) {
        await signOut(false, 'Too many wrong passcodes. Sign in with your email and password.', true);
      }
      return r;
    },
    [signOut],
  );

  const unlockWithPattern = useCallback(
    async (pattern: string) => {
      const r = await verifyPattern(pattern);
      if (r.ok) {
        setLocked(false);
      } else if (r.attemptsLeft === 0) {
        await signOut(false, 'Too many wrong pattern attempts. Sign in with your email and password.', true);
      }
      return r;
    },
    [signOut],
  );

  const savePasscode = useCallback(
    async (pin: string, biometrics?: boolean) => {
      const { hash, salt } = await setPasscode(pin);
      if (ctx) await setLockOwner(ctx.user.id);
      await setAppLockEnabled(true);
      await setAppLockType('passcode');
      setAppLockState(true);
      setAppLockTypeState('passcode');
      setHasConfiguredPasscode(true);

      const bio = biometrics !== undefined ? biometrics : biometricEnabled;
      if (biometrics !== undefined) {
        await setBiometricEnabled(biometrics);
        setBiometricState(biometrics);
      }

      // Persist to Supabase Database
      try {
        await api.saveAppLock({
          enabled: true,
          type: 'passcode',
          passcode_hash: hash,
          passcode_salt: salt,
          biometric_enabled: bio,
        });
      } catch {}

      if (status === 'needsPasscode') {
        freshSignIn.current = false;
        setStatus('ready');
      }
    },
    [status, ctx, biometricEnabled],
  );

  const savePatternLock = useCallback(
    async (pattern: string, biometrics?: boolean) => {
      const { hash, salt } = await setPattern(pattern);
      if (ctx) await setLockOwner(ctx.user.id);
      await setAppLockEnabled(true);
      await setAppLockType('pattern');
      setAppLockState(true);
      setAppLockTypeState('pattern');
      setHasConfiguredPattern(true);

      const bio = biometrics !== undefined ? biometrics : biometricEnabled;
      if (biometrics !== undefined) {
        await setBiometricEnabled(biometrics);
        setBiometricState(biometrics);
      }

      // Persist to Supabase Database
      try {
        await api.saveAppLock({
          enabled: true,
          type: 'pattern',
          pattern_hash: hash,
          pattern_salt: salt,
          biometric_enabled: bio,
        });
      } catch {}

      if (status === 'needsPasscode') {
        freshSignIn.current = false;
        setStatus('ready');
      }
    },
    [status, ctx, biometricEnabled],
  );

  const disableAppLock = useCallback(async () => {
    await setAppLockEnabled(false);
    setAppLockState(false);
    setLocked(false);
    try {
      await api.saveAppLock({ enabled: false });
    } catch {}
  }, []);

  const setAppLockTypePref = useCallback(async (type: AppLockType) => {
    await setAppLockType(type);
    setAppLockTypeState(type);
    try {
      await api.saveAppLock({ enabled: true, type });
    } catch {}
  }, []);

  const setBiometricPref = useCallback(async (on: boolean) => {
    if (on) {
      const support = await getAppLockSupport();
      if (!support.available) return support.reason ?? 'Biometrics not available on this device.';
      const r = await authenticate(`Turn on ${support.method.toLowerCase()} unlock`);
      if (!r.ok) return r.error ?? `${support.method} was not verified.`;
    }
    await setBiometricEnabled(on);
    setBiometricState(on);
    try {
      await api.saveAppLock({ enabled: true, biometric_enabled: on });
    } catch {}
    return null;
  }, []);

  const setAppLock = useCallback(
    async (on: boolean) => {
      if (on) {
        await setAppLockEnabled(true);
        setAppLockState(true);
        try {
          await api.saveAppLock({ enabled: true, type: appLockType });
        } catch {}
        return null;
      } else {
        await disableAppLock();
        return null;
      }
    },
    [appLockType, disableAppLock],
  );

  const testAppLock = useCallback(() => {
    setLocked(true);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setNotice(null);
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) {
        if (error.status === 429) throw new Error('Too many attempts. Please wait a few minutes and try again.');
        throw new Error(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message);
      }
      await resetLockFails();
      freshSignIn.current = true;
      setSession(data.session);
      await resolve(data.session);
    },
    [resolve],
  );

  const signInWithGoogle = useCallback(async () => {
    setNotice(null);
    const session = await googleSignIn();
    if (!session) return; // cancelled
    await resetLockFails();
    freshSignIn.current = true;
    setSession(session);
    await resolve(session);
  }, [resolve]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await resolve(data.session);
  }, [resolve]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      session,
      ctx,
      role: ctx?.user.role ?? null,
      notice,
      signIn,
      signInWithGoogle,
      signOut,
      refresh,
      clearNotice: () => setNotice(null),
      locked,
      appLockEnabled,
      appLockType,
      biometricEnabled,
      hasConfiguredPasscode,
      hasConfiguredPattern,
      unlock,
      unlockWithPasscode,
      unlockWithPattern,
      setAppLock,
      setAppLockTypePref,
      setBiometricPref,
      disableAppLock,
      savePasscode,
      savePatternLock,
      testAppLock,
    }),
    [
      status,
      session,
      ctx,
      notice,
      signIn,
      signInWithGoogle,
      signOut,
      refresh,
      locked,
      appLockEnabled,
      appLockType,
      biometricEnabled,
      hasConfiguredPasscode,
      hasConfiguredPattern,
      unlock,
      unlockWithPasscode,
      unlockWithPattern,
      setAppLock,
      setAppLockTypePref,
      setBiometricPref,
      disableAppLock,
      savePasscode,
      savePatternLock,
      testAppLock,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

/** For screens inside the signed-in area, where ctx is guaranteed. */
export function useMe() {
  const { ctx } = useAuth();
  if (!ctx) throw new Error('useMe used outside the signed-in area');
  const u = ctx.user;
  return {
    ...ctx,
    me: u,
    isBoss: u.role === 'boss',
    isHR: u.role === 'hr',
    isManager: u.role === 'manager',
    isEmployee: u.role === 'employee',
  };
}
