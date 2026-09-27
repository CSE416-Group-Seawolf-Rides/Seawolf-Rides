import { router } from 'expo-router';
import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

import {
  emptyOnboardingDraft,
  getNextStep,
  OnboardingDraft,
  OnboardingStepId,
} from './onboardingModel';

interface Onboarding {
  draft: OnboardingDraft;
  updateDraft: (changes: Partial<OnboardingDraft>) => void;
  goToNextStep: (current: OnboardingStepId) => void;
}

const OnboardingContext = createContext<Onboarding | null>(null);

export function OnboardingProvider({ children }: PropsWithChildren) {
  const [draft, setDraft] = useState<OnboardingDraft>(emptyOnboardingDraft);

  const onboarding = useMemo<Onboarding>(
    () => ({
      draft,
      updateDraft: (changes) => setDraft((current) => ({ ...current, ...changes })),
      goToNextStep: (current) => router.push(`/onboarding/${getNextStep(current)}`),
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
