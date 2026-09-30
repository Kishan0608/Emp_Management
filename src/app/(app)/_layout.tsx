import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { Platform } from 'react-native';

import { ErrorScreen } from '@/components/ErrorScreen';
import { NotificationsProvider } from '@/providers/NotificationsProvider';
import { colors } from '@/theme/tokens';

/** If any signed-in screen fails, show a branded recovery screen; tabs and session stay intact. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ErrorScreen error={error} onRetry={retry} />;
}

export default function AppLayout() {
  return (
    <NotificationsProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          // Android: iOS-style parallax slide (smoother than the default). iOS: native push.
          animation: Platform.OS === 'android' ? 'ios_from_right' : 'default',
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
          animationMatchesGesture: true,
        }}>
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      </Stack>
    </NotificationsProvider>
  );
}
