import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplash } from '@/components/AnimatedSplash';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <ToastProvider>
          <AuthProvider>
            <RootNavigator fontsReady={fontsLoaded || !!fontError} />
          </AuthProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { status, touch } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        touch(); // any tap resets the inactivity timer
        return false;
      }}>
      <StatusBar style={splashDone ? 'dark' : 'light'} />
      {/* Each auth state unlocks exactly one group of screens. Leaving a state
          sends the user back to "index", which redirects to the right place. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={status === 'signedOut'}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'needsMfa'}>
          <Stack.Screen name="mfa" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'needsPassword'}>
          <Stack.Screen name="change-password" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'needsConsent'}>
          <Stack.Screen name="consent" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'ready'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
      {fontsReady && !splashDone && <AnimatedSplash ready={status !== 'loading'} onFinish={() => setSplashDone(true)} />}
    </View>
  );
}
