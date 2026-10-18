import type { CreateRideRequestInput, RideRequest } from '../mvp/rideRequestModel';
import { requestCanCancel, requestRecipient } from '../mvp/rideRequestModel';
import type { ChatMatchDetails } from './chatModel';

/** Same proposal/role/departure semantics as the Rides review queue. */
export function chatRequestActions(request: RideRequest, uid: string, now: number) {
  if (!request.participantIds.includes(uid) || request.status !== 'PENDING') return 'NONE';
  if (requestCanCancel(request, uid)) return 'CANCEL';
  return requestRecipient(request) === uid && request.plan.departure > now ? 'DECIDE' : 'NONE';
}
/** A compact chat card is informational; only a refreshed canonical match can be sent. */
export function chatRequestInput(details: ChatMatchDetails): CreateRideRequestInput {
  const { match, localDate } = details;
  return { source: 'CALENDAR', direction: 'TO_CAMPUS', localDate,
    driverId: match.driverId, riderId: match.riderId,
    driverRevision: match.driverRevision, riderRevision: match.riderRevision,
    proposedPlan: { departure: match.plan.departure, pickup: match.plan.pickup,
      vehicleCampusArrival: match.plan.vehicleCampusArrival } };
}
