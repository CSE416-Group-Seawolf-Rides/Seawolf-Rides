import { router } from 'expo-router';
import { Alert } from 'react-native';

import { useSession } from '../../auth/SessionProvider';
import { buildCommuteSchedule } from '../../commute/commuteModel';
import { useCommuteDraft } from '../../commute/CommuteDraftProvider';
import { getCommuteSetupProgress } from '../../commute/commuteSetupProgress';
import { ReviewStep } from '../../commute/steps/ReviewStep';
import { useCloseCommuteSetup } from '../../commute/useCloseCommuteSetup';
import { useCommuteRole } from '../../commute/useCommuteRole';

export default function CommuteSetupReviewRoute() {
  const role = useCommuteRole();
  const close = useCloseCommuteSetup();
  const { draft } = useCommuteDraft();
  const { saveCommute } = useSession();

  return (
    <ReviewStep
      onEdit={(step) => router.navigate(step === 'start' ? '/commute-setup' : `/commute-setup/${step}`)}
      onSave={async () => {
        try {
          await saveCommute(buildCommuteSchedule(draft, role));
          close();
        } catch {
          Alert.alert('Couldn’t save your commute', 'Check your connection and try again.');
        }
      }}
      progress={getCommuteSetupProgress(role, 'review')}
      role={role}
      saveLabel="Save my commute"
    />
  );
}
