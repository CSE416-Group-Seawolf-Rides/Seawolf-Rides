import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

import { OnboardingProfile } from '../onboarding/onboardingModel';
import { AuthUser } from './authService';

interface Session {
  user: AuthUser | null;
  profile: OnboardingProfile | null;
  needsOnboarding: boolean;
  signIn: (user: AuthUser) => void;
  completeOnboarding: (profile: OnboardingProfile) => void;
  signOut: () => void;
}

const SessionContext = createContext<Session | null>(null);

// Frontend-only M2 session. It resets whenever the app reloads.
export function SessionProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);

  const session = useMemo<Session>(
    () => ({
      user,
      profile,
      needsOnboarding: user !== null && user.isNewUser && profile === null,
      signIn: setUser,
      completeOnboarding: setProfile,
      signOut: () => {
        setUser(null);
        setProfile(null);
      },
    }),
    [user, profile],
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
