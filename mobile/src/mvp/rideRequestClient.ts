import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFirestore, getFirebaseFunctions } from '../firebase/firebase';
import type { CreateRideRequestInput, RideRequest, RideRequestResult } from './rideRequestModel';

export async function sendRideRequest(input: CreateRideRequestInput): Promise<RideRequestResult> {
  return (
    await httpsCallable<CreateRideRequestInput, RideRequestResult>(
      getFirebaseFunctions(),
      'createRideRequest',
      { timeout: 120000 },
    )(input)
  ).data;
}
export async function decideRideRequest(requestId: string, decision: 'ACCEPTED' | 'DECLINED') {
  return (
    await httpsCallable<{ requestId: string; decision: string }, RideRequestResult>(
      getFirebaseFunctions(),
      'respondToRideRequest',
      { timeout: 120000 },
    )({ requestId, decision })
  ).data;
}

export function useRideRequests(uid?: string) {
  const [version, reload] = useState(0);
  const [state, setState] = useState<{
    uid?: string;
    items: RideRequest[];
    loaded: boolean;
    error: string | null;
    truncated: boolean;
  }>({ items: [], loaded: false, error: null, truncated: false });
  useEffect(() => {
    if (!uid) return;
    let active = true;
    const stop = onSnapshot(
      query(
        collection(getFirebaseFirestore(), 'rideRequests'),
        where('participantIds', 'array-contains', uid),
        limit(101),
      ),
      (snapshot) => {
        if (!active) return;
        setState({
          uid,
          loaded: true,
          error: null,
          truncated: snapshot.size > 100,
          items: snapshot.docs
            .slice(0, 100)
            .map((d) => ({ ...d.data(), id: d.id }) as RideRequest)
            .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)),
        });
      },
      (error) => {
        if (active)
          setState({ uid, items: [], loaded: true, error: error.message, truncated: false });
      },
    );
    return () => {
      active = false;
      stop();
    };
  }, [uid, version]);
  return {
    items: state.uid === uid && uid ? state.items : [],
    loaded: state.uid === uid && state.loaded,
    error: state.uid === uid ? state.error : null,
    truncated: state.uid === uid && state.truncated,
    retry: () => reload((v) => v + 1),
  };
}
