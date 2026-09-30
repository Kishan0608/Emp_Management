import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { api, errorMessage } from '@/lib/api';
import {
  authenticate,
  clearAppLock,
  getAppLockSupport,
  hasPasscode,
  isAppLockEnabled,
  lockSupported,
  setAppLockEnabled,
  setPasscode,
  verifyPasscode,
} from '@/lib/appLock';
import { googleSignIn } from '@/lib/oauth';
import { registerForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import type { MyContext, Role } from '@/lib/types';

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
  signOut: (allDevices?: boolean, notice?: string) => Promise<void>;
  refresh: () => Promise<void>;
  clearNotice: () => void;
  /** When `locked`, the app shows the passcode / fingerprint screen over everything. */
  locked: boolean;
  /** Fingerprint / face unlock turned on for this phone. */
  appLockEnabled: boolean;
  unlock: () => Promise<string | null>;
  unlockWithPasscode: (pin: string) => Promise<{ ok: boolean; attemptsLeft: number }>;
  setAppLock: (on: boolean) => Promise<string | null>;
  /** Saves a new app passcode (first setup or change) and optionally turns on fingerprint. */
  savePasscode: (pin: string, biometrics?: boolean) => Promise<void>;
}

// Returning to the app after this long in the background asks for the passcode / fingerprint again.
const BACKGROUND_LOCK_MS = 15_000;

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ctx, setCtx] = useState<MyContext | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [appLockEnabled, setAppLockState] = useState(false);
  const freshSignIn = useRef(false); // true right after typing the password: no need to unlock again
  const pushRegistered = useRef(false);

  const signOut = useCallback(async (allDevices = false, message?: string) => {
    try {
      await api.recordLogout(allDevices);
    } catch {
      // logging out must work even offline
    }
    await supabase.auth.signOut({ scope: allDevices ? 'global' : 'local' });
    await clearAppLock();
    pushRegistered.current = false;
    setAppLockState(false);
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
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (c.mfa_required && aal?.currentLevel !== 'aal2') setStatus('needsMfa');
        else if (c.user.must_change_password) setStatus('needsPassword');
        else if ((c.user.consent_version ?? 0) < c.settings.privacy_notice_version) setStatus('needsConsent');
        else if (lockSupported && !(await hasPasscode())) setStatus('needsPasscode');
        else {
          // Session restored from the phone (not typed just now) → ask for passcode / fingerprint.
          if (lockSupported && !freshSignIn.current) setLocked(true);
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
    Promise.all([isAppLockEnabled(), supabase.auth.getSession()]).then(([bio, { data }]) => {
      setAppLockState(bio);
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
  }, [resolve]);

  // Record the login once the person is fully in, then register for push.
  useEffect(() => {
    if (status !== 'ready' || !ctx || pushRegistered.current) return;
    pushRegistered.current = true;
    api.recordLogin().catch(() => {});
    registerForPush()
      .then((token) => token && api.savePushToken(ctx.user.id, token))
      .catch(() => {});
  }, [status, ctx]);

  // No inactivity sign-out: the session stays until the person signs out.
  // Coming back after a while in the background locks the app instead.
  useEffect(() => {
    if (!lockSupported || status !== 'ready') return;
    let backgroundAt = 0;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundAt = Date.now();
      if (state === 'active') {
        if (backgroundAt > 0 && Date.now() - backgroundAt > BACKGROUND_LOCK_MS) setLocked(true);
        backgroundAt = 0;
      }
    });
    return () => sub.remove();
  }, [status]);

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
      if (r.ok) setLocked(false);
      else if (r.attemptsLeft === 0) await signOut(false, 'Too many wrong passcodes. Sign in with your email and password.');
      return r;
    },
    [signOut],
  );

  const setAppLock = useCallback(async (on: boolean) => {
    if (on) {
      const support = await getAppLockSupport();
      if (!support.available) return support.reason ?? 'Fingerprint unlock is not available on this phone.';
      const r = await authenticate(`Turn on ${support.method.toLowerCase()} unlock`);
      if (!r.ok) return r.error ?? `${support.method} unlock was not turned on.`;
    }
    await setAppLockEnabled(on);
    setAppLockState(on);
    return null;
  }, []);

  const savePasscode = useCallback(
    async (pin: string, biometrics?: boolean) => {
      await setPasscode(pin);
      if (biometrics !== undefined) {
        await setAppLockEnabled(biometrics);
        setAppLockState(biometrics);
      }
      if (status === 'needsPasscode') {
        freshSignIn.current = false;
        setStatus('ready');
      }
    },
    [status],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      setNotice(null);
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) {
        if (error.status === 429) throw new Error('Too many attempts. Please wait a few minutes and try again.');
        throw new Error(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message);
      }
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
      unlock,
      unlockWithPasscode,
      setAppLock,
      savePasscode,
    }),
    [status, session, ctx, notice, signIn, signInWithGoogle, signOut, refresh, locked, appLockEnabled, unlock, unlockWithPasscode, setAppLock, savePasscode],
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
    isCaseHandler: u.role === 'hr' && u.is_case_handler,
  };
}
