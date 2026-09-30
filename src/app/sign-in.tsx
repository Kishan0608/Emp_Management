import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { AuthLink, GoogleButton, OrDivider } from '@/components/auth-kit';
import { AuthShell } from '@/components/AuthShell';
import { Banner, Button, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts, spacing } from '@/theme/tokens';

export default function SignIn() {
  const { signIn, signInWithGoogle, notice, clearNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'password' | 'google' | null>(null);

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
        placeholder="you@gmail.com"
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
      <Button title="Sign in" icon="arrow-forward" size="lg" loading={busy === 'password'} disabled={!!busy} onPress={submit} />
      <Pressable onPress={() => router.push('/forgot-password')} hitSlop={8} style={{ alignSelf: 'center' }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.brand }}>Forgot password?</Text>
      </Pressable>
      <OrDivider />
      <GoogleButton onPress={google} loading={busy === 'google'} />
      <Pressable onPress={() => router.push('/activate')} hitSlop={8} style={{ alignSelf: 'center', marginTop: spacing.xs }}>
        <Text style={{ fontFamily: fonts.medium, fontSize: 12.5, color: colors.textMuted }}>Invited by your administrator? Activate with key</Text>
      </Pressable>
    </AuthShell>
  );
}
