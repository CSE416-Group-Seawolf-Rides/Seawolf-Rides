import { StartAreaStep } from '../../commute/steps/StartAreaStep';
import { useCommuteEdit } from '../../commute/useCommuteEdit';

// Only reached from the commute summary; the guided flow's first step is the index.
export default function CommuteSetupStartEditRoute() {
  const { saveEdit } = useCommuteEdit();
  return <StartAreaStep continueLabel="Save" onContinue={saveEdit} />;
}
