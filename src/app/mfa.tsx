import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { AuthShell } from '@/components/AuthShell';
import { AppText, Banner, Button, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

type Mode = 'loading' | 'enroll' | 'verify';

/** Two-factor (TOTP) is mandatory for Boss and HR. The database refuses their actions without it. */
export default function Mfa() {
  const { refresh, signOut } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('loading');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: e } = await supabase.auth.mfa.listFactors();
        if (e) throw e;
        const verified = data.all.find((f) => f.factor_type === 'totp' && f.status === 'verified');
        if (verified) {
          setFactorId(verified.id);
          setMode('verify');
          return;
        }
        // Remove half-finished enrolments, then start a fresh one.
        for (const f of data.all.filter((f) => f.status === 'unverified')) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        const { data: en, error: enErr } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${Date.now()}` });
        if (enErr) throw enErr;
        setFactorId(en.id);
        setSecret(en.totp.secret);
        setQr(decodeSvg(en.totp.qr_code));
        setMode('enroll');
      } catch (err) {
        setError(errorMessage(err));
        setMode('verify');
      }
    })();
  }, []);

  const verify = async () => {
    if (!factorId || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (e) throw new Error(e.message.includes('Invalid') ? 'That code is not valid. Check the time on your phone and try again.' : e.message);
      toast(mode === 'enroll' ? 'Two-factor authentication is on' : 'Verified');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={mode === 'enroll' ? 'Set up two-factor' : 'Two-factor check'}
      subtitle={
        mode === 'enroll'
          ? 'Your role handles sensitive data, so a second step is required. Scan this code with Google Authenticator, Microsoft Authenticator or similar.'
          : 'Enter the 6-digit code from your authenticator app.'
      }>
      {mode === 'loading' && <ActivityIndicator color={colors.brand} />}
      {error && <Banner tone="danger">{error}</Banner>}

      {mode === 'enroll' && (
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <View style={styles.qrBox}>{qr ? <SvgXml xml={qr} width={180} height={180} /> : <ActivityIndicator />}</View>
          {secret && (
            <Pressable
              onPress={async () => {
                await Clipboard.setStringAsync(secret);
                toast('Setup key copied', 'info');
              }}
              style={styles.secret}>
              <AppText variant="caption">Or enter this key · tap to copy</AppText>
              <Text selectable style={styles.secretText}>
                {secret.match(/.{1,4}/g)?.join(' ')}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {mode !== 'loading' && (
        <>
          <TextField
            label="6-digit code"
            icon="keypad-outline"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            onSubmitEditing={verify}
            style={{ letterSpacing: 6, fontFamily: fonts.semibold, fontSize: 18 }}
          />
          <Button title={mode === 'enroll' ? 'Turn on and continue' : 'Verify'} size="lg" loading={busy} disabled={code.length !== 6} onPress={verify} />
          <Button title="Use a different account" variant="ghost" onPress={() => signOut()} />
        </>
      )}
    </AuthShell>
  );
}

function decodeSvg(dataUri: string): string {
  const raw = dataUri.replace(/^data:image\/svg\+xml;(utf-8|utf8|charset=utf-8)?,?/, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const styles = StyleSheet.create({
  qrBox: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  secret: { alignItems: 'center', gap: 4, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignSelf: 'stretch' },
  secretText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text, letterSpacing: 1, textAlign: 'center' },
});
