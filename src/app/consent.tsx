import { useState } from 'react';

import { AuthShell } from '@/components/AuthShell';
import { PrivacyNotice } from '@/components/PrivacyNotice';
import { Banner, Button, SwitchRow } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

export default function Consent() {
  const { refresh, signOut } = useAuth();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthShell icon="document-lock-outline" title="Privacy notice" subtitle="Please read how your data is used before you continue.">
      <PrivacyNotice />
      {error && <Banner tone="danger">{error}</Banner>}
      <SwitchRow label="I have read and understood this notice" value={agree} onChange={setAgree} />
      <Button
        title="Accept and continue"
        size="lg"
        disabled={!agree}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await api.acceptPrivacy();
            await refresh();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button title="Decline and sign out" variant="ghost" onPress={() => signOut()} />
    </AuthShell>
  );
}
