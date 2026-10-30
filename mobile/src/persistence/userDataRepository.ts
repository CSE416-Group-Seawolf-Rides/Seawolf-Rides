import {
  Firestore,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

import type { CommuteSchedule } from '../commute/commuteModel';
import type { OnboardingProfile } from '../onboarding/onboardingModel';
import {
  PRIMARY_COMMUTE_ID,
  parseCommuteDocument,
  parseUserProfileDocument,
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

export async function loadUserData(
  database: Firestore,
  userId: string,
): Promise<PersistedUserData> {
  const [profileSnapshot, commuteSnapshot] = await Promise.all([
    getDoc(userDocument(database, userId)),
    getDoc(primaryCommuteDocument(database, userId)),
  ]);

  return {
    profile: profileSnapshot.exists()
      ? parseUserProfileDocument(profileSnapshot.data())
      : null,
    commute: commuteSnapshot.exists()
      ? parseCommuteDocument(commuteSnapshot.data(), userId)
      : null,
  };
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
