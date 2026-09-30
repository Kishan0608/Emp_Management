import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { api, errorMessage } from '@/lib/api';
import { authenticate, getAppLockSupport, isAppLockEnabled, setAppLockEnabled } from '@/lib/appLock';
import { googleSignIn } from '@/lib/oauth';
import { registerForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import type { MyContext, Role } from '@/lib/types';

/**
 * Where the signed-in person is in the entry flow. The router shows exactly
 * one group of screens for each state (see app/_layout.tsx).
 */
export type AuthStatus = 'loading' | 'signedOut' | 'needsOnboarding' | 'needsMfa' | 'needsPassword' | 'needsConsent' | 'ready';

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
  touch: () => void;
  clearNotice: () => void;
  /** App lock (fingerprint / face / phone PIN). When `locked`, the app shows the unlock screen. */
  locked: boolean;
  appLockEnabled: boolean;
  unlock: () => Promise<string | null>;
  setAppLock: (on: boolean) => Promise<string | null>;
}

// After this long in the background, returning to the app asks to unlock again.
const BACKGROUND_LOCK_MS = 15_000;

const AuthContext = createContext<AuthValue | null>(null);

// Last interaction time is stored so the timeout also applies after the app was closed.
const LAST_ACTIVE_KEY = 'emp.lastActiveAt';

function markActive(ref: { current: number }, force = false) {
  const now = Date.now();
  const stale = now - ref.current > 15_000;
  ref.current = now;
  if (force || stale) AsyncStorage.setItem(LAST_ACTIVE_KEY, String(now)).catch(() => {});
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ctx, setCtx] = useState<MyContext | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [appLockEnabled, setAppLockState] = useState(false);
  const appLockRef = useRef(false); // sync copy for use inside callbacks
  const freshSignIn = useRef(false); // true right after typing the password: no need to unlock again
  const lastActive = useRef(0);
  const pushRegistered = useRef(false);

  const signOut = useCallback(async (allDevices = false, message?: string) => {
    try {
      await api.recordLogout(allDevices);
    } catch {
      // logging out must work even offline
    }
    await supabase.auth.signOut({ scope: allDevices ? 'global' : 'local' });
    await AsyncStorage.removeItem(LAST_ACTIVE_KEY).catch(() => {});
    lastActive.current = 0;
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
        // Cold start: if the app sat unused past the timeout, require a fresh sign-in
        // (or, with App lock on, just the fingerprint / PIN — the lock below covers it).
        const stored = Number((await AsyncStorage.getItem(LAST_ACTIVE_KEY)) ?? 0);
        const limitMs = c.settings.session_timeout_minutes * 60_000;
        if (!appLockRef.current && lastActive.current === 0 && stored > 0 && Date.now() - stored > limitMs) {
          await signOut(false, 'You were signed out after a period of inactivity.');
          return;
        }
        markActive(lastActive, true);
        setCtx(c);
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (c.mfa_required && aal?.currentLevel !== 'aal2') setStatus('needsMfa');
        else if (c.user.must_change_password) setStatus('needsPassword');
        else if ((c.user.consent_version ?? 0) < c.settings.privacy_notice_version) setStatus('needsConsent');
        else {
          // Session restored from the phone (not typed just now) → ask for fingerprint / PIN.
          if (appLockRef.current && !freshSignIn.current) setLocked(true);
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
    // Read the App lock preference first so a restored session opens locked.
    Promise.all([isAppLockEnabled(), supabase.auth.getSession()]).then(([lockOn, { data }]) => {
      appLockRef.current = lockOn;
      setAppLockState(lockOn);
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

  // Inactivity: with App lock on, lock the app; otherwise sign out.
  // Also re-lock when the app comes back after a while in the background.
  useEffect(() => {
    if (!ctx || status === 'signedOut') return;
    const limitMs = ctx.settings.session_timeout_minutes * 60_000;
    let backgroundAt = 0;
    const check = () => {
      if (lastActive.current > 0 && Date.now() - lastActive.current > limitMs) {
        if (appLockRef.current && status === 'ready') setLocked(true);
        else signOut(false, 'You were signed out after a period of inactivity.');
      }
    };
    const timer = setInterval(check, 30_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundAt = Date.now();
      if (state === 'active') {
        if (appLockRef.current && status === 'ready' && backgroundAt > 0 && Date.now() - backgroundAt > BACKGROUND_LOCK_MS) setLocked(true);
        backgroundAt = 0;
        check();
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [ctx, status, signOut]);

  const unlock = useCallback(async () => {
    const r = await authenticate('Unlock SKFL');
    if (r.ok) {
      markActive(lastActive, true);
      setLocked(false);
      return null;
    }
    return r.error ?? null;
  }, []);

  const setAppLock = useCallback(async (on: boolean) => {
    if (on) {
      const support = await getAppLockSupport();
      if (!support.available) return support.reason ?? 'App lock is not available on this phone.';
      const r = await authenticate(`Turn on ${support.method} unlock`);
      if (!r.ok) return r.error ?? 'App lock was not turned on.';
    }
    await setAppLockEnabled(on);
    appLockRef.current = on;
    setAppLockState(on);
    if (!on) setLocked(false);
    return null;
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setNotice(null);
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) {
        if (error.status === 429) throw new Error('Too many attempts. Please wait a few minutes and try again.');
        throw new Error(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message);
      }
      markActive(lastActive, true);
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
    markActive(lastActive, true);
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
      touch: () => markActive(lastActive),
      clearNotice: () => setNotice(null),
      locked,
      appLockEnabled,
      unlock,
      setAppLock,
    }),
    [status, session, ctx, notice, signIn, signInWithGoogle, signOut, refresh, locked, appLockEnabled, unlock, setAppLock],
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
