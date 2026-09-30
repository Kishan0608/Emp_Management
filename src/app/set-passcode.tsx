import { AuthShell } from '@/components/AuthShell';
import { PasscodeSetup } from '@/components/PasscodeSetup';

/** Shown once after the first password sign-in on this phone. */
export default function SetPasscode() {
  return (
    <AuthShell compactLogo narrow title="Secure your app">
      <PasscodeSetup />
    </AuthShell>
  );
}
