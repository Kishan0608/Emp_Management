import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Banner, Button, Card, PageHeader, Screen, SectionTitle, SwitchRow } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { getDeviceStatus, getLocationAccess, requestLocationAccess, startLocationTracking, stopLocationTracking, syncLocationTracking, type LocationAccess } from '@/lib/location';
import type { LocationDeviceStatus } from '@/lib/types';
import { useAuth, useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { spacing, type } from '@/theme/tokens';

/** Android 11+ sends the person to a settings page for "all the time"; say what to pick before it opens. */
function explainBackground(): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      'Location access',
      Platform.OS === 'android'
        ? 'Your phone will open a settings page. Choose "Allow all the time" so your location keeps updating when SKFL is closed.'
        : 'Next, choose "Change to Always Allow" so your location keeps updating when SKFL is closed.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

export default function LocationSharing() {
  const { me, settings } = useMe();
  const { refresh } = useAuth();
  const toast = useToast();
  const [access, setAccess] = useState<LocationAccess | null>(null);
  const [status, setStatus] = useState<LocationDeviceStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const enabled = me.location_sharing_enabled ?? false;
  const isWeb = Platform.OS === 'web';

  // Re-check permissions every time the screen gains focus, since the user may have changed them in phone settings.
  useFocusEffect(
    useCallback(() => {
      if (isWeb) return;
      getLocationAccess().then(setAccess).catch(() => setAccess(null));
      getDeviceStatus().then(setStatus).catch(() => setStatus(null));
    }, [isWeb]),
  );

  const toggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (next) {
        const current = await getLocationAccess();
        if (!current.background && !(await explainBackground())) return;
        const result = await requestLocationAccess();
        setAccess(await getLocationAccess());
        if (result === 'foreground_denied') {
          toast('Allow location access to turn sharing on', 'error');
          return;
        }
        if (result === 'background_denied') {
          toast('Choose "Allow all the time" in phone settings so sharing works with the app closed', 'error');
          return;
        }
        await api.setLocationSharing(true);
        await startLocationTracking();
        await syncLocationTracking(true); // reports the phone's state to the server
        setStatus(await getDeviceStatus());
        toast('Location sharing is on');
      } else {
        await api.setLocationSharing(false);
        await stopLocationTracking();
        toast('Location sharing is off');
      }
      await refresh();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const backgroundOff = enabled && access !== null && !access.background;

  return (
    <Screen header={<PageHeader title="Location sharing" />}>
      <View style={{ gap: spacing.md }}>
        {isWeb && <Banner tone="info">Location sharing works in the SKFL phone app.</Banner>}

        <Card style={{ gap: spacing.md }}>
          <SwitchRow
            label="Share my location"
            description="Your phone sends its location about once a minute, even when the app is closed, so your manager can see where you are on field visits."
            value={enabled}
            onChange={toggle}
            disabled={busy || isWeb}
          />
          {backgroundOff && (
            <Banner tone="warning" icon="alert-circle-outline">
              Background access is off, so your location only updates while SKFL is open. Choose &ldquo;Allow all the time&rdquo; in phone settings.
            </Banner>
          )}
          {enabled && status === 'services_off' && (
            <Banner tone="danger" icon="alert-circle-outline">
              Location (GPS) is turned off on this phone. Your manager sees that nothing is updating until you turn it back on.
            </Banner>
          )}
          {access !== null && !access.foreground && !isWeb && (
            <Button title="Open phone settings" variant="secondary" full onPress={() => Linking.openSettings()} />
          )}
        </Card>

        {Platform.OS === 'android' && (
          <>
            <SectionTitle title="Keep it running" />
            <Card style={{ gap: spacing.md }}>
              <Text style={type.small}>
                Some phones (Xiaomi, Oppo, Vivo, Realme, Samsung) stop apps in the background to save battery, which stops location updates. In SKFL&rsquo;s app settings, set Battery to &ldquo;Unrestricted&rdquo; / &ldquo;No restrictions&rdquo; and do not force-stop the app.
              </Text>
              <Button title="Open SKFL app settings" icon="settings-outline" variant="secondary" full onPress={() => Linking.openSettings()} />
            </Card>
          </>
        )}

        <SectionTitle title="What is shared" />
        <Card style={{ gap: spacing.md }}>
          <Point label="What" text="Latitude, longitude, accuracy and speed of each location update. Fake (mock) locations are ignored." />
          <Point label="Who can see it" text="The Boss, HR, your manager and their manager. Nobody else in the company." />
          <Point label="How long" text={`Kept for ${settings.location_retention_days} days, then deleted automatically.`} />
          <Point label="Your control" text="Turn this off at any time. Nothing new is collected while it is off, and your phone stops sending right away." />
        </Card>
      </View>
    </Screen>
  );
}

function Point({ label, text }: { label: string; text: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={type.bodyMedium}>{label}</Text>
      <Text style={type.small}>{text}</Text>
    </View>
  );
}
