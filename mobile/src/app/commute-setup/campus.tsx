import { router } from 'expo-router';

import { getNextCommuteStep } from '../../commute/commuteModel';
import { getCommuteSetupProgress } from '../../commute/commuteSetupProgress';
import { CampusStep } from '../../commute/steps/CampusStep';
import { useCommuteRole } from '../../commute/useCommuteRole';

export default function CommuteSetupCampusRoute() {
  const role = useCommuteRole();

  return (
    <CampusStep
      onContinue={() => router.push(`/commute-setup/${getNextCommuteStep(role, 'campus')}`)}
      progress={getCommuteSetupProgress(role, 'campus')} role={role}
    />
  );
}
