import { Redirect } from 'expo-router';

import { SeatsStep } from '../../commute/steps/SeatsStep';
import { getStepProgress } from '../../onboarding/onboardingModel';
import { useOnboarding } from '../../onboarding/OnboardingProvider';

export default function OnboardingSeatsRoute() {
  const { draft, goToNextStep } = useOnboarding();

  if (!draft.role) {
    return <Redirect href="/onboarding/role" />;
  }

  return (
    <SeatsStep
      onContinue={() => goToNextStep('seats')}
      progress={getStepProgress(draft, 'seats')}
    />
  );
}
