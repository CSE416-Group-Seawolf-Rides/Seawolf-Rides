import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  getFirebaseFirestore,
  getFirebaseFunctions,
} from '../firebase/firebase';
import { parseVehicle, type VehicleDetails } from './vehicleModel';

export function useVehicle(uid?: string) {
  const [state, setState] = useState<{
    uid?: string;
    loaded: boolean;
    vehicle?: VehicleDetails;
    error?: string;
  }>({ loaded: false });
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(getFirebaseFirestore(), 'users', uid, 'vehicles', 'primary'),
      (snapshot) => {
        try {
          setState({
            uid,
            loaded: true,
            vehicle: snapshot.exists()
              ? parseVehicle(snapshot.data(), uid)
              : undefined,
          });
        } catch {
          setState({
            uid,
            loaded: true,
            error: 'Your vehicle details need updating.',
          });
        }
      },
      () =>
        setState({
          uid,
          loaded: false,
          error: 'Could not load your vehicle. Check your connection.',
        }),
    );
  }, [uid]);
  return state.uid === uid && uid
    ? state
    : { loaded: false, vehicle: undefined, error: undefined };
}
export async function saveVehicle(details: VehicleDetails) {
  await httpsCallable(getFirebaseFunctions(), 'saveVehicleDetails')(details);
}
