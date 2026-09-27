import { Redirect } from 'expo-router';

import { ScheduleStep } from '../../commute/steps/ScheduleStep';
import { getStepProgress } from '../../onboarding/onboardingModel';
import { useOnboarding } from '../../onboarding/OnboardingProvider';

export default function OnboardingScheduleRoute() {
  const { draft, goToNextStep } = useOnboarding();

  if (!draft.role) {
    return <Redirect href="/onboarding/role" />;
  }

  return (
    <ScheduleStep
      onContinue={() => goToNextStep('schedule')}
      progress={getStepProgress(draft, 'schedule')} role={draft.role}
    />
  );
}
