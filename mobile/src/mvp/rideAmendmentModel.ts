import type { RideRequest } from './rideRequestModel';

export type RideAmendmentType = 'TIME' | 'LOCATION' | 'BOTH';
export type RideAmendmentDecision = 'ACCEPTED' | 'DECLINED' | 'CANCELLED';
export type RideAmendmentStatus = 'PENDING' | RideAmendmentDecision;

export interface RideAmendment {
  id: string;
  type: RideAmendmentType;
  proposerId: string;
  proposerName: string;
  recipientId: string;
  recipientName: string;
  status: RideAmendmentStatus;

  /** Departure epoch seconds prior to this amendment. */
  originalDeparture?: number;
  /** Proposed new departure epoch seconds. */
  proposedDeparture?: number;
  /** Shift in seconds (+ = later, - = earlier). */
  deltaSeconds?: number;

  /** Original pickup label prior to this amendment. */
  originalPickupLabel?: string;
  /** Proposed new pickup location label. */
  proposedPickupLabel?: string;

  /** Optional explanatory note from proposer. */
  note?: string;

  createdAt: number;
  updatedAt: number;
}

export function canProposeAmendment(ride: RideRequest, uid: string): boolean {
  if (ride.status !== 'ACCEPTED') return false;
  if (ride.cancellation) return false;
  if (ride.settledAt !== undefined) return false;
  if (uid !== ride.driverId && uid !== ride.riderId) return false;
  if (ride.amendment?.status === 'PENDING') return false;
  return true;
}

export function canRespondAmendment(ride: RideRequest, uid: string): boolean {
  if (ride.status !== 'ACCEPTED' || !ride.amendment) return false;
  if (ride.amendment.status !== 'PENDING') return false;
  return uid === ride.amendment.recipientId;
}

export function canCancelAmendment(ride: RideRequest, uid: string): boolean {
  if (ride.status !== 'ACCEPTED' || !ride.amendment) return false;
  if (ride.amendment.status !== 'PENDING') return false;
  return uid === ride.amendment.proposerId;
}

export function formatTimeDelta(deltaSeconds: number): string {
  const mins = Math.round(deltaSeconds / 60);
  if (mins === 0) return '0 min';
  return mins > 0 ? `+${mins} min` : `${mins} min`;
}

export function amendmentLabel(status: RideAmendmentStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Pending review';
    case 'ACCEPTED':
      return 'Accepted';
    case 'DECLINED':
      return 'Declined';
    case 'CANCELLED':
      return 'Cancelled';
  }
}

export function amendmentSummary(amendment: RideAmendment): string {
  const parts: string[] = [];
  if (amendment.type === 'TIME' || amendment.type === 'BOTH') {
    if (amendment.deltaSeconds !== undefined) {
      parts.push(`time ${formatTimeDelta(amendment.deltaSeconds)}`);
    } else {
      parts.push('time change');
    }
  }
  if (amendment.type === 'LOCATION' || amendment.type === 'BOTH') {
    parts.push(`pickup to ${amendment.proposedPickupLabel ?? 'new location'}`);
  }
  return parts.join(', ');
}
