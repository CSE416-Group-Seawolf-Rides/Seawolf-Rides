import type { RideRequest } from '../mvp/rideRequestModel';

// The same completion boundary is used by the tally and the trusted settlement callable.
// Missing or malformed timing never makes a ride payable.
export function rideHasFinished(request: Pick<RideRequest, 'plan'> | undefined, now: number): boolean {
  const vehicleArrival = request?.plan?.vehicleCampusArrival;
  const riderArrival = request?.plan?.riderDestinationArrival;
  return typeof vehicleArrival === 'number' && Number.isFinite(vehicleArrival) && vehicleArrival > 0
    && typeof riderArrival === 'number' && Number.isFinite(riderArrival) && riderArrival > 0
    && Math.max(vehicleArrival, riderArrival) <= now;
}
