import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseFirestore, getFirebaseFunctions } from '../firebase/firebase';
import { parseMatchingSetup, type MatchingSetup } from './settings';
import type { MatchResponse } from './service';

export function watchMatchingSetup(
  uid: string,
  receive: (setup: MatchingSetup | null) => void,
  fail: (error: Error) => void,
) {
  return onSnapshot(
    doc(getFirebaseFirestore(), 'matchingSetups', uid),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.hasPendingWrites) return;
      try {
        receive(snapshot.exists() ? parseMatchingSetup(snapshot.data(), uid) : null);
      } catch (error) {
        fail(error instanceof Error ? error : new Error('Could not load matching setup.'));
      }
    },
    fail,
  );
}
export function saveMatchingSetup(setup: MatchingSetup): Promise<void> {
  return setDoc(doc(getFirebaseFirestore(), 'matchingSetups', setup.ownerId), {
    ...parseMatchingSetup(setup, setup.ownerId),
    updatedAt: serverTimestamp(),
  });
}
export async function searchMatchingDrivers(
  localDate: string,
  revision: string,
): Promise<MatchResponse> {
  const call = httpsCallable<
    { localDate: string; revision: string; direction: string },
    MatchResponse
  >(getFirebaseFunctions(), 'findCompatibleDrivers', { timeout: 300000 });
  return (await call({ localDate, revision, direction: 'TO_CAMPUS' })).data;
}
