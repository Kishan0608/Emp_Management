import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '@/providers/AuthProvider';

/** Entry point: sends each auth state to its screen. */
export default function Index() {
  const { status } = useAuth();
  switch (status) {
    case 'signedOut':
      return <Redirect href="/sign-in" />;
    case 'needsOnboarding':
      return <Redirect href="/onboarding" />;
    case 'needsMfa':
      return <Redirect href="/mfa" />;
    case 'needsPassword':
      return <Redirect href="/change-password" />;
    case 'needsConsent':
      return <Redirect href="/consent" />;
    case 'needsPasscode':
      return <Redirect href="/set-passcode" />;
    case 'ready':
      return <Redirect href="/home" />;
    default:
      return <View style={{ flex: 1, backgroundColor: '#3A3935' }} />;
  }
}
