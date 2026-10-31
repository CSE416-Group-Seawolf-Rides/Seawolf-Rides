import type { ChatMessage } from './chatModel';
import type { RideRequest } from '../mvp/rideRequestModel';
import { rideHasFinished } from '../payments/rideCompletion';

export const sameRideAttempt = (a: RideRequest | undefined, b: RideRequest) =>
  a?.id === b.id && a.attemptId === b.attemptId;

export function timelineRideStatus(ride: RideRequest, now: number) {
  if (ride.status === 'ACCEPTED') return rideHasFinished(ride, now) ? 'Completed' : 'Accepted';
  if (ride.status === 'PENDING') return ride.plan.departure <= now ? 'Expired' : 'Pending';
  return ride.status === 'CANCELLED' ? 'Cancelled' : 'Declined';
}
export function timelinePriceActions(entry: ChatMessage, uid: string): 'RESPOND' | 'WITHDRAW' | 'NONE' {
  const { ride, priceChange } = entry;
  if (entry.type !== 'PRICE_CHANGE' || !ride || !priceChange || priceChange.status !== 'PENDING'
      || ride.status !== 'ACCEPTED' || ride.settledAt !== undefined
      || (uid !== ride.driverId && uid !== ride.riderId)) return 'NONE';
  return priceChange.recipientId === uid ? 'RESPOND' : priceChange.proposerId === uid ? 'WITHDRAW' : 'NONE';
}
export const priceChangeLabel = (status: string) => ({
  PENDING: 'Pending', ACCEPTED: 'Accepted', DECLINED: 'Rejected', CANCELLED: 'Withdrawn', EXPIRED: 'Expired',
}[status] ?? status);

export function timelineAmendmentActions(entry: ChatMessage, uid: string): 'RESPOND' | 'WITHDRAW' | 'NONE' {
  const { ride, amendment } = entry;
  if (entry.type !== 'RIDE_AMENDMENT' || !ride || !amendment || amendment.status !== 'PENDING'
      || ride.status !== 'ACCEPTED' || ride.settledAt !== undefined
      || (uid !== ride.driverId && uid !== ride.riderId)) return 'NONE';
  return amendment.recipientId === uid ? 'RESPOND' : amendment.proposerId === uid ? 'WITHDRAW' : 'NONE';
}

export const amendmentStatusLabel = (status: string) => ({
  PENDING: 'Pending', ACCEPTED: 'Accepted', DECLINED: 'Declined', CANCELLED: 'Withdrawn',
}[status] ?? status);
