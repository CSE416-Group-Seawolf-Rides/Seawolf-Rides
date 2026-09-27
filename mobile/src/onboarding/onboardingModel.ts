export type CommuteRole = 'driver' | 'rider' | 'both';

export type OnboardingStepId = 'role' | 'name';

export interface OnboardingDraft {
  role?: CommuteRole;
  firstName: string;
}

export interface OnboardingProfile {
  role: CommuteRole;
  firstName: string;
}

export const emptyOnboardingDraft: OnboardingDraft = {
  firstName: '',
};

export const roleOptions: { value: CommuteRole; title: string; description: string }[] = [
  { value: 'driver', title: 'I’ll drive', description: 'Share the empty seats on trips you already make.' },
  { value: 'rider', title: 'I need a ride', description: 'Find a driver already heading to campus.' },
  { value: 'both', title: 'A bit of both', description: 'Drive some days, ride on the others.' },
];

export const roleLabels: Record<CommuteRole, string> = {
  driver: 'Driver',
  rider: 'Rider',
  both: 'Driver and rider',
};

export const roleReactions: Record<CommuteRole, string> = {
  driver: 'Nice. Riders heading your way will be able to request your empty seats.',
  rider: 'Great. We’ll show you drivers who already make the trip.',
  both: 'Best of both. Drive on the days that suit you and ride on the rest.',
};

// Commute details (destination, days, arrival times, seats) are intentionally left
// out until the team settles those requirements.
export const onboardingSteps: OnboardingStepId[] = ['role', 'name'];

export function getNextStep(current: OnboardingStepId): OnboardingStepId | 'done' {
  return onboardingSteps[onboardingSteps.indexOf(current) + 1] ?? 'done';
}

// Progress counts the final "done" screen as the last segment, so the bar is never
// empty on the first question and only fills completely at the end.
export function getStepProgress(step: OnboardingStepId): number {
  return (onboardingSteps.indexOf(step) + 1) / (onboardingSteps.length + 1);
}

export function buildOnboardingProfile(draft: OnboardingDraft): OnboardingProfile {
  const firstName = draft.firstName.trim();
  if (!draft.role || !firstName) {
    throw new Error('A role and first name are required to finish onboarding.');
  }

  return { role: draft.role, firstName };
}
