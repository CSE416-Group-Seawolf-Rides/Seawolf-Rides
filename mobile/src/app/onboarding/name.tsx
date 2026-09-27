import { router } from 'expo-router';

import { TextField } from '../../components/TextField';
import { OnboardingStep } from '../../onboarding/components/OnboardingStep';
import { useOnboarding } from '../../onboarding/OnboardingProvider';

export default function NameStepRoute() {
  const { draft, updateDraft } = useOnboarding();
  const canContinue = draft.firstName.trim().length > 0;

  function finish() {
    if (canContinue) {
      router.push('/onboarding/done');
    }
  }

  return (
    <OnboardingStep
      canContinue={canContinue}
      continueLabel="Finish"
      onContinue={finish}
      step="name"
      subtitle="Drivers and riders will see this on your profile."
      title="Last one — what’s your first name?"
    >
      <TextField
        autoCapitalize="words"
        autoComplete="given-name"
        autoCorrect={false}
        autoFocus
        label="First name"
        onChangeText={(value) => updateDraft({ firstName: value })}
        onSubmitEditing={finish}
        placeholder="Your first name"
        returnKeyType="done"
        textContentType="givenName"
        value={draft.firstName}
      />
    </OnboardingStep>
  );
}
