import { Stack, type ErrorBoundaryProps } from 'expo-router';

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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      </Stack>
    </NotificationsProvider>
  );
}
