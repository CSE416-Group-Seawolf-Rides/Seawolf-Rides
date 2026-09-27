import type { CommuteRole } from '../onboarding/onboardingModel';
import { CommuteStepId, getCommuteSteps } from './commuteModel';

export function getCommuteSetupProgress(
  role: CommuteRole,
  step: CommuteStepId,
): { from: number; to: number } {
  const steps = getCommuteSteps(role);
  const index = steps.indexOf(step);
  return { from: index / steps.length, to: (index + 1) / steps.length };
}
