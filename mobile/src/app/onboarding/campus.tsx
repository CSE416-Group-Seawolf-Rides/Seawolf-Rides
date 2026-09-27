import { Redirect } from 'expo-router';

import { CampusStep } from '../../commute/steps/CampusStep';
import { getStepProgress } from '../../onboarding/onboardingModel';
import { useOnboarding } from '../../onboarding/OnboardingProvider';

export default function OnboardingCampusRoute() {
  const { draft, goToNextStep } = useOnboarding();

  if (!draft.role) {
    return <Redirect href="/onboarding/role" />;
  }

  return (
    <CampusStep
      onContinue={() => goToNextStep('campus')}
      progress={getStepProgress(draft, 'campus')} role={draft.role}
    />
  );
}
