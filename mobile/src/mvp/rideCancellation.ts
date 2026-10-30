import type { RideRequest } from './rideRequestModel';

export const MAX_CANCELLATION_REASON_LENGTH = 500;

export function cancellationReason(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > MAX_CANCELLATION_REASON_LENGTH) return;
  const reason = value.trim();
  return reason.length > 0 ? reason : undefined;
}

/** Completed/paid rides keep their history and gas share. Either participant can cancel before then. */
export function acceptedRideCanCancel(ride: RideRequest, uid: string, now: number): boolean {
  const vehicleArrival = ride.plan?.vehicleCampusArrival;
  const riderArrival = ride.plan?.riderDestinationArrival;
  return ride.status === 'ACCEPTED'
    && (uid === ride.driverId || uid === ride.riderId)
    && ride.settledAt === undefined
    && Number.isFinite(vehicleArrival) && vehicleArrival > 0
    && Number.isFinite(riderArrival) && riderArrival > 0
    && Math.max(vehicleArrival, riderArrival) > now;
}
