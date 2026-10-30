import { createHash } from 'node:crypto';
import { getFirestore, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { RideRequest } from '../../mobile/src/mvp/rideRequestModel';
import { requestInitiator } from '../../mobile/src/mvp/rideRequestModel';
import type { ChatMessage } from '../../mobile/src/chat/chatModel';
import type { PriceChangeRequest } from '../../mobile/src/payments/priceChanges';

type Trip = Pick<RideRequest, 'driverId' | 'riderId' | 'driverName' | 'riderName' | 'localDate' | 'campusLabel' | 'plan'>;
/** One conversation per pair, even when Either participants swap roles or dates. */
export const chatIdFor = (driverId: string, riderId: string) =>
  createHash('sha256').update(JSON.stringify([driverId, riderId].sort())).digest('hex');
const hash = (parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
export const rideEntryId = (ride: Pick<RideRequest, 'id' | 'attemptId'>) => `ride-${hash([ride.id, ride.attemptId ?? 'legacy'])}`;
export const priceEntryId = (requestId: string, proposalId: string) => `price-${hash([requestId, proposalId])}`;
const cleanRide = (ride: RideRequest): RideRequest => JSON.parse(JSON.stringify(ride));
export function rideEntry(ride: RideRequest, sentAt = Date.now()) {
  return { id: rideEntryId(ride), type: 'RIDE_REQUEST' as const, requestId: ride.id,
    senderId: requestInitiator(ride), sentAt, text: `Ride request · ${ride.localDate}`,
    ride: cleanRide(ride) };
}
export function priceEntry(ride: RideRequest, change: PriceChangeRequest, sentAt = Date.now()) {
  return { id: priceEntryId(ride.id, change.id), type: 'PRICE_CHANGE' as const, requestId: ride.id,
    senderId: change.proposerId, sentAt, text: `Price-change request · ${ride.localDate}`,
    ride: cleanRide(ride), priceChange: change };
}

/** Append cards using the same counter as text. Their identity and position never change. */
export function appendChatEntries(tx: Transaction, thread: DocumentSnapshot, ride: RideRequest,
  entries: Omit<ChatMessage, 'sequence'>[], replaceContext = false) {
  if (!entries.length) return;
  const participants = [ride.driverId, ride.riderId].sort();
  if (thread.exists && JSON.stringify(thread.get('participantIds')) !== JSON.stringify(participants))
    throw new HttpsError('failed-precondition', 'This conversation is unavailable.');
  const count = thread.exists ? thread.get('messageCount') : 0;
  if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(count + entries.length))
    throw new HttpsError('failed-precondition', 'This conversation needs recovery.');
  entries.forEach(({ id, ...entry }, index) => tx.create(thread.ref.collection('messages').doc(id), {
    ...entry, sequence: count + index + 1,
  }));
  const latest = entries.reduce((a, b) => a.sentAt > b.sentAt ? a : b);
  // Older priced rides may have only timing and participants; do not make price actions
  // fail merely because optional historical display fields were never recorded.
  const context = JSON.parse(JSON.stringify({ requestId: ride.id, trip: chatTrip(ride), localDate: ride.localDate,
    campusLabel: ride.campusLabel, names: { [ride.driverId]: ride.driverName, [ride.riderId]: ride.riderName } }));
  const preview = !thread.exists || latest.sentAt >= thread.get('updatedAt')
    ? { updatedAt: latest.sentAt, lastMessage: latest.text } : {};
  if (!thread.exists) tx.create(thread.ref, {
    schemaVersion: 1, participantIds: participants, createdAt: latest.sentAt,
    ...context, ...preview, messageCount: count + entries.length,
  });
  else tx.update(thread.ref, {
    ...((replaceContext || !thread.get('requestId')) ? context : {}),
    ...preview, messageCount: count + entries.length,
  });
}

/** Read these before any transaction writes. Legacy records may not yet have cards. */
export async function readRideChatEntries(tx: Transaction, ride: RideRequest) {
  const messages = getFirestore().collection(`chats/${chatIdFor(ride.driverId, ride.riderId)}/messages`);
  const refs = [messages.doc(rideEntryId(ride))];
  if (ride.priceChange) refs.push(messages.doc(priceEntryId(ride.id, ride.priceChange.id)));
  return tx.getAll(...refs);
}
export function updateRideChatEntries(tx: Transaction, entries: DocumentSnapshot[], ride: RideRequest) {
  entries.forEach((entry) => {
    if (!entry.exists) return;
    tx.update(entry.ref, {
      ride: cleanRide(ride),
      ...(entry.get('type') === 'PRICE_CHANGE' && ride.priceChange?.id === entry.get('priceChange.id')
        ? { priceChange: ride.priceChange } : {}),
    });
  });
}
export function chatTrip(value: Trip) {
  return { driverId: value.driverId, riderId: value.riderId, localDate: value.localDate,
    campusLabel: value.campusLabel, departure: value.plan.departure, pickup: value.plan.pickup,
    vehicleCampusArrival: value.plan.vehicleCampusArrival };
}
/** Snapshot must be read before any transaction writes. Never reset message history. */
export function linkRequestChat(tx: Transaction, thread: DocumentSnapshot, value: Trip, requestId: string, newRequest?: RideRequest) {
  if (newRequest) {
    appendChatEntries(tx, thread, newRequest, [rideEntry(newRequest)], true);
    return thread.id;
  }
  const time = Date.now();
  const context = { requestId, trip: chatTrip(value), localDate: value.localDate, campusLabel: value.campusLabel,
    names: { [value.driverId]: value.driverName, [value.riderId]: value.riderName }, updatedAt: time };
  if (!thread.exists) tx.create(thread.ref, {
    schemaVersion: 1, participantIds: [value.driverId, value.riderId].sort(),
    createdAt: time, messageCount: 0, lastMessage: '', ...context,
  });
  // A stale duplicate action must not replace a newer dated request's context.
  else if (!thread.get('requestId')) tx.update(thread.ref, context);
  return thread.id;
}
