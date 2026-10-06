import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AuthLink, GoogleButton, OrDivider, TextLink } from '@/components/auth-kit';
import { AuthShell } from '@/components/AuthShell';
import { Banner, Button, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { primeOrganizations } from '@/lib/orgCache';
import { useAuth } from '@/providers/AuthProvider';
import { spacing } from '@/theme/tokens';

export default function SignIn() {
  const { signIn, signInWithGoogle, notice, clearNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'password' | 'google' | null>(null);

  // The sign-up form needs the company list; start fetching it now so it is
  // usually already on hand by the time someone taps "Create account" below.
  useEffect(() => {
    primeOrganizations().catch(() => {});
  }, []);

  const submit = async () => {
    setError(null);
    clearNotice();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter your email address.');
    if (!password) return setError('Enter your password.');
    setBusy('password');
    try {
      await signIn(email, password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const google = async () => {
    setError(null);
    setBusy('google');
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthShell
      compactLogo
      title="Welcome back"
      subtitle="Sign in to continue to your workspace"
      below={<AuthLink lead="New to SKFL?" action="Create account" onPress={() => router.push('/sign-up')} />}>
      {notice && <Banner tone="warning">{notice}</Banner>}
      {error && <Banner tone="danger">{error}</Banner>}
      <TextField
        label="Email"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        placeholder="name@company.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        returnKeyType="next"
      />
      <TextField
        label="Password"
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secureToggle
        autoComplete="password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <View style={{ marginTop: -spacing.xs, marginBottom: 2 }}>
        <TextLink label="Forgot password?" align="flex-end" onPress={() => router.push('/forgot-password')} />
      </View>
      <Button title="Sign in" icon="arrow-forward" size="md" loading={busy === 'password'} disabled={!!busy} onPress={submit} />
      <OrDivider />
      <GoogleButton onPress={google} loading={busy === 'google'} />
    </AuthShell>
  );
}
