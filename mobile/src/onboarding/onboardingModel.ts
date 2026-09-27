import type { CommuteStepId } from '../commute/commuteModel';
import { getCommuteSteps } from '../commute/commuteModel';

export type CommuteRole = 'driver' | 'rider' | 'both';
export type CommutePlan = 'now' | 'later';

export type OnboardingStepId = 'role' | 'name' | 'plan';
export type OnboardingFlowStep = OnboardingStepId | CommuteStepId;

export interface OnboardingDraft {
  role?: CommuteRole;
  firstName: string;
  plan?: CommutePlan;
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

export function planOptions(
  role: CommuteRole | undefined,
): { value: CommutePlan; title: string; description: string }[] {
  const payoff =
    role === 'driver'
      ? 'Riders on your route can start requesting seats.'
      : role === 'rider'
        ? 'See drivers who match your week right away.'
        : 'Get matched on the days you drive and the days you ride.';

  return [
    { value: 'now', title: 'Set it up now', description: `About 2 minutes. ${payoff}` },
    {
      value: 'later',
      title: 'I’ll do it later',
      description: 'Look around first. You can add it anytime from Home.',
    },
  ];
}

export const planReactions: Record<CommutePlan, string> = {
  now: 'Four quick steps: where you start, where you park, and your week.',
  later: 'No problem. Your matches will get much better once you add it.',
};

// The commute steps only join the flow when someone chooses to set it up now.
export function getOnboardingFlow(draft: OnboardingDraft): OnboardingFlowStep[] {
  const steps: OnboardingFlowStep[] = ['role', 'name', 'plan'];
  if (draft.plan === 'now' && draft.role) {
    steps.push(...getCommuteSteps(draft.role));
  }
  return steps;
}

export function getNextStep(
  draft: OnboardingDraft,
  current: OnboardingFlowStep,
): OnboardingFlowStep | 'done' {
  const steps = getOnboardingFlow(draft);
  return steps[steps.indexOf(current) + 1] ?? 'done';
}

// Progress counts the final "done" screen as the last segment, so the bar is never
// empty on the first question and only fills completely at the end.
export function getStepProgress(
  draft: OnboardingDraft,
  step: OnboardingFlowStep,
): { from: number; to: number } {
  const steps = getOnboardingFlow(draft);
  const index = steps.indexOf(step);
  return { from: index / (steps.length + 1), to: (index + 1) / (steps.length + 1) };
}

export function buildOnboardingProfile(draft: OnboardingDraft): OnboardingProfile {
  const firstName = draft.firstName.trim();
  if (!draft.role || !firstName) {
    throw new Error('A role and first name are required to finish onboarding.');
  }

  return { role: draft.role, firstName };
}
