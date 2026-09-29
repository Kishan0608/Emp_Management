import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AuthLink, GoogleButton, OrDivider } from '@/components/auth-kit';
import { AuthShell } from '@/components/AuthShell';
import { Banner, Button, TextField } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme/tokens';

const RULES: [string, (p: string) => boolean][] = [
  ['At least 10 characters', (p) => p.length >= 10],
  ['Upper and lower case letters', (p) => /[A-Z]/.test(p) && /[a-z]/.test(p)],
  ['A number', (p) => /\d/.test(p)],
  ['A symbol', (p) => /[^A-Za-z0-9]/.test(p)],
];

/** Step 1 of self sign-up. The next steps (email code, key/QR, profile, approver code) run in /onboarding. */
export default function SignUp() {
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState<'create' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && RULES.every(([, f]) => f(pw)) && pw === confirm;

  const create = async () => {
    setError(null);
    setBusy('create');
    try {
      await api.signupStart(email.trim(), pw);
      await signIn(email, pw); // opens onboarding at the email-code step
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
      title="Create account"
      subtitle="Join your team at Shree Karni Fabcom Ltd"
      below={<AuthLink lead="Already have an account?" action="Sign in" onPress={() => router.replace('/sign-in')} />}>
      {error && <Banner tone="danger">{error}</Banner>}
      <TextField label="Email" icon="mail-outline" value={email} onChangeText={setEmail} placeholder="you@gmail.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <TextField
        label="Password"
        icon="lock-closed-outline"
        value={pw}
        onChangeText={setPw}
        placeholder="••••••••"
        secureToggle
        autoComplete="new-password"
        textContentType="newPassword"
      />
      {pw.length > 0 && (
        <View style={{ gap: 6 }}>
          {RULES.map(([label, fn]) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={fn(pw) ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={fn(pw) ? colors.success : colors.textMuted} />
              <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: fn(pw) ? colors.text : colors.textSecondary }}>{label}</Text>
            </View>
          ))}
        </View>
      )}
      <TextField
        label="Confirm password"
        icon="lock-closed-outline"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="••••••••"
        secureToggle
        error={confirm && confirm !== pw ? 'Passwords do not match' : null}
      />
      <Button title="Create account" icon="arrow-forward" size="lg" disabled={!valid || !!busy} loading={busy === 'create'} onPress={create} />
      <OrDivider />
      <GoogleButton onPress={google} loading={busy === 'google'} label="Sign up with Google" />
    </AuthShell>
  );
}
