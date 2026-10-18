import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase/firebase';
import { isValidRouteCoordinate } from '../routing/types';
import type { Coordinates } from '../commute/commuteModel';
import type { RideRequest } from '../mvp/rideRequestModel';
export interface AcceptedPickup {
  campus?: Coordinates;
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
        const value = snapshot.data();
        setState(value && isValidRouteCoordinate(value.driverStart) && isValidRouteCoordinate(value.riderPickup) &&
          (value.campus === undefined || isValidRouteCoordinate(value.campus))
          ? { id, pickup: value as AcceptedPickup }
          : { id, error: 'The confirmed pickup is unavailable for this trip.' });
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
