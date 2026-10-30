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
  const [state, setState] = useState<{ participantId?: string; profile: PublicProfile | null }>({ profile: null });
  useEffect(() => {
    if (!participantId) return;
    let active = true;
    const update = (profile: PublicProfile | null) => { if (active) setState({ participantId, profile }); };
    try {
      const stop = subscribeToPublicProfile(
        getFirebaseFirestore(),
        participantId,
        update,
        () => update(null),
      );
      return () => { active = false; stop(); };
    } catch {
      update(null);
      return () => { active = false; };
    }
  }, [participantId]);
  return state.participantId === participantId ? state.profile : null;
}
