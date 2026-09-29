import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AuthLink, OtpInput, ResendButton } from '@/components/auth-kit';
import { AuthShell } from '@/components/AuthShell';
import { Banner, Button, TextField } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts } from '@/theme/tokens';

const RULES: [string, (p: string) => boolean][] = [
  ['At least 10 characters', (p) => p.length >= 10],
  ['Upper and lower case letters', (p) => /[A-Z]/.test(p) && /[a-z]/.test(p)],
  ['A number', (p) => /\d/.test(p)],
  ['A symbol', (p) => /[^A-Za-z0-9]/.test(p)],
];

export default function ForgotPassword() {
  const toast = useToast();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await api.passwordResetStart(email.trim());
      setSentTo(r.sent_to);
      setStep('reset');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.passwordResetComplete(email.trim(), code, pw);
      toast('Password changed. Please sign in.');
      router.replace('/sign-in');
    } catch (e) {
      setError(errorMessage(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const valid = code.length === 6 && RULES.every(([, f]) => f(pw)) && pw === confirm;

  return (
    <AuthShell
      compactLogo
      title={step === 'email' ? 'Forgot password' : 'Choose a new password'}
      subtitle={step === 'email' ? 'Enter your email and we will send you a 6-digit code' : `If an account exists, a code was sent to ${sentTo}`}
      below={<AuthLink lead="Remembered it?" action="Back to sign in" onPress={() => router.replace('/sign-in')} />}>
      {error && <Banner tone="danger">{error}</Banner>}
      {step === 'email' ? (
        <>
          <TextField label="Email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Button title="Send code" icon="send" size="lg" loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} onPress={send} />
        </>
      ) : (
        <>
          <OtpInput value={code} onChange={setCode} error={!!error} />
          <ResendButton
            onResend={async () => {
              const r = await api.passwordResetStart(email.trim());
              toast(`A fresh code was sent to ${r.sent_to || 'your email'}`, 'info');
            }}
          />
          <TextField label="New password" icon="lock-closed-outline" value={pw} onChangeText={setPw} secureToggle autoComplete="new-password" />
          <View style={{ gap: 6 }}>
            {RULES.map(([label, fn]) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={fn(pw) ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={fn(pw) ? colors.success : colors.textMuted} />
                <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: fn(pw) ? colors.text : colors.textSecondary }}>{label}</Text>
              </View>
            ))}
          </View>
          <TextField label="Confirm password" icon="lock-closed-outline" value={confirm} onChangeText={setConfirm} secureToggle error={confirm && confirm !== pw ? 'Passwords do not match' : null} />
          <Button title="Change password" icon="checkmark" size="lg" loading={busy} disabled={!valid} onPress={reset} />
        </>
      )}
    </AuthShell>
  );
}
