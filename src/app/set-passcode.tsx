import { AuthLink } from '@/components/auth-kit';
import { AuthShell } from '@/components/AuthShell';
import { PasscodeSetup } from '@/components/PasscodeSetup';
import { useAuth } from '@/providers/AuthProvider';

/** Shown once after the first password sign-in on this phone. */
export default function SetPasscode() {
  const { signOut } = useAuth();
  return (
    <AuthShell compactLogo title="Secure your app" subtitle="Next time, open SKFL with a passcode or fingerprint — no email and password." below={<AuthLink lead="Not you?" action="Sign out" onPress={() => signOut()} />}>
      <PasscodeSetup />
    </AuthShell>
  );
}
