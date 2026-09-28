import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { Banner, Button, TextField } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { colors, fonts } from '@/theme/tokens';

const RULES: [string, (p: string) => boolean][] = [
  ['At least 10 characters', (p) => p.length >= 10],
  ['An uppercase and a lowercase letter', (p) => /[A-Z]/.test(p) && /[a-z]/.test(p)],
  ['A number', (p) => /\d/.test(p)],
  ['A symbol', (p) => /[^A-Za-z0-9]/.test(p)],
];

export default function ChangePassword() {
  const { refresh, signOut } = useAuth();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const allOk = RULES.every(([, fn]) => fn(pw)) && pw === confirm;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.updateUser({ password: pw });
      if (e) throw e;
      await api.passwordChanged();
      toast('Password updated');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Choose a new password" subtitle="You signed in with a one-time password. Set your own before continuing.">
      {error && <Banner tone="danger">{error}</Banner>}
      <TextField label="New password" icon="lock-closed-outline" value={pw} onChangeText={setPw} secureToggle autoComplete="new-password" textContentType="newPassword" />
      <View style={{ gap: 6 }}>
        {RULES.map(([label, fn]) => {
          const ok = fn(pw);
          return (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={ok ? colors.success : colors.textMuted} />
              <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: ok ? colors.text : colors.textSecondary }}>{label}</Text>
            </View>
          );
        })}
      </View>
      <TextField
        label="Confirm password"
        icon="lock-closed-outline"
        value={confirm}
        onChangeText={setConfirm}
        secureToggle
        error={confirm && confirm !== pw ? 'Passwords do not match' : null}
      />
      <Button title="Save password" size="lg" disabled={!allOk} loading={busy} onPress={save} />
      <Button title="Sign out" variant="ghost" onPress={() => signOut()} />
    </AuthShell>
  );
}
