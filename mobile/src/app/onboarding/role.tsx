import { ChoiceCard } from '../../components/flow/ChoiceCard';
import { FlowStep } from '../../components/flow/FlowStep';
import { getStepProgress, roleOptions, roleReactions } from '../../onboarding/onboardingModel';
import { useOnboarding } from '../../onboarding/OnboardingProvider';

export default function RoleStepRoute() {
  const { draft, updateDraft, goToNextStep } = useOnboarding();

  return (
    <FlowStep
      canContinue={draft.role !== undefined}
      onContinue={() => goToNextStep('role')}
      progress={getStepProgress(draft, 'role')}
      reaction={draft.role ? roleReactions[draft.role] : null}
      subtitle="You can change this anytime."
      title="How will you get to campus?"
    >
      {roleOptions.map((option) => (
        <ChoiceCard
          description={option.description}
          key={option.value}
          onPress={() => updateDraft({ role: option.value })}
          selected={draft.role === option.value}
          title={option.title}
        />
      ))}
    </FlowStep>
  );
}
