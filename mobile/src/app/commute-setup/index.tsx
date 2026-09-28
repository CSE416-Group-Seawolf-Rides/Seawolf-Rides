import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useSession } from '../../auth/SessionProvider';
import { commuteToDraft, getNextCommuteStep } from '../../commute/commuteModel';
import { useCommuteDraft } from '../../commute/CommuteDraftProvider';
import { getCommuteSetupProgress } from '../../commute/commuteSetupProgress';
import { ReviewStep } from '../../commute/steps/ReviewStep';
import { StartAreaStep } from '../../commute/steps/StartAreaStep';
import { useCloseCommuteSetup } from '../../commute/useCloseCommuteSetup';
import { useCommuteRole } from '../../commute/useCommuteRole';

// With no commute yet, this is the first step of the guided setup. With one saved,
// it's a summary where each section can be edited on its own.
export default function CommuteSetupStartRoute() {
  const { commute } = useSession();
  // Decided once, so saving the very first commute doesn't flip this screen mid-flow.
  const [editing] = useState(() => commute !== null);

  return editing ? <CommuteSummary /> : <GuidedStart />;
}

function GuidedStart() {
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

function CommuteSummary() {
  const role = useCommuteRole();
  const close = useCloseCommuteSetup();
  const { commute } = useSession();
  const { resetDraft } = useCommuteDraft();

  // Coming back from a step without saving drops that step's unsaved changes.
  useFocusEffect(
    useCallback(() => {
      resetDraft(commuteToDraft(commute));
    }, [commute, resetDraft]),
  );

  return (
    <ReviewStep
      leading="close"
      onEdit={(step) => router.push(`/commute-setup/${step}?edit=1`)}
      onLeadingPress={close}
      onSave={close}
      role={role}
      saveLabel="Done"
      subtitle="Tap Edit on just the part you want to change. Each change saves on its own."
      title="Your commute"
    />
  );
}
