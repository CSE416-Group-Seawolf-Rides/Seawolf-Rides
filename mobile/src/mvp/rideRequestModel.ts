import type { MatchCard } from './service';
import type { RidePrice } from '../payments/pricing';
import type { PriceChangeRequest } from '../payments/priceChanges';

export type RideRequestStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';
/** Server-owned dated request. ACCEPTED is the persisted ride/reservation record. */
export interface RideRequest {
  id: string;
  schemaVersion: 1;
  source?: 'CALENDAR';
  participantIds: string[];
  /** Absent on legacy rider-initiated records. */
  initiatorId?: string;
  /** Identifies a particular proposal so stale actions cannot affect a resend. */
  attemptId?: string;
  driverId: string;
  riderId: string;
  driverName: string;
  riderName: string;
  localDate: string;
  direction: 'TO_CAMPUS';
  status: RideRequestStatus;
  riderRevision: string;
  driverRevision: string;
  seats: number;
  pickupLabel: string;
  campusLabel: string;
  plan: MatchCard['plan'];
  metrics: MatchCard['metrics'];
  /** Gas share locked when the request was sent. Absent on older records. */
  price?: RidePrice;
  /** Last price-change proposal; only its recipient can accept or decline. */
  priceChange?: PriceChangeRequest;
  /** Marking a payment locks this ride's price permanently. */
  settledAt?: number;
  /** Present only when a confirmed ride was cancelled, rather than a pending ask. */
  cancellation?: {
    cancelledBy: string;
    reason: string;
    cancelledAt: number;
  };
  createdAt: number;
  updatedAt: number;
}

export interface CreateRideRequestInput {
  riderId?: string;
  attemptId?: string;
  source?: 'CALENDAR';
  proposedPlan?: { departure: number; pickup: number; vehicleCampusArrival: number };
  driverId: string;
  localDate: string;
  riderRevision: string;
  driverRevision: string;
  direction: 'TO_CAMPUS';
}
export interface RideRequestResult {
  /** Shared conversation opened by a successful request creation/retry. */
  chatId?: string;
  id: string;
  status: RideRequestStatus;
  attemptId?: string;
}

/** Legacy requests were always initiated by the rider. */
export const requestInitiator = (request: RideRequest) => request.initiatorId ?? request.riderId;
export const requestRecipient = (request: RideRequest) =>
  requestInitiator(request) === request.driverId ? request.riderId : request.driverId;
export const requestCanCancel = (request: RideRequest, uid: string) =>
  request.status === 'PENDING' && requestInitiator(request) === uid;

/** An active proposal owns the pair/date even if an Either user changes the selected role. */
export function findTripRequest(
  requests: RideRequest[],
  pair: { driverId: string; riderId: string },
  date: string,
): RideRequest | undefined {
  const same = requests.filter(
    (request) =>
      request.localDate === date &&
      ((request.driverId === pair.driverId && request.riderId === pair.riderId) ||
        (request.driverId === pair.riderId && request.riderId === pair.driverId)),
  );
  return (
    same.find((request) => request.status === 'ACCEPTED' || request.status === 'PENDING') ??
    same.find((request) => request.driverId === pair.driverId && request.riderId === pair.riderId)
  );
}
