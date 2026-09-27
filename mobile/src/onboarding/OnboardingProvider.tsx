import { router } from 'expo-router';
import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

import {
  emptyOnboardingDraft,
  getNextStep,
  OnboardingDraft,
  OnboardingFlowStep,
} from './onboardingModel';

interface Onboarding {
  draft: OnboardingDraft;
  updateDraft: (changes: Partial<OnboardingDraft>) => void;
  goToNextStep: (current: OnboardingFlowStep, changes?: Partial<OnboardingDraft>) => void;
}

const OnboardingContext = createContext<Onboarding | null>(null);

export function OnboardingProvider({ children }: PropsWithChildren) {
  const [draft, setDraft] = useState<OnboardingDraft>(emptyOnboardingDraft);

  const onboarding = useMemo<Onboarding>(
    () => ({
      draft,
      updateDraft: (changes) => setDraft((current) => ({ ...current, ...changes })),
      goToNextStep: (current, changes = {}) => {
        // Later steps depend on answers (role, now vs. later), so apply them first.
        const nextDraft = { ...draft, ...changes };
        setDraft(nextDraft);
        router.push(`/onboarding/${getNextStep(nextDraft, current)}`);
      },
    }),
    [draft],
  );

  return <OnboardingContext.Provider value={onboarding}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): Onboarding {
  const onboarding = useContext(OnboardingContext);
  if (!onboarding) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return onboarding;
}
