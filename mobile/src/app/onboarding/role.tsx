import { ChoiceCard } from '../../onboarding/components/ChoiceCard';
import { OnboardingStep } from '../../onboarding/components/OnboardingStep';
import { roleOptions, roleReactions } from '../../onboarding/onboardingModel';
import { useOnboarding } from '../../onboarding/OnboardingProvider';

export default function RoleStepRoute() {
  const { draft, updateDraft, goToNextStep } = useOnboarding();

  return (
    <OnboardingStep
      canContinue={draft.role !== undefined}
      onContinue={() => goToNextStep('role')}
      reaction={draft.role ? roleReactions[draft.role] : null}
      step="role"
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
    </OnboardingStep>
  );
}
