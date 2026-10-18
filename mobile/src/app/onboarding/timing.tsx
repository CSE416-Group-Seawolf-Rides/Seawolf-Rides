import { Redirect } from 'expo-router';
import { MorningTimingStep } from '../../commute/steps/MorningTimingStep';
import { useOnboarding } from '../../onboarding/OnboardingProvider';
import { getStepProgress } from '../../onboarding/onboardingModel';
export default function TimingRoute() {
  const { draft, goToNextStep } = useOnboarding();
  if (!draft.role) return <Redirect href="/onboarding/role" />;
  return (
    <MorningTimingStep
      progress={getStepProgress(draft, 'timing')}
      onContinue={() => goToNextStep('timing')}
    />
  );
}
