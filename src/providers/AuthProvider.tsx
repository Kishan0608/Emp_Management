import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { api, errorMessage } from '@/lib/api';
import { registerForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import type { MyContext, Role } from '@/lib/types';

/**
 * Where the signed-in person is in the entry flow. The router shows exactly
 * one group of screens for each state (see app/_layout.tsx).
 */
export type AuthStatus = 'loading' | 'signedOut' | 'needsMfa' | 'needsPassword' | 'needsConsent' | 'ready';

interface AuthValue {
  status: AuthStatus;
  session: Session | null;
  ctx: MyContext | null;
  role: Role | null;
  notice: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: (allDevices?: boolean, notice?: string) => Promise<void>;
  refresh: () => Promise<void>;
  touch: () => void;
  clearNotice: () => void;
}

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
        if (c.user.account_status && c.user.account_status !== 'active') {
          await signOut(
            false,
            c.user.account_status === 'awaiting_approval'
              ? 'Your account is waiting for approval from the administrator. Try again once approved.'
              : 'Your account is not activated yet. Tap "Activate account" and enter your key.',
          );
          return;
        }
        // Cold start: if the app sat unused past the timeout, require a fresh sign-in.
        const stored = Number((await AsyncStorage.getItem(LAST_ACTIVE_KEY)) ?? 0);
        const limitMs = c.settings.session_timeout_minutes * 60_000;
        if (lastActive.current === 0 && stored > 0 && Date.now() - stored > limitMs) {
          await signOut(false, 'You were signed out after a period of inactivity.');
          return;
        }
        markActive(lastActive, true);
        setCtx(c);
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (c.mfa_required && aal?.currentLevel !== 'aal2') setStatus('needsMfa');
        else if (c.user.must_change_password) setStatus('needsPassword');
        else if ((c.user.consent_version ?? 0) < c.settings.privacy_notice_version) setStatus('needsConsent');
        else setStatus('ready');
      } catch (e) {
        await signOut(false, errorMessage(e));
      }
    },
    [signOut],
  );

  useEffect(() => {
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

  // Session timeout after inactivity (also checked when the app returns to the foreground).
  useEffect(() => {
    if (!ctx || status === 'signedOut') return;
    const limitMs = ctx.settings.session_timeout_minutes * 60_000;
    const check = () => {
      if (lastActive.current > 0 && Date.now() - lastActive.current > limitMs) {
        signOut(false, 'You were signed out after a period of inactivity.');
      }
    };
    const timer = setInterval(check, 30_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [ctx, status, signOut]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setNotice(null);
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) {
        if (error.status === 429) throw new Error('Too many attempts. Please wait a few minutes and try again.');
        throw new Error(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message);
      }
      markActive(lastActive, true);
      setSession(data.session);
      await resolve(data.session);
    },
    [resolve],
  );

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
      signOut,
      refresh,
      touch: () => markActive(lastActive),
      clearNotice: () => setNotice(null),
    }),
    [status, session, ctx, notice, signIn, signOut, refresh],
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
