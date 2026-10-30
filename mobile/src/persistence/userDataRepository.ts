import {
  Firestore,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

import type { CommuteSchedule } from '../commute/commuteModel';
import type { OnboardingProfile } from '../onboarding/onboardingModel';
import {
  PRIMARY_COMMUTE_ID,
  parseCommuteDocument,
  parseUserProfileDocument,
  profileWithPublicDetails,
  toCommuteDocument,
  toUserProfileDocument,
} from './userDataModel';

export interface PersistedUserData {
  profile: OnboardingProfile | null;
  commute: CommuteSchedule | null;
}

function userDocument(database: Firestore, userId: string) {
  return doc(database, 'users', userId);
}

function primaryCommuteDocument(database: Firestore, userId: string) {
  return doc(database, 'users', userId, 'commutes', PRIMARY_COMMUTE_ID);
}

function publicProfileDocument(database: Firestore, userId: string) {
  return doc(database, 'publicProfiles', userId);
}

function safeParseProfile(
  privateData: unknown,
  publicData: unknown,
  userId: string,
): OnboardingProfile | null {
  try {
    const privateProfile = parseUserProfileDocument(privateData);
    return profileWithPublicDetails(privateProfile, publicData, userId);
  } catch (err) {
    console.warn('[loadUserData] Failed to parse private profile, needs onboarding:', err);
    return null;
  }
}

function safeParseCommute(data: unknown, userId: string): CommuteSchedule | null {
  try {
    return parseCommuteDocument(data, userId);
  } catch (err) {
    console.warn('[loadUserData] Failed to parse commute schedule:', err);
    return null;
  }
}

export async function loadUserData(
  database: Firestore,
  userId: string,
): Promise<PersistedUserData> {
  const [profileSnapshot, commuteSnapshot, publicSnapshot] = await Promise.all([
    getDoc(userDocument(database, userId)),
    getDoc(primaryCommuteDocument(database, userId)),
    getDoc(publicProfileDocument(database, userId)).catch((err) => {
      console.warn('[loadUserData] Public profile load non-fatal failure:', err);
      return null;
    }),
  ]);

  return {
    profile: profileSnapshot.exists()
      ? safeParseProfile(profileSnapshot.data(), publicSnapshot?.data(), userId)
      : null,
    commute: commuteSnapshot.exists()
      ? safeParseCommute(commuteSnapshot.data(), userId)
      : null,
  };
}

/** Preserve the private profile/commute versions referenced by pending ride requests. */
export async function saveProfileDetails(
  database: Firestore, userId: string, profile: OnboardingProfile,
): Promise<OnboardingProfile> {
  return runTransaction(database, async (transaction) => {
    const current = await transaction.get(userDocument(database, userId));
    const privateProfile = parseUserProfileDocument(current.data());
    const stored = toUserProfileDocument({ ...profile, role: privateProfile.role });
    transaction.set(publicProfileDocument(database, userId), {
      schemaVersion: stored.schemaVersion, ownerId: userId, displayName: stored.firstName,
      role: stored.role,
      ...(stored.bio ? { bio: stored.bio } : {}),
      ...(stored.photoBase64 ? { photoBase64: stored.photoBase64 } : {}),
      updatedAt: serverTimestamp(),
    });
    return parseUserProfileDocument(stored);
  });
}

export async function saveUserData(
  database: Firestore,
  userId: string,
  profile: OnboardingProfile,
  commute: CommuteSchedule | null,
): Promise<void> {
  const batch = writeBatch(database);
  batch.set(
    userDocument(database, userId),
    { ...toUserProfileDocument(profile), updatedAt: serverTimestamp() },
  );
  const storedProfile = toUserProfileDocument(profile);
  batch.set(publicProfileDocument(database, userId), {
    schemaVersion: storedProfile.schemaVersion,
    ownerId: userId,
    displayName: storedProfile.firstName,
    role: storedProfile.role,
    ...(storedProfile.bio ? { bio: storedProfile.bio } : {}),
    ...(storedProfile.photoBase64 ? { photoBase64: storedProfile.photoBase64 } : {}),
    updatedAt: serverTimestamp(),
  });
  if (commute) {
    batch.set(
      primaryCommuteDocument(database, userId),
      { ...toCommuteDocument(userId, commute), updatedAt: serverTimestamp() },
    );
  }
  await batch.commit();
}

export async function savePrimaryCommute(
  database: Firestore,
  userId: string,
  commute: CommuteSchedule,
): Promise<void> {
  const batch = writeBatch(database);
  batch.set(
    primaryCommuteDocument(database, userId),
    { ...toCommuteDocument(userId, commute), updatedAt: serverTimestamp() },
  );
  await batch.commit();
}
