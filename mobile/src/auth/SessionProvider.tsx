import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

import { CommuteSchedule } from '../commute/commuteModel';
import { OnboardingProfile } from '../onboarding/onboardingModel';
import { demoCommute, demoProfileFor } from '../prototypeData/demoAccount';
import { AuthUser } from './authService';

interface Session {
  user: AuthUser | null;
  profile: OnboardingProfile | null;
  commute: CommuteSchedule | null;
  needsOnboarding: boolean;
  signIn: (user: AuthUser) => void;
  completeOnboarding: (profile: OnboardingProfile) => void;
  saveCommute: (commute: CommuteSchedule) => void;
  signOut: () => void;
}

const SessionContext = createContext<Session | null>(null);

// Frontend-only M2 session. It resets whenever the app reloads.
export function SessionProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [commute, setCommute] = useState<CommuteSchedule | null>(null);

  const session = useMemo<Session>(
    () => ({
      user,
      profile,
      commute,
      needsOnboarding: user !== null && user.isNewUser && profile === null,
      signIn: (nextUser) => {
        setUser(nextUser);
        // Returning users have no stored account yet, so they get the demo commuter.
        if (!nextUser.isNewUser) {
          setProfile(demoProfileFor(nextUser));
          setCommute(demoCommute);
        }
      },
      completeOnboarding: setProfile,
      saveCommute: setCommute,
      signOut: () => {
        setUser(null);
        setProfile(null);
        setCommute(null);
      },
    }),
    [user, profile, commute],
  );

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return session;
}
