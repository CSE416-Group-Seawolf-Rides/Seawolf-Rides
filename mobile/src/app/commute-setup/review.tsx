import { router } from 'expo-router';
import { useRef } from 'react';

import { useSession } from '../../auth/SessionProvider';
import { buildCommuteSchedule } from '../../commute/commuteModel';
import { useCommuteDraft } from '../../commute/CommuteDraftProvider';
import { getCommuteSetupProgress } from '../../commute/commuteSetupProgress';
import { ReviewStep } from '../../commute/steps/ReviewStep';
import { useCloseCommuteSetup } from '../../commute/useCloseCommuteSetup';
import { useCommuteRole } from '../../commute/useCommuteRole';
import { SavePendingError, saveErrorMessage } from '../../persistence/saveCoordinator';
import { showAlert } from '../../components/showAlert';

export default function CommuteSetupReviewRoute() {
  const role = useCommuteRole();
  const close = useCloseCommuteSetup();
  const { draft } = useCommuteDraft();
  const { saveCommute } = useSession();
  const submitting = useRef(false);

  return (
    <ReviewStep
      onEdit={(step) => router.navigate(step === 'start' ? '/commute-setup' : `/commute-setup/${step}`)}
      onSave={async () => {
        if (submitting.current) {
          return;
        }
        submitting.current = true;
        try {
          await saveCommute(buildCommuteSchedule(draft, role));
          close();
        } catch (error) {
          showAlert(
            error instanceof SavePendingError ? 'Save still pending' : 'Couldn’t save your commute',
            saveErrorMessage(error, 'Check your connection and try again.'),
          );
        } finally {
          submitting.current = false;
        }
      }}
      progress={getCommuteSetupProgress(role, 'review')}
      role={role}
      saveLabel="Save my commute"
    />
  );
}
