import { router } from 'expo-router';

import { getNextCommuteStep } from '../../commute/commuteModel';
import { getCommuteSetupProgress } from '../../commute/commuteSetupProgress';
import { SeatsStep } from '../../commute/steps/SeatsStep';
import { useCommuteRole } from '../../commute/useCommuteRole';

export default function CommuteSetupSeatsRoute() {
  const role = useCommuteRole();

  return (
    <SeatsStep
      onContinue={() => router.push(`/commute-setup/${getNextCommuteStep(role, 'seats')}`)}
      progress={getCommuteSetupProgress(role, 'seats')}
    />
  );
}
