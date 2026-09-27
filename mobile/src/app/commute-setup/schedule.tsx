import { router } from 'expo-router';

import { getNextCommuteStep } from '../../commute/commuteModel';
import { getCommuteSetupProgress } from '../../commute/commuteSetupProgress';
import { ScheduleStep } from '../../commute/steps/ScheduleStep';
import { useCommuteRole } from '../../commute/useCommuteRole';

export default function CommuteSetupScheduleRoute() {
  const role = useCommuteRole();

  return (
    <ScheduleStep
      onContinue={() => router.push(`/commute-setup/${getNextCommuteStep(role, 'schedule')}`)}
      progress={getCommuteSetupProgress(role, 'schedule')} role={role}
    />
  );
}
