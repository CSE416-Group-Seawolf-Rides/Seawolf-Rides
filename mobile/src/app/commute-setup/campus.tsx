import { router } from 'expo-router';

import { getNextCommuteStep } from '../../commute/commuteModel';
import { getCommuteSetupProgress } from '../../commute/commuteSetupProgress';
import { CampusStep } from '../../commute/steps/CampusStep';
import { useCommuteEdit } from '../../commute/useCommuteEdit';
import { useCommuteRole } from '../../commute/useCommuteRole';

export default function CommuteSetupCampusRoute() {
  const role = useCommuteRole();
  const { editing, saveEdit } = useCommuteEdit();

  return editing ? (
    <CampusStep continueLabel="Save" onContinue={saveEdit} role={role} />
  ) : (
    <CampusStep
      onContinue={() => router.push(`/commute-setup/${getNextCommuteStep(role, 'campus')}`)}
      progress={getCommuteSetupProgress(role, 'campus')} role={role}
    />
  );
}
