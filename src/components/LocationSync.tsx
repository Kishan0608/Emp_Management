import { useEffect } from 'react';
import { AppState } from 'react-native';

import { syncLocationTracking } from '@/lib/location';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Keeps the phone's tracking in line with the saved setting: on sign-in, when the setting
 * changes, and whenever the app comes back to the foreground (the user may have turned GPS
 * or the permission off meanwhile). Sign-out stops tracking in AuthProvider.signOut.
 */
export function LocationSync() {
  const { ctx } = useAuth();
  const signedIn = ctx !== null;
  const enabled = ctx?.user.location_sharing_enabled ?? false;

  useEffect(() => {
    if (!signedIn) return;
    const run = () => syncLocationTracking(enabled).catch(() => {});
    run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => sub.remove();
  }, [signedIn, enabled]);

  return null;
}
