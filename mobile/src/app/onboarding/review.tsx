import { Redirect, router } from 'expo-router';

import { useSession } from '../../auth/SessionProvider';
import { buildCommuteSchedule } from '../../commute/commuteModel';
import { useCommuteDraft } from '../../commute/CommuteDraftProvider';
import { ReviewStep } from '../../commute/steps/ReviewStep';
import { getStepProgress } from '../../onboarding/onboardingModel';
import { useOnboarding } from '../../onboarding/OnboardingProvider';

export default function OnboardingReviewRoute() {
  const { draft } = useOnboarding();
  const { draft: commuteDraft } = useCommuteDraft();
  const { saveCommute } = useSession();

  if (!draft.role) {
    return <Redirect href="/onboarding/role" />;
  }
  const role = draft.role;

  return (
    <ReviewStep
      onEdit={(step) => router.navigate(`/onboarding/${step}`)}
      onSave={async () => {
        await saveCommute(buildCommuteSchedule(commuteDraft, role));
        router.push('/onboarding/done');
      }}
      progress={getStepProgress(draft, 'review')}
      role={role}
      saveLabel="Save my commute"
    />
  );
}
