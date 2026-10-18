import { createHash } from 'node:crypto';
import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import type { RideRequest } from '../../mobile/src/mvp/rideRequestModel';

type Trip = Pick<RideRequest, 'driverId' | 'riderId' | 'driverName' | 'riderName' | 'localDate' | 'campusLabel' | 'plan'>;
/** One conversation per pair, even when Either participants swap roles or dates. */
export const chatIdFor = (driverId: string, riderId: string) =>
  createHash('sha256').update(JSON.stringify([driverId, riderId].sort())).digest('hex');
export function chatTrip(value: Trip) {
  return { driverId: value.driverId, riderId: value.riderId, localDate: value.localDate,
    campusLabel: value.campusLabel, departure: value.plan.departure, pickup: value.plan.pickup,
    vehicleCampusArrival: value.plan.vehicleCampusArrival };
}
/** Snapshot must be read before any transaction writes. Never reset message history. */
export function linkRequestChat(tx: Transaction, thread: DocumentSnapshot, value: Trip, requestId: string, replace = false) {
  const time = Date.now();
  const context = { requestId, trip: chatTrip(value), localDate: value.localDate, campusLabel: value.campusLabel,
    names: { [value.driverId]: value.driverName, [value.riderId]: value.riderName }, updatedAt: time };
  if (!thread.exists) tx.create(thread.ref, {
    schemaVersion: 1, participantIds: [value.driverId, value.riderId].sort(),
    createdAt: time, messageCount: 0, lastMessage: '', ...context,
  });
  // A stale duplicate action must not replace a newer dated request's context.
  else if (replace || !thread.get('requestId')) tx.update(thread.ref, context);
  return thread.id;
}
