import { router } from 'expo-router';

import { getNextCommuteStep } from '../../commute/commuteModel';
import { getCommuteSetupProgress } from '../../commute/commuteSetupProgress';
import { StartAreaStep } from '../../commute/steps/StartAreaStep';
import { useCloseCommuteSetup } from '../../commute/useCloseCommuteSetup';
import { useCommuteRole } from '../../commute/useCommuteRole';

export default function CommuteSetupStartRoute() {
  const role = useCommuteRole();
  const close = useCloseCommuteSetup();

  return (
    <StartAreaStep
      leading="close"
      onContinue={() => router.push(`/commute-setup/${getNextCommuteStep(role, 'start')}`)}
      onLeadingPress={close}
      progress={getCommuteSetupProgress(role, 'start')}
    />
  );
}
