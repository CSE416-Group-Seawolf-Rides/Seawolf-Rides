import { FlowStep } from '../../components/flow/FlowStep';
import { TextField } from '../../components/TextField';
import { getStepProgress } from '../../onboarding/onboardingModel';
import { useOnboarding } from '../../onboarding/OnboardingProvider';

export default function NameStepRoute() {
  const { draft, updateDraft, goToNextStep } = useOnboarding();
  const canContinue = draft.firstName.trim().length > 0;

  function next() {
    if (canContinue) {
      goToNextStep('name');
    }
  }

  return (
    <FlowStep
      canContinue={canContinue}
      onContinue={next}
      progress={getStepProgress(draft, 'name')}
      subtitle="Drivers and riders will see this on your profile."
      title="What’s your first name?"
    >
      <TextField
        autoCapitalize="words"
        autoComplete="given-name"
        autoCorrect={false}
        autoFocus
        label="First name"
        onChangeText={(value) => updateDraft({ firstName: value })}
        onSubmitEditing={next}
        placeholder="Your first name"
        returnKeyType="next"
        textContentType="givenName"
        value={draft.firstName}
      />
    </FlowStep>
  );
}
