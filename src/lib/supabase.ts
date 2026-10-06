import 'react-native-url-polyfill/auto';
import './webcrypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Set when the app was built without its Supabase settings; the root layout shows a setup screen instead of crashing. */
export const configError =
  !url || !key ? 'The app is missing its server settings (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY). Copy .env.example to .env.local and restart.' : null;

// Static web rendering runs in Node, where there is no window/localStorage.
const isServer = Platform.OS === 'web' && typeof window === 'undefined';

export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder-key', {
  auth: {
    storage: isServer ? undefined : AsyncStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
    flowType: 'pkce', // Google sign-in returns a one-time code that is exchanged in the app
  },
});

// Refresh tokens only while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
