import { Stack } from 'expo-router';

import { colors } from '@/theme/tokens';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
    </Stack>
  );
}
