import { Redirect } from 'expo-router';

/** Google sign-in returns here; the session is handled in lib/oauth.ts, so just go to the start. */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
