import { useRef, useState } from 'react';
import { useSession } from '../auth/SessionProvider';
import { useVehicle } from '../vehicle/vehicleClient';
import { VehicleRequiredSheet } from '../vehicle/VehicleRequiredSheet';
import { decideRideRequest } from './rideRequestClient';
import type { RideRequest } from './rideRequestModel';

export function useRideDecision() {
  const { user } = useSession();
  const vehicle = useVehicle(user?.id);
  const [vehicleRequired, setVehicleRequired] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const decide = async (
    item: RideRequest,
    decision: 'ACCEPTED' | 'DECLINED',
  ) => {
    if (submitting.current) return;
    if (decision === 'ACCEPTED' && !vehicle.vehicle) {
      if (vehicle.loaded) setVehicleRequired(true);
      else setError(vehicle.error ?? 'Wait for your vehicle details to load.');
      return;
    }
    submitting.current = true;
    setBusy(item.id);
    setError(null);
    try {
      await decideRideRequest(item.id, decision);
    } catch (caught) {
      if (
        caught &&
        typeof caught === 'object' &&
        'details' in caught &&
        (caught.details as { reason?: string })?.reason === 'VEHICLE_REQUIRED'
      )
        setVehicleRequired(true);
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not save your decision. Retry.',
      );
    } finally {
      submitting.current = false;
      setBusy(null);
    }
  };
  return {
    busy,
    error,
    decide,
    sheet: (
      <VehicleRequiredSheet
        visible={vehicleRequired}
        onClose={() => setVehicleRequired(false)}
      />
    ),
  };
}
