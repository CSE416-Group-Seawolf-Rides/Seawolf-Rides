import { Redirect } from 'expo-router';

import { StartAreaStep } from '../../commute/steps/StartAreaStep';
import { getStepProgress } from '../../onboarding/onboardingModel';
import { useOnboarding } from '../../onboarding/OnboardingProvider';

export default function OnboardingStartRoute() {
  const { draft, goToNextStep } = useOnboarding();

  if (!draft.role) {
    return <Redirect href="/onboarding/role" />;
  }

  return (
    <StartAreaStep
      onContinue={() => goToNextStep('start')}
      progress={getStepProgress(draft, 'start')}
    />
  );
}
