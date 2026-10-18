import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase/firebase';
import type { Coordinates } from '../commute/commuteModel';
import type { RideRequest } from '../mvp/rideRequestModel';
export interface AcceptedPickup {
  driverStart: Coordinates;
  riderPickup: Coordinates;
}
export function useAcceptedPickup(request?: RideRequest) {
  const [state, setState] = useState<{
    id?: string;
    pickup?: AcceptedPickup;
    error?: string;
  }>({});
  const id =
    request?.status === 'ACCEPTED' && request.source === 'CALENDAR' ? request.id : undefined;
  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(getFirebaseFirestore(), 'ridePickups', id),
      (snapshot) => {
        setState({
          id,
          pickup: snapshot.exists() ? (snapshot.data() as AcceptedPickup) : undefined,
        });
      },
      () =>
        setState({
          id,
          error: 'Could not load your confirmed pickup. Retry when connected.',
        }),
    );
  }, [id]);
  return id && state.id === id ? state : {};
}
