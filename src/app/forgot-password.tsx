import { router } from 'expo-router';
import { useState } from 'react';

import { AuthLink, OtpInput, PasswordStrength, ResendButton, TextLink, passwordMeetsRules } from '@/components/auth-kit';
import { AuthShell } from '@/components/AuthShell';
import { Banner, Button, TextField } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/providers/ToastProvider';

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

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());

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

  const changeEmail = () => {
    setError(null);
    setCode('');
    setPw('');
    setConfirm('');
    setStep('email');
  };

  const valid = code.length === 6 && passwordMeetsRules(pw) && pw === confirm;

  return (
    <AuthShell
      compactLogo
      eyebrow="Account recovery"
      title={step === 'email' ? 'Reset your password' : 'Set a new password'}
      subtitle={
        step === 'email'
          ? "We'll email you a 6-digit code to reset it."
          : `Enter the code sent to ${sentTo || email.trim()}, then choose a new password.`
      }
      below={<AuthLink lead="Remembered it?" action="Back to sign in" onPress={() => router.replace('/sign-in')} />}>
      {error && <Banner tone="danger">{error}</Banner>}
      {step === 'email' ? (
        <>
          <TextField
            label="Email"
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            placeholder="name@company.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            returnKeyType="send"
            onSubmitEditing={() => emailValid && !busy && send()}
          />
          <Button title="Send code" icon="send" size="lg" loading={busy} disabled={!emailValid} onPress={send} />
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
          <TextField label="New password" icon="lock-closed-outline" value={pw} onChangeText={setPw} placeholder="••••••••" secureToggle autoComplete="new-password" />
          {pw.length > 0 && <PasswordStrength password={pw} />}
          <TextField
            label="Confirm password"
            icon="lock-closed-outline"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="••••••••"
            secureToggle
            error={confirm && confirm !== pw ? 'Passwords do not match' : null}
          />
          <Button title="Change password" icon="checkmark" size="lg" loading={busy} disabled={!valid} onPress={reset} />
          <TextLink label="Use a different email" onPress={changeEmail} />
        </>
      )}
    </AuthShell>
  );
}
