import { Ionicons } from '@expo/vector-icons';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { AuthShell } from '@/components/AuthShell';
import { AppText, Banner, Button, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme/tokens';

const RULES: [string, (p: string) => boolean][] = [
  ['At least 10 characters', (p) => p.length >= 10],
  ['Upper and lower case letters', (p) => /[A-Z]/.test(p) && /[a-z]/.test(p)],
  ['A number', (p) => /\d/.test(p)],
  ['A symbol', (p) => /[^A-Za-z0-9]/.test(p)],
];

/** Formats typed text as SKFL-XXXX-XXXX. */
function formatKey(t: string) {
  const raw = t.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^SKFL/, '').slice(0, 8);
  return raw.length === 0 ? '' : `SKFL-${raw.slice(0, 4)}${raw.length > 4 ? '-' + raw.slice(4) : ''}`;
}

/** One-time activation: email + key from the admin + own password. */
export default function Activate() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [key, setKey] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'awaiting_approval' | 'active' | null>(null);

  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && /^SKFL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key) && RULES.every(([, f]) => f(pw)) && pw === confirm;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const { data, error: e } = await supabase.functions.invoke('activate-account', { body: { email: email.trim(), key, password: pw } });
      if (e) {
        const body = e instanceof FunctionsHttpError ? await e.context.json().catch(() => null) : null;
        throw new Error(body?.error ?? errorMessage(e));
      }
      const status = (data as { status: 'awaiting_approval' | 'active' }).status;
      if (status === 'active') await signIn(email, pw);
      else setDone(status);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell icon="hourglass-outline" title="Account activated" subtitle="One last step: your administrator approves your account.">
        <Animated.View entering={ZoomIn.springify()} style={{ alignItems: 'center' }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark-done" size={38} color={colors.success} />
          </View>
        </Animated.View>
        <AppText variant="body" style={{ textAlign: 'center' }}>
          Your password is set. The Boss has been notified. As soon as your account is approved, you can sign in with your email and password.
        </AppText>
        <Button title="Back to sign in" icon="log-in-outline" size="lg" onPress={() => router.replace('/sign-in')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell icon="key-outline" title="Activate account" subtitle="Enter the activation key you received from your administrator. You only do this once.">
      {error && <Banner tone="danger">{error}</Banner>}
      <TextField label="Work email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <TextField
        label="Activation key"
        icon="key-outline"
        value={key}
        onChangeText={(t) => setKey(formatKey(t))}
        placeholder="SKFL-XXXX-XXXX"
        autoCapitalize="characters"
        autoCorrect={false}
        style={{ fontFamily: fonts.semibold, letterSpacing: 2 }}
      />
      <TextField label="Choose a password" icon="lock-closed-outline" value={pw} onChangeText={setPw} secureToggle autoComplete="new-password" textContentType="newPassword" />
      <View style={{ gap: 6 }}>
        {RULES.map(([label, fn]) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name={fn(pw) ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={fn(pw) ? colors.success : colors.textMuted} />
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: fn(pw) ? colors.text : colors.textSecondary }}>{label}</Text>
          </View>
        ))}
      </View>
      <TextField label="Confirm password" icon="lock-closed-outline" value={confirm} onChangeText={setConfirm} secureToggle error={confirm && confirm !== pw ? 'Passwords do not match' : null} />
      <Button title="Activate my account" icon="shield-checkmark" size="lg" disabled={!valid} loading={busy} onPress={submit} />
      <Button title="I already have a password" variant="ghost" onPress={() => router.replace('/sign-in')} />
    </AuthShell>
  );
}
