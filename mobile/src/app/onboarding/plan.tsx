import { ChoiceCard } from '../../components/flow/ChoiceCard';
import { FlowStep } from '../../components/flow/FlowStep';
import { getStepProgress, planOptions, planReactions } from '../../onboarding/onboardingModel';
import { useOnboarding } from '../../onboarding/OnboardingProvider';

export default function PlanStepRoute() {
  const { draft, updateDraft, goToNextStep } = useOnboarding();

  return (
    <FlowStep
      canContinue={draft.plan !== undefined}
      onContinue={() => goToNextStep('plan')}
      progress={getStepProgress(draft, 'plan')}
      reaction={draft.plan ? planReactions[draft.plan] : null}
      subtitle="Your weekly commute is how we find your matches."
      title={`Nice to meet you, ${draft.firstName.trim()}. Set up your commute now?`}
    >
      {planOptions(draft.role).map((option) => (
        <ChoiceCard
          description={option.description}
          key={option.value}
          onPress={() => updateDraft({ plan: option.value })}
          selected={draft.plan === option.value}
          title={option.title}
        />
      ))}
    </FlowStep>
  );
}
