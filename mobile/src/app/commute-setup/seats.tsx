import { router } from 'expo-router';

import { getNextCommuteStep } from '../../commute/commuteModel';
import { getCommuteSetupProgress } from '../../commute/commuteSetupProgress';
import { SeatsStep } from '../../commute/steps/SeatsStep';
import { useCommuteEdit } from '../../commute/useCommuteEdit';
import { useCommuteRole } from '../../commute/useCommuteRole';

export default function CommuteSetupSeatsRoute() {
  const role = useCommuteRole();
  const { editing, saveEdit } = useCommuteEdit();

  return editing ? (
    <SeatsStep continueLabel="Save" onContinue={saveEdit} />
  ) : (
    <SeatsStep
      onContinue={() => router.push(`/commute-setup/${getNextCommuteStep(role, 'seats')}`)}
      progress={getCommuteSetupProgress(role, 'seats')}
    />
  );
}
