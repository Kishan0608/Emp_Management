import { router } from 'expo-router';

import { PasscodeSetup } from '@/components/PasscodeSetup';
import { Card, PageHeader, Screen } from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';

export default function ChangePasscode() {
  const toast = useToast();
  return (
    <Screen header={<PageHeader title="Change passcode" subtitle="Used to open SKFL on this phone" />}>
      <Card>
        <PasscodeSetup
          offerBiometrics={false}
          onDone={() => {
            toast('Passcode changed');
            router.back();
          }}
        />
      </Card>
    </Screen>
  );
}
