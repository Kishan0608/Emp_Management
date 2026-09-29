import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * "Continue with Google" via Supabase OAuth (PKCE).
 * Needs the Google provider enabled in Supabase and this redirect URL allowed:
 *   skfl://auth-callback   (and the exp:// URL printed below while using Expo Go)
 * Returns null if the person closed the Google window.
 */
export async function googleSignIn(): Promise<Session | null> {
  const redirectTo = Platform.OS === 'web' ? window.location.origin + '/auth-callback' : Linking.createURL('auth-callback');
  if (__DEV__) console.log('[oauth] redirect URL to allow in Supabase:', redirectTo);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data.url) throw new Error(friendly(error?.message));

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return null;

  const url = new URL(result.url);
  const errDesc = url.searchParams.get('error_description');
  if (errDesc) throw new Error(friendly(errDesc));
  const code = url.searchParams.get('code');
  if (!code) throw new Error('Google sign-in did not complete. Please try again.');

  const { data: exchanged, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exErr) throw new Error(friendly(exErr.message));
  return exchanged.session;
}

function friendly(msg?: string) {
  if (!msg) return 'Google sign-in failed. Please try again.';
  if (/provider is not enabled|Unsupported provider/i.test(msg)) return 'Google sign-in is not set up yet. Please use email and password.';
  return msg;
}
