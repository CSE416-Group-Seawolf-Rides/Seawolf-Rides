import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFirestore, getFirebaseFunctions } from '../firebase/firebase';
import type { CreateRideRequestInput, RideRequest, RideRequestResult } from './rideRequestModel';
import { participantRequestsQuery } from './rideRequestQuery';

export async function sendRideRequest(input: CreateRideRequestInput): Promise<RideRequestResult> {
  return (
    await httpsCallable<CreateRideRequestInput, RideRequestResult>(
      getFirebaseFunctions(),
      'createRideRequest',
      { timeout: 120000 },
    )({
      ...input,
      attemptId: input.attemptId ?? doc(collection(getFirebaseFirestore(), 'rideRequests')).id,
    })
  ).data;
}
export async function decideRideRequest(
  requestId: string,
  decision: 'ACCEPTED' | 'DECLINED',
  attemptId?: string,
) {
  return (
    await httpsCallable<
      { requestId: string; decision: string; attemptId?: string },
      RideRequestResult
    >(getFirebaseFunctions(), 'respondToRideRequest', { timeout: 120000 })({
      requestId,
      decision,
      ...(attemptId ? { attemptId } : {}),
    })
  ).data;
}

export async function cancelRideRequest(request: RideRequest): Promise<RideRequestResult> {
  return (
    await httpsCallable<{ requestId: string; attemptId?: string }, RideRequestResult>(
      getFirebaseFunctions(),
      'cancelRideRequest',
      { timeout: 120000 },
    )({ requestId: request.id, ...(request.attemptId ? { attemptId: request.attemptId } : {}) })
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
      participantRequestsQuery(getFirebaseFirestore(), uid),
      (snapshot) => {
        if (!active) return;
        setState({
          uid,
          loaded: true,
          error: null,
          // The local demo needs every participant-owned record to derive future carpools
          // and history. An arbitrary document-ID limit can hide upcoming rides.
          truncated: false,
          items: snapshot.docs
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
