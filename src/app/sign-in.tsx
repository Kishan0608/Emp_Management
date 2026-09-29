import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { AppText, Banner, Button, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

const DEMO = [
  ['Boss', 'boss@example.com'],
  ['HR', 'hr@example.com'],
  ['Manager', 'manager@example.com'],
  ['Employee', 'neha@example.com'],
] as const;

export default function SignIn() {
  const { signIn, notice, clearNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    clearNotice();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter your work email.');
    if (password.length < 6) return setError('Enter your password.');
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell icon="log-in-outline" title="Welcome back" subtitle="Sign in with the work account your administrator created for you.">
      {notice && <Banner tone="warning">{notice}</Banner>}
      {error && <Banner tone="danger">{error}</Banner>}
      <TextField
        label="Work email"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        placeholder="you@company.com"
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
      <Button title="Sign in" icon="arrow-forward" size="lg" loading={busy} onPress={submit} />
      <AppText variant="small" style={{ textAlign: 'center' }}>
        Access is invite-only. Forgot your password? Ask HR to reset it.
      </AppText>

      {__DEV__ && (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <AppText variant="caption">Demo accounts · password Demo@2026</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {DEMO.map(([label, mail]) => (
              <Pressable
                key={mail}
                onPress={() => {
                  setEmail(mail);
                  setPassword('Demo@2026');
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: radius.pill,
                  backgroundColor: pressed ? colors.brandTint : colors.brandSoft,
                })}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: colors.brand }}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </AuthShell>
  );
}
