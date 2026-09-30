import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

/**
 * Returns an Expo push token, or null when push is not available
 * (web, simulator, Expo Go, permission denied, or no EAS project id yet).
 * The database sends pushes through the Expo push service, which uses FCM/APNs.
 *
 * expo-notifications is loaded lazily: in Expo Go on Android (SDK 53+) merely
 * importing it throws, which would break every screen that imports this file.
 */
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null; // Expo Go

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;

  const Notifications = await import('expo-notifications');

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      // While the app is open the live in-app banner shows it instead.
      shouldPlaySound: false,
      shouldSetBadge: true,
      shouldShowBanner: false,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Updates',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return null;

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

function pushAvailable() {
  return Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

/**
 * Calls onTap with the push payload ({ kind, ref_table, ref_id }) when the person
 * taps a phone notification, including the one that launched the app.
 * Returns a function that stops listening.
 */
export async function listenForPushTaps(onTap: (data: Record<string, unknown>) => void): Promise<() => void> {
  if (!pushAvailable()) return () => {};
  const Notifications = await import('expo-notifications');
  const seen = new Set<string>();
  const handle = (r: { notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } } } | null) => {
    if (!r || seen.has(r.notification.request.identifier)) return;
    seen.add(r.notification.request.identifier);
    onTap(r.notification.request.content.data ?? {});
  };
  handle(await Notifications.getLastNotificationResponseAsync());
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
