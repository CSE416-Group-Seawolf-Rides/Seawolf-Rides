import { createHash } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { RideRequest } from '../../mobile/src/mvp/rideRequestModel';
import type { RideAmendment, RideAmendmentDecision, RideAmendmentType } from '../../mobile/src/mvp/rideAmendmentModel';
import { amendmentEntry, appendChatEntries, chatIdFor, chatTrip, readRideChatEntries, updateRideChatEntries } from './chatThreads';

const options = { cors: true };

async function requireUser(call: { auth?: { uid: string } }): Promise<string> {
  const uid = call.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to access this feature.');
  return uid;
}

const safeId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');

const proposalId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(value);

const onlyKeys = <T extends Record<string, unknown>>(source: unknown, keys: (keyof T)[]): Partial<T> => {
  if (!source || typeof source !== 'object') return {};
  const out: Partial<T> = {};
  for (const key of keys) {
    if (key in source) out[key] = (source as T)[key];
  }
  return out;
};

const amendmentAttemptPath = (requestId: string, id: string) =>
  `_amendmentAttempts/${createHash('sha256').update(JSON.stringify([requestId, id])).digest('hex')}`;

export const proposeRideAmendment = onCall(options, async (call) => {
  const uid = await requireUser(call);
  const data = onlyKeys<{
    requestId: string;
    proposalId: string;
    type: RideAmendmentType;
    proposedDeparture?: number;
    proposedPickupLabel?: string;
    note?: string;
  }>(call.data, ['requestId', 'proposalId', 'type', 'proposedDeparture', 'proposedPickupLabel', 'note']);

  if (!safeId(data.requestId) || !proposalId(data.proposalId)) {
    throw new HttpsError('invalid-argument', 'Invalid request or proposal identifier.');
  }

  const propId = data.proposalId as string;
  const reqId = data.requestId as string;
  const type = data.type;
  if (type !== 'TIME' && type !== 'LOCATION' && type !== 'BOTH') {
    throw new HttpsError('invalid-argument', 'Choose whether to adjust timing, pickup location, or both.');
  }

  const note = typeof data.note === 'string' ? data.note.trim().slice(0, 300) : undefined;
  const proposedDeparture = Number.isSafeInteger(data.proposedDeparture) ? Number(data.proposedDeparture) : undefined;
  const proposedPickupLabel = typeof data.proposedPickupLabel === 'string' ? data.proposedPickupLabel.trim() : undefined;

  if (type === 'TIME' || type === 'BOTH') {
    if (proposedDeparture === undefined) {
      throw new HttpsError('invalid-argument', 'Choose a proposed departure time.');
    }
  }

  if (type === 'LOCATION' || type === 'BOTH') {
    if (!proposedPickupLabel || proposedPickupLabel.length < 2 || proposedPickupLabel.length > 80) {
      throw new HttpsError('invalid-argument', 'Enter a valid pickup location (2 to 80 characters).');
    }
  }

  const db = getFirestore();
  const ref = db.doc(`rideRequests/${reqId}`);
  const operation = db.doc(amendmentAttemptPath(reqId, propId));

  return db.runTransaction(async (tx) => {
    const [snapshot, marker, attempt] = await tx.getAll(
      ref,
      db.doc(`_settledRequests/${reqId}`),
      operation,
    );

    const ride = snapshot.data() as RideRequest | undefined;
    if (!ride || (ride.driverId !== uid && ride.riderId !== uid)) {
      throw new HttpsError('permission-denied', 'Only this ride’s driver or rider can propose trip changes.');
    }

    if (attempt.exists) {
      const prev = attempt.data()!;
      if (prev.proposerId !== uid) {
        throw new HttpsError('aborted', 'This proposal identifier was already used.');
      }
      return { id: propId, status: prev.status };
    }

    const existing = ride.amendment;
    if (existing && existing.id === propId) {
      if (existing.proposerId !== uid) {
        throw new HttpsError('aborted', 'This proposal identifier was already used.');
      }
      return { id: existing.id, status: existing.status };
    }

    if (ride.status !== 'ACCEPTED' || marker.exists || ride.settledAt !== undefined || ride.cancellation) {
      throw new HttpsError('failed-precondition', 'Only active, confirmed rides can be amended.');
    }

    if (existing?.status === 'PENDING') {
      throw new HttpsError('failed-precondition', 'Respond to or cancel the pending trip change first.');
    }

    if (type === 'TIME' || type === 'BOTH') {
      if (proposedDeparture === ride.plan.departure) {
        throw new HttpsError('invalid-argument', 'Choose a departure time different from the current schedule.');
      }
      if (Math.abs(proposedDeparture! - ride.plan.departure) > 7200) {
        throw new HttpsError('invalid-argument', 'Trip amendments must remain within 2 hours of current departure.');
      }
    }

    if (type === 'LOCATION' || type === 'BOTH') {
      if (proposedPickupLabel === ride.pickupLabel) {
        throw new HttpsError('invalid-argument', 'Choose a pickup location different from the current location.');
      }
    }

    const timestamp = Date.now();
    const proposerId = uid;
    const recipientId = uid === ride.driverId ? ride.riderId : ride.driverId;
    const proposerName = uid === ride.driverId ? ride.driverName : ride.riderName;
    const recipientName = uid === ride.driverId ? ride.riderName : ride.driverName;

    const deltaSeconds = (type === 'TIME' || type === 'BOTH')
      ? (proposedDeparture! - ride.plan.departure)
      : undefined;

    const amendment: RideAmendment = {
      id: propId,
      type,
      proposerId,
      proposerName,
      recipientId,
      recipientName,
      status: 'PENDING',
      ...(deltaSeconds !== undefined ? {
        originalDeparture: ride.plan.departure,
        proposedDeparture,
        deltaSeconds,
      } : {}),
      ...(proposedPickupLabel ? {
        originalPickupLabel: ride.pickupLabel,
        proposedPickupLabel,
      } : {}),
      ...(note ? { note } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const threadRef = db.doc(`chats/${chatIdFor(ride.driverId, ride.riderId)}`);
    const [thread, entries] = await Promise.all([
      tx.get(threadRef),
      readRideChatEntries(tx, { ...ride, id: snapshot.id }),
    ]);

    const proposedRide: RideRequest = {
      ...ride,
      id: snapshot.id,
      amendment,
      updatedAt: timestamp,
    };

    tx.create(operation, amendment);
    tx.update(ref, { amendment, updatedAt: timestamp });
    updateRideChatEntries(tx, entries, proposedRide);
    appendChatEntries(tx, thread, proposedRide, [amendmentEntry(proposedRide, amendment, timestamp)]);

    return { id: amendment.id, status: amendment.status };
  });
});

export const respondToRideAmendment = onCall(options, async (call) => {
  const uid = await requireUser(call);
  const data = onlyKeys<{
    requestId: string;
    proposalId: string;
    decision: RideAmendmentDecision;
  }>(call.data, ['requestId', 'proposalId', 'decision']);

  if (
    !safeId(data.requestId) ||
    !proposalId(data.proposalId) ||
    !['ACCEPTED', 'DECLINED', 'CANCELLED'].includes(String(data.decision))
  ) {
    throw new HttpsError('invalid-argument', 'Choose a trip change and valid decision.');
  }

  const reqId = data.requestId as string;
  const propId = data.proposalId as string;
  const decision = data.decision as RideAmendmentDecision;

  const db = getFirestore();
  const ref = db.doc(`rideRequests/${reqId}`);
  const operation = db.doc(amendmentAttemptPath(reqId, propId));

  return db.runTransaction(async (tx) => {
    const [snapshot, marker] = await tx.getAll(
      ref,
      db.doc(`_settledRequests/${reqId}`),
    );

    const ride = snapshot.data() as RideRequest | undefined;
    const amendment = ride?.amendment;

    if (!ride || (ride.driverId !== uid && ride.riderId !== uid) || !amendment) {
      throw new HttpsError('permission-denied', 'This trip change is unavailable to your account.');
    }

    if (amendment.id !== propId) {
      throw new HttpsError('aborted', 'This trip change has been superseded.');
    }

    if (uid !== (decision === 'CANCELLED' ? amendment.proposerId : amendment.recipientId)) {
      throw new HttpsError('permission-denied', 'Only recipient can accept/decline; only proposer can cancel.');
    }

    if (amendment.status === decision) {
      return { status: amendment.status };
    }

    if (amendment.status !== 'PENDING') {
      throw new HttpsError('failed-precondition', 'This trip change was already answered or expired.');
    }

    if (ride.status !== 'ACCEPTED' || marker.exists || ride.settledAt !== undefined || ride.cancellation) {
      throw new HttpsError('failed-precondition', 'This ride is closed or cancelled.');
    }

    const timestamp = Date.now();
    const updatedAmendment: RideAmendment = {
      ...amendment,
      status: decision,
      updatedAt: timestamp,
    };

    let updatedPlan = { ...ride.plan };
    let updatedPickupLabel = ride.pickupLabel;

    if (decision === 'ACCEPTED') {
      if (amendment.type === 'TIME' || amendment.type === 'BOTH') {
        const delta = amendment.deltaSeconds ?? ((amendment.proposedDeparture ?? ride.plan.departure) - ride.plan.departure);
        updatedPlan = {
          ...ride.plan,
          departure: ride.plan.departure + delta,
          pickup: ride.plan.pickup + delta,
          vehicleCampusArrival: ride.plan.vehicleCampusArrival + delta,
          riderDestinationArrival: ride.plan.riderDestinationArrival + delta,
        };
      }
      if (amendment.type === 'LOCATION' || amendment.type === 'BOTH') {
        if (amendment.proposedPickupLabel) {
          updatedPickupLabel = amendment.proposedPickupLabel;
        }
      }
    }

    const answeredRide: RideRequest = {
      ...ride,
      id: snapshot.id,
      plan: updatedPlan,
      pickupLabel: updatedPickupLabel,
      amendment: updatedAmendment,
      updatedAt: timestamp,
    };

    const threadRef = db.doc(`chats/${chatIdFor(ride.driverId, ride.riderId)}`);
    const [thread, entries] = await Promise.all([
      tx.get(threadRef),
      readRideChatEntries(tx, answeredRide),
    ]);

    tx.set(operation, updatedAmendment, { merge: true });
    tx.update(ref, {
      plan: updatedPlan,
      pickupLabel: updatedPickupLabel,
      amendment: updatedAmendment,
      updatedAt: timestamp,
    });
    updateRideChatEntries(tx, entries, answeredRide);
    if (thread.exists && decision === 'ACCEPTED') {
      tx.update(threadRef, { trip: chatTrip(answeredRide) });
    }

    return { status: decision };
  });
});
