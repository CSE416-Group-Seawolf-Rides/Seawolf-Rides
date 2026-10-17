import { onAuthStateChanged } from 'firebase/auth';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { CommuteSchedule } from '../commute/commuteModel';
import { getFirebaseAuth, getFirebaseFirestore } from '../firebase/firebase';
import { OnboardingProfile } from '../onboarding/onboardingModel';
import { SaveCoordinator } from '../persistence/saveCoordinator';
import {
  loadUserData,
  savePrimaryCommute,
  saveUserData,
} from '../persistence/userDataRepository';
import { AuthUser, authUserFromFirebase, signOut as signOutFromFirebase } from './authService';

type SessionStatus = 'error' | 'loading' | 'ready';

interface Session {
  user: AuthUser | null;
  profile: OnboardingProfile | null;
  commute: CommuteSchedule | null;
  status: SessionStatus;
  error: string | null;
  needsOnboarding: boolean;
  completeOnboarding: (
    profile: OnboardingProfile,
    commute?: CommuteSchedule | null,
  ) => Promise<void>;
  saveCommute: (commute: CommuteSchedule) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [commute, setCommute] = useState<CommuteSchedule | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const loadVersion = useRef(0);
  const saves = useRef(new SaveCoordinator());

  const loadFirebaseUser = useCallback(async () => {
    const version = ++loadVersion.current;
    saves.current = new SaveCoordinator();
    const firebaseUser = getFirebaseAuth().currentUser;
    setStatus('loading');
    setError(null);

    if (!firebaseUser) {
      setUser(null);
      setProfile(null);
      setCommute(null);
      setStatus('ready');
      return;
    }

    if (!firebaseUser.emailVerified) {
      setUser(null);
      setProfile(null);
      setCommute(null);
      setStatus('ready');
      return;
    }

    let nextUser: AuthUser;
    try {
      nextUser = authUserFromFirebase(firebaseUser);
    } catch {
      setUser(null);
      setProfile(null);
      setCommute(null);
      setStatus('ready');
      return;
    }

    try {
      const persisted = await loadUserData(getFirebaseFirestore(), nextUser.id);
      if (version !== loadVersion.current) {
        return;
      }
      setUser(nextUser);
      setProfile(persisted.profile);
      setCommute(persisted.commute);
      setStatus('ready');
    } catch {
      if (version !== loadVersion.current) {
        return;
      }
      setUser(null);
      setProfile(null);
      setCommute(null);
      setError('We couldn’t load your account data. Check your connection and try again.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), () => {
      void loadFirebaseUser();
    });
    return unsubscribe;
  }, [loadFirebaseUser]);

  const completeOnboarding = useCallback(
    async (nextProfile: OnboardingProfile, nextCommute = commute) => {
      if (!user) {
        throw new Error('Sign in before saving an account.');
      }
      const version = loadVersion.current;
      await saves.current.run(
        JSON.stringify(['account', user.id, nextProfile, nextCommute]),
        async () => {
          await saveUserData(getFirebaseFirestore(), user.id, nextProfile, nextCommute);
          if (version === loadVersion.current && getFirebaseAuth().currentUser?.uid === user.id) {
            setProfile(nextProfile);
            setCommute(nextCommute);
          }
        },
      );
    },
    [commute, user],
  );

  const saveCommute = useCallback(
    async (nextCommute: CommuteSchedule) => {
      if (!user) {
        throw new Error('Sign in before saving a commute.');
      }
      // During first-time onboarding, hold the commute until the profile is
      // finalized so both documents can be committed together.
      if (profile) {
        const version = loadVersion.current;
        await saves.current.run(JSON.stringify(['commute', user.id, nextCommute]), async () => {
          await savePrimaryCommute(getFirebaseFirestore(), user.id, nextCommute);
          if (version === loadVersion.current && getFirebaseAuth().currentUser?.uid === user.id) {
            setCommute(nextCommute);
          }
        });
        return;
      }
      setCommute(nextCommute);
    },
    [profile, user],
  );

  const signOut = useCallback(async () => {
    await signOutFromFirebase();
    setUser(null);
    setProfile(null);
    setCommute(null);
  }, []);

  const session = useMemo<Session>(
    () => ({
      user,
      profile,
      commute,
      status,
      error,
      needsOnboarding: user !== null && profile === null,
      completeOnboarding,
      saveCommute,
      signOut,
      retry: loadFirebaseUser,
    }),
    [
      user,
      profile,
      commute,
      status,
      error,
      completeOnboarding,
      saveCommute,
      signOut,
      loadFirebaseUser,
    ],
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
