import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { useVehicle } from '../vehicle/vehicleClient';
import { VehicleRequiredSheet } from '../vehicle/VehicleRequiredSheet';
import { decideRideRequest, cancelRideRequest } from './rideRequestClient';
import type { RideRequest } from './rideRequestModel';
import { friendlyRideError } from './rideErrors';

const partnerOf = (item: RideRequest, uid?: string) => (item.driverId === uid ? item.riderName : item.driverName);

export function useRideDecision() {
  const { user } = useSession();
  const vehicle = useVehicle(user?.id);
  const [vehicleRequired, setVehicleRequired] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const decide = async (item: RideRequest, decision: 'ACCEPTED' | 'DECLINED') => {
    if (submitting.current) return;
    if (decision === 'ACCEPTED' && item.driverId === user?.id && !vehicle.vehicle) {
      if (vehicle.loaded) setVehicleRequired(true);
      else setError(vehicle.error ?? 'Wait for your vehicle details to load.');
      return;
    }
    submitting.current = true;
    setBusy(item.id);
    setError(null);
    try {
      await decideRideRequest(item.id, decision, item.attemptId);
    } catch (caught) {
      if (
        caught &&
        typeof caught === 'object' &&
        'details' in caught &&
        (caught.details as { reason?: string })?.reason === 'VEHICLE_REQUIRED' &&
        item.driverId === user?.id
      )
        setVehicleRequired(true);
      else {
        // A dialog says what happened and what to do next, instead of a raw server message.
        const copy = friendlyRideError(caught, decision === 'ACCEPTED' ? 'accept' : 'decline', partnerOf(item, user?.id));
        Alert.alert(copy.title, copy.message);
      }
    } finally {
      submitting.current = false;
      setBusy(null);
    }
  };
  const cancel = async (item: RideRequest) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(item.id);
    setError(null);
    try {
      await cancelRideRequest(item);
    } catch (caught) {
      const copy = friendlyRideError(caught, 'cancel', partnerOf(item, user?.id));
      Alert.alert(copy.title, copy.message);
    } finally {
      submitting.current = false;
      setBusy(null);
    }
  };
  return {
    busy,
    error,
    decide,
    cancel,
    sheet: (
      <VehicleRequiredSheet visible={vehicleRequired} onClose={() => setVehicleRequired(false)} />
    ),
  };
}
