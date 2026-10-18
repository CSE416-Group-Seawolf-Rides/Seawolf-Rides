import { router } from 'expo-router';
import { MorningTimingStep } from '../../commute/steps/MorningTimingStep';
import { useCommuteRole } from '../../commute/useCommuteRole';
import { useCommuteEdit } from '../../commute/useCommuteEdit';
import { getNextCommuteStep } from '../../commute/commuteModel';
import { getCommuteSetupProgress } from '../../commute/commuteSetupProgress';
export default function TimingRoute() {
  const role = useCommuteRole();
  const { editing, saveEdit } = useCommuteEdit();
  return (
    <MorningTimingStep
      progress={editing ? undefined : getCommuteSetupProgress(role, 'timing')}
      continueLabel={editing ? 'Save' : undefined}
      onContinue={
        editing
          ? saveEdit
          : () =>
              router.push(
                `/commute-setup/${getNextCommuteStep(role, 'timing')}`,
              )
      }
    />
  );
}
