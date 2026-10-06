import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  OtpInput,
  PASSWORD_RULES,
  PasswordStrength,
  passwordMeetsRules,
  ResendButton,
} from '@/components/auth-kit';
import {
  Banner,
  Button,
  Card,
  IconTile,
  PageHeader,
  Screen,
  TextField,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useMe } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme/tokens';

type Step = 'verifyCurrent' | 'verifyEmail' | 'setNew';
type VerifiedVia = 'currentPassword' | 'emailCode';

const MAX_ATTEMPTS = 3;

export default function UpdatePassword() {
  const { me } = useMe();
  const toast = useToast();
  const userEmail = me.email ?? '';

  const [step, setStep] = useState<Step>('verifyCurrent');
  const [verifiedVia, setVerifiedVia] = useState<VerifiedVia | null>(null);

  // Current password state (up to 3 attempts tracked internally)
  const [current, setCurrent] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Email verification code state
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  // New password state
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rulesOk = passwordMeetsRules(pw);
  const sameAsCurrent = verifiedVia === 'currentPassword' && !!current && !!pw && pw === current;
  const allOk =
    rulesOk &&
    pw === confirm &&
    !sameAsCurrent &&
    (verifiedVia === 'emailCode' ? code.trim().length === 6 : true);

  // Verify Current Password (3 attempts allowed internally)
  const handleVerifyCurrentPassword = async () => {
    if (!current.trim() || busy) return;
    setBusy(true);
    setVerifyError(null);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: current,
      });

      if (authErr) {
        const next = attemptsLeft - 1;
        setAttemptsLeft(next);
        setCurrent('');

        if (next <= 0) {
          // 3 failed attempts: automatically trigger verification code to user's email
          setVerifiedVia('emailCode');
          setStep('verifyEmail');
          toast('Attempts exceeded. Verification code sent to your email.', 'info');
          try {
            const r = await api.passwordResetStart(userEmail);
            setSentTo(r.sent_to || userEmail);
          } catch (sendErr) {
            setCodeError(errorMessage(sendErr));
          }
        } else {
          setVerifyError('Incorrect current password. Please try again.');
        }
        return;
      }

      // Current password verified successfully
      setVerifiedVia('currentPassword');
      setStep('setNew');
      toast('Current password verified', 'success');
    } catch (err) {
      setVerifyError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // User taps "Verify with email code": open code entry field immediately
  const handleRequestEmailCode = async () => {
    setVerifyError(null);
    setCodeError(null);
    setVerifiedVia('emailCode');
    setStep('verifyEmail');
    setBusy(true);
    try {
      const r = await api.passwordResetStart(userEmail);
      setSentTo(r.sent_to || userEmail);
      toast(`Verification code sent to ${r.sent_to || userEmail}`, 'info');
    } catch (err) {
      setCodeError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Continue to Set New Password after entering the 6-digit code
  const handleContinueWithCode = () => {
    if (code.trim().length !== 6) {
      setCodeError('Please enter the full 6-digit code');
      return;
    }
    setCodeError(null);
    setStep('setNew');
  };

  // Final step: update password
  const handleSaveNewPassword = async () => {
    if (!allOk || busy) return;
    setBusy(true);
    setSubmitError(null);
    try {
      if (verifiedVia === 'emailCode') {
        await api.passwordResetComplete(userEmail, code.trim(), pw);
      } else {
        const { error: updateErr } = await supabase.auth.updateUser({ password: pw });
        if (updateErr) throw updateErr;
      }

      toast('Password updated successfully', 'success');
      router.back();
    } catch (err) {
      const msg = errorMessage(err);
      setSubmitError(msg);
      // If code was invalid or expired, navigate back to email code step to re-enter
      if (
        verifiedVia === 'emailCode' &&
        (msg.toLowerCase().includes('code') || msg.toLowerCase().includes('tries'))
      ) {
        setCode('');
        setCodeError(msg);
        setStep('verifyEmail');
      }
    } finally {
      setBusy(false);
    }
  };

  const getPageHeaderProps = () => {
    switch (step) {
      case 'verifyCurrent':
        return {
          title: 'Change password',
          subtitle: 'Verify your current password to continue',
        };
      case 'verifyEmail':
        return {
          title: 'Verify email code',
          subtitle: 'Security verification via email OTP',
        };
      case 'setNew':
        return {
          title: 'Create new password',
          subtitle: 'Choose a strong and secure password',
        };
    }
  };

  const headerProps = getPageHeaderProps();

  return (
    <Screen header={<PageHeader title={headerProps.title} subtitle={headerProps.subtitle} />} keyboard>
      <View style={{ gap: spacing.lg }}>
        {/* STEP 1: Verify Current Password */}
        {step === 'verifyCurrent' && (
          <Card style={styles.card}>
            <View style={styles.headerRow}>
              <IconTile icon="lock-closed" color={colors.brand} bg={colors.brandSoft} size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.h3}>Current password</Text>
              </View>
            </View>

            {verifyError && (
              <Banner tone="danger" icon="alert-circle-outline">
                {verifyError}
              </Banner>
            )}

            <TextField
              label="Current password"
              placeholder="••••••••••••"
              icon="lock-closed-outline"
              value={current}
              onChangeText={(t) => {
                setCurrent(t);
                if (verifyError) setVerifyError(null);
              }}
              secureToggle
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleVerifyCurrentPassword}
            />

            <Button
              title="Verify password"
              icon="shield-checkmark-outline"
              size="lg"
              disabled={!current.trim() || busy}
              loading={busy}
              onPress={handleVerifyCurrentPassword}
            />

            <Button
              title="Verify with email code"
              variant="ghost"
              icon="mail-outline"
              disabled={busy}
              onPress={handleRequestEmailCode}
            />
          </Card>
        )}

        {/* STEP 2: Verify Email Code (opens when user clicks 'Verify with email code' or after 3 failed attempts) */}
        {step === 'verifyEmail' && (
          <Card style={styles.card}>
            <View style={styles.headerRow}>
              <IconTile icon="mail-outline" color={colors.brand} bg={colors.brandSoft} size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.h3}>Email verification</Text>
                <Text style={type.small}>
                  We sent a 6-digit code to {sentTo || userEmail}
                </Text>
              </View>
            </View>

            {codeError && (
              <Banner tone="danger" icon="alert-circle-outline">
                {codeError}
              </Banner>
            )}

            <View style={styles.otpBox}>
              <OtpInput
                value={code}
                onChange={(v) => {
                  setCode(v);
                  if (codeError) setCodeError(null);
                }}
                error={!!codeError}
                autoFocus
              />
            </View>

            <ResendButton
              onResend={async () => {
                const r = await api.passwordResetStart(userEmail);
                setSentTo(r.sent_to || userEmail);
                toast(`Fresh code sent to ${r.sent_to || userEmail}`, 'info');
              }}
            />

            <Button
              title="Continue to new password"
              icon="arrow-forward"
              size="lg"
              disabled={code.trim().length !== 6 || busy}
              loading={busy}
              onPress={handleContinueWithCode}
            />

            {attemptsLeft > 0 && (
              <Button
                title="Back to current password"
                variant="ghost"
                icon="arrow-back"
                disabled={busy}
                onPress={() => {
                  setStep('verifyCurrent');
                  setCodeError(null);
                }}
              />
            )}
          </Card>
        )}

        {/* STEP 3: Set New Password */}
        {step === 'setNew' && (
          <>
            {submitError && (
              <Banner tone="danger" icon="alert-circle-outline">
                {submitError}
              </Banner>
            )}

            {verifiedVia === 'currentPassword' ? (
              <Banner tone="success" icon="shield-checkmark">
                Current password verified. You can now set your new password.
              </Banner>
            ) : (
              <View style={{ gap: spacing.xs }}>
                <Banner tone="success" icon="mail-unread-outline">
                  Identity verified via email code.
                </Banner>
                <Pressable onPress={() => setStep('verifyEmail')} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
                  <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.brand }}>Change code</Text>
                </Pressable>
              </View>
            )}

            <Card style={styles.card}>
              <View style={styles.headerRow}>
                <IconTile icon="key" color={colors.brand} bg={colors.brandSoft} size={48} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.h3}>Set new password</Text>
                  <Text style={type.small}>Must meet all security rules below</Text>
                </View>
              </View>

              <View style={{ gap: spacing.md }}>
                <TextField
                  label="New password"
                  placeholder="••••••••••••"
                  icon="key-outline"
                  value={pw}
                  onChangeText={setPw}
                  secureToggle
                  autoComplete="new-password"
                  textContentType="newPassword"
                  error={
                    sameAsCurrent
                      ? 'New password must be different from your current password'
                      : null
                  }
                />

                {pw.length > 0 && <PasswordStrength password={pw} />}

                {pw.length === 0 && (
                  <View style={{ gap: 6, paddingVertical: 4 }}>
                    {PASSWORD_RULES.map(([label]) => (
                      <View
                        key={label}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="ellipse-outline" size={15} color={colors.textMuted} />
                        <Text
                          style={{
                            fontFamily: fonts.regular,
                            fontSize: 13,
                            color: colors.textSecondary,
                          }}>
                          {label}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <TextField
                  label="Confirm new password"
                  placeholder="••••••••••••"
                  icon="lock-closed-outline"
                  value={confirm}
                  onChangeText={setConfirm}
                  secureToggle
                  autoComplete="new-password"
                  textContentType="newPassword"
                  error={confirm && confirm !== pw ? 'Passwords do not match' : null}
                />
              </View>

              <Button
                title="Update password"
                size="lg"
                icon="checkmark"
                disabled={!allOk || busy}
                loading={busy}
                onPress={handleSaveNewPassword}
              />
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  otpBox: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    width: '100%',
  },
});
