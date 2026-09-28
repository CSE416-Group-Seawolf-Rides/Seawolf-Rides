import { router } from 'expo-router';

import { getNextCommuteStep } from '../../commute/commuteModel';
import { getCommuteSetupProgress } from '../../commute/commuteSetupProgress';
import { ScheduleStep } from '../../commute/steps/ScheduleStep';
import { useCommuteEdit } from '../../commute/useCommuteEdit';
import { useCommuteRole } from '../../commute/useCommuteRole';

export default function CommuteSetupScheduleRoute() {
  const role = useCommuteRole();
  const { editing, saveEdit } = useCommuteEdit();

  return editing ? (
    <ScheduleStep continueLabel="Save" onContinue={saveEdit} role={role} />
  ) : (
    <ScheduleStep
      onContinue={() => router.push(`/commute-setup/${getNextCommuteStep(role, 'schedule')}`)}
      progress={getCommuteSetupProgress(role, 'schedule')} role={role}
    />
  );
}
