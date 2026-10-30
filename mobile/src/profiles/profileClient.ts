import { doc, onSnapshot, type Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { getFirebaseFirestore } from '../firebase/firebase';
import { parsePublicProfile, type PublicProfile } from './publicProfiles';

export function subscribeToPublicProfile(
  database: Firestore,
  participantId: string,
  onValue: (profile: PublicProfile | null) => void,
  onError: () => void,
): () => void {
  return onSnapshot(doc(database, 'publicProfiles', participantId), (snapshot) => {
    if (!snapshot.exists()) {
      onValue(null);
      return;
    }
    try {
      onValue(parsePublicProfile(snapshot.data(), participantId));
    } catch {
      onError();
    }
  }, onError);
}

export function usePublicProfile(participantId: string | undefined) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  useEffect(() => {
    if (!participantId) return;
    return subscribeToPublicProfile(
      getFirebaseFirestore(),
      participantId,
      setProfile,
      () => setProfile(null),
    );
  }, [participantId]);
  return profile;
}
