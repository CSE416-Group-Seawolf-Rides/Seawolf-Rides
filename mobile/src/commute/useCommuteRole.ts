import { useSession } from '../auth/SessionProvider';
import type { CommuteRole } from '../onboarding/onboardingModel';

// Prototype sign-ins that skip onboarding have no role yet, so they get the most
// complete setup (seats and a driving/riding choice per day).
export function useCommuteRole(): CommuteRole {
  const { profile } = useSession();
  return profile?.role ?? 'both';
}
