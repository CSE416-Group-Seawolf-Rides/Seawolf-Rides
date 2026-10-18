import { createHash } from 'node:crypto';
import { getFirestore, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { findMatches, MatchingError, type SavedParticipant } from '../../mobile/src/mvp/service';
import {
  CAMPUS_POINTS,
  PUBLIC_POINTS,
  parseMatchingSetup,
  record,
} from '../../mobile/src/mvp/settings';
import {
  parseUserProfileDocument,
  parseCommuteDocument,
} from '../../mobile/src/persistence/userDataModel';
import type { RoutingAdapter } from '../../mobile/src/routing/types';
import type {
  CreateRideRequestInput,
  RideRequest,
  RideRequestResult,
} from '../../mobile/src/mvp/rideRequestModel';
import { eligible, withMatchingRouting } from './matchingRuntime';
import { DemoBusyError } from './demoRouting';

import { prepareCalendarPair } from './calendarMatching';
import { requestInitiator, requestRecipient } from '../../mobile/src/mvp/rideRequestModel';
import { isValidRouteCoordinate } from '../../mobile/src/routing/types';
import { vehicleIsComplete } from '../../mobile/src/vehicle/vehicleModel';

const digest = (parts: string[]) =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex');
export const requestIdFor = (rider: string, driver: string, date: string) =>
  digest([rider, driver, date, 'TO_CAMPUS']);
export const commitmentIdFor = (uid: string, date: string) => digest([uid, date, 'TO_CAMPUS']);
const now = () => Math.floor(Date.now() / 1000);
function localOnly() {
  if (
    process.env.FUNCTIONS_EMULATOR !== 'true' ||
    process.env.GCLOUD_PROJECT !== 'demo-seawolf-rides' ||
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST
  )
    throw new HttpsError(
      'failed-precondition',
      'Ride actions are available only in the demo-seawolf-rides emulators.',
    );
}
const uidValue = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');
const validAttempt = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(value);
function input(value: unknown): CreateRideRequestInput {
  if (
    !record(value) ||
    Object.keys(value)
      .filter((k) => !['source', 'proposedPlan', 'riderId', 'attemptId'].includes(k))
      .sort()
      .join(',') !== 'direction,driverId,driverRevision,localDate,riderRevision' ||
    (value.source !== undefined && value.source !== 'CALENDAR') ||
    (value.source === 'CALENDAR' &&
      (!record(value.proposedPlan) ||
        Object.keys(value.proposedPlan).sort().join(',') !==
          'departure,pickup,vehicleCampusArrival' ||
        !Object.values(value.proposedPlan).every(Number.isSafeInteger))) ||
    (value.source !== 'CALENDAR' && value.proposedPlan !== undefined) ||
    !uidValue(value.driverId) ||
    (value.riderId !== undefined && !uidValue(value.riderId)) ||
    (value.attemptId !== undefined && !validAttempt(value.attemptId)) ||
    typeof value.localDate !== 'string' ||
    value.direction !== 'TO_CAMPUS' ||
    typeof value.riderRevision !== 'string' ||
    typeof value.driverRevision !== 'string'
  )
    throw new HttpsError(
      'invalid-argument',
      'Supply the selected driver, date, inbound direction and both saved revisions.',
    );
  return value as unknown as CreateRideRequestInput;
}
async function participant(uid: string) {
  const db = getFirestore();
  const snapshots = await db.getAll(
    db.doc(`matchingSetups/${uid}`),
    db.doc(`users/${uid}`),
    db.doc(`users/${uid}/commutes/primary`),
  );
  const saved: SavedParticipant = {
    uid,
    eligible: await eligible(uid),
    setup: snapshots[0].data(),
    profile: snapshots[1].data(),
    commute: snapshots[2].data(),
  };
  return { saved, snapshots };
}

/** Canonical evaluation outside the transaction. Caller must supply the protected routing adapter. */
export async function preparePair(
  riderId: string,
  data: CreateRideRequestInput,
  routing: RoutingAdapter,
) {
  if (riderId === data.driverId)
    throw new HttpsError('invalid-argument', 'You cannot request yourself.');
  if (data.source === 'CALENDAR')
    return prepareCalendarPair(
      riderId,
      data.driverId,
      data.localDate,
      data.riderRevision,
      data.driverRevision,
      routing,
    );
  const [rider, driver] = await Promise.all([participant(riderId), participant(data.driverId)]);
  if (!rider.saved.eligible || !driver.saved.eligible)
    throw new HttpsError('permission-denied', 'Both accounts must remain eligible.');
  const result = await findMatches(
    riderId,
    {
      localDate: data.localDate,
      revision: data.riderRevision,
      direction: data.direction,
    },
    {
      load: async (uid) =>
        uid === riderId ? rider.saved : uid === data.driverId ? driver.saved : null,
      findDrivers: async () => [driver.saved],
    },
    routing,
    now(),
    1,
  );
  const card = result.recommendations.find((item) => item.driverId === data.driverId);
  if (!card)
    throw new HttpsError(
      'failed-precondition',
      result.unknownCount
        ? 'Routing could not confirm this pair. Retry later.'
        : 'This pair is no longer compatible.',
    );
  // Routing may take seconds. Recheck Auth after it, not just before it.
  if ((await Promise.all([eligible(riderId), eligible(data.driverId)])).some((ok) => !ok))
    throw new HttpsError('permission-denied', 'Both accounts must remain eligible.');
  if (card.inputRevision !== data.driverRevision)
    throw new HttpsError('failed-precondition', 'Driver settings changed. Search again.');
  const setup = parseMatchingSetup(rider.saved.setup, riderId);
  const value: Omit<RideRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'> = {
    schemaVersion: 1,
    participantIds: [riderId, data.driverId],
    riderId,
    driverId: data.driverId,
    riderName: parseUserProfileDocument(rider.saved.profile).firstName,
    driverName: card.firstName,
    localDate: data.localDate,
    direction: 'TO_CAMPUS',
    riderRevision: data.riderRevision,
    driverRevision: data.driverRevision,
    seats: setup.seatsRequested,
    pickupLabel: PUBLIC_POINTS.find((p) => p.id === setup.pointId)!.label,
    campusLabel: CAMPUS_POINTS.find((p) => p.id === setup.campusLot)!.label,
    plan: card.plan,
    metrics: card.metrics,
  };
  return {
    value,
    snapshots: [...rider.snapshots, ...driver.snapshots],
    privatePickup: undefined,
  };
}
type PreparedPair = Awaited<ReturnType<typeof preparePair>>;
async function assertCurrent(tx: Transaction, prepared: PreparedPair) {
  const current = await tx.getAll(...prepared.snapshots.map((s) => s.ref));
  current.forEach((snapshot, index) => {
    if (
      snapshot.exists !== prepared.snapshots[index].exists ||
      (snapshot.exists && !snapshot.updateTime?.isEqual(prepared.snapshots[index].updateTime!))
    )
      throw new HttpsError('aborted', 'Saved inputs changed during validation. Reload and retry.');
  });
  if (prepared.value.plan.departure <= now())
    throw new HttpsError(
      'failed-precondition',
      'This trip departure has passed. Choose a future trip.',
    );
  const driverCommute = parseCommuteDocument(
    current.find((s) => s.ref.path === `users/${prepared.value.driverId}/commutes/primary`)!.data(),
    prepared.value.driverId,
  );
  if ((driverCommute.seats ?? 0) < prepared.value.seats)
    throw new HttpsError('failed-precondition', 'Insufficient passenger seats.');
}
async function assertUncommitted(tx: Transaction, value: PreparedPair['value']) {
  const db = getFirestore();
  const refs = value.participantIds.map((uid) =>
    db.doc(`_rideCommitments/${commitmentIdFor(uid, value.localDate)}`),
  );
  const commitments = await tx.getAll(...refs);
  if (commitments.some((c) => c.exists))
    throw new HttpsError(
      'failed-precondition',
      'A participant already has an accepted inbound ride on this date.',
    );
  return refs;
}
function result(snapshot: DocumentSnapshot): RideRequestResult {
  const value = snapshot.data()!;
  return {
    id: snapshot.id,
    status: value.status,
    ...(value.attemptId ? { attemptId: value.attemptId } : {}),
  };
}
async function creationState(tx: Transaction, id: string, reverseId: string, attemptId?: string) {
  const db = getFirestore();
  const refs = [db.doc(`rideRequests/${id}`), db.doc(`rideRequests/${reverseId}`)];
  if (attemptId) refs.push(db.doc(`_rideRequestAttempts/${digest([id, attemptId])}`));
  const [own, reverse, operation] = await tx.getAll(...refs);
  return { own, reverse, operation };
}
/** Remember coalesced sends too: retrying a losing crossed send must not reopen it later. */
function existingCreation(
  tx: Transaction,
  state: Awaited<ReturnType<typeof creationState>>,
  initiatorId: string,
  attemptId?: string,
  forced?: DocumentSnapshot,
): RideRequestResult | undefined {
  const { own, reverse, operation } = state;
  const activeReverse = reverse.exists && ['PENDING', 'ACCEPTED'].includes(reverse.data()!.status);
  const previousOperation = operation?.exists
    ? [own, reverse].find((snapshot) => snapshot.id === operation.data()!.requestId)
    : undefined;
  let existing: DocumentSnapshot | undefined;
  if (activeReverse) existing = reverse;
  else if (forced) existing = forced;
  else if (own.exists && own.data()!.status !== 'CANCELLED') existing = own;
  else if (previousOperation) existing = previousOperation;
  else if (own.exists && own.data()!.attemptId === attemptId) existing = own;
  if (operation?.exists && !previousOperation?.exists)
    throw new HttpsError(
      'failed-precondition',
      'The previous request record is unavailable. Reload your rides.',
    );
  if (!existing?.exists) return undefined;
  if (operation && !operation.exists)
    tx.create(operation.ref, { requestId: existing.id, attemptId, initiatorId, createdAt: now() });
  return result(existing);
}
async function commitCreation(
  id: string,
  prepared: PreparedPair,
  initiatorId: string,
  attemptId?: string,
  previous?: RideRequest,
): Promise<RideRequestResult> {
  const ref = getFirestore().doc(`rideRequests/${id}`);
  return getFirestore().runTransaction(async (tx) => {
    const state = await creationState(
      tx,
      id,
      requestIdFor(prepared.value.driverId, prepared.value.riderId, prepared.value.localDate),
      attemptId,
    );
    const changed =
      state.own.exists &&
      state.own.data()!.status === 'CANCELLED' &&
      state.own.data()!.attemptId !== previous?.attemptId
        ? state.own
        : undefined;
    const existing = existingCreation(tx, state, initiatorId, attemptId, changed);
    if (existing) return existing;
    if (initiatorId === prepared.value.driverId) {
      const vehicle = await tx.get(getFirestore().doc(`users/${initiatorId}/vehicles/primary`));
      if (!vehicleIsComplete(vehicle.data(), initiatorId))
        throw new HttpsError(
          'failed-precondition',
          'Finish setting up your vehicle before requesting as a driver.',
          { reason: 'VEHICLE_REQUIRED' },
        );
    }
    await assertCurrent(tx, prepared);
    await assertUncommitted(tx, prepared.value);
    const timestamp = now();
    if (state.operation)
      tx.create(state.operation.ref, {
        requestId: id,
        attemptId,
        initiatorId,
        createdAt: timestamp,
      });
    tx.set(ref, {
      ...prepared.value,
      id,
      initiatorId,
      ...(attemptId ? { attemptId } : {}),
      status: 'PENDING',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return { id, status: 'PENDING', ...(attemptId ? { attemptId } : {}) };
  });
}
/** All reservations and the accepted status commit together. No network/routing in retry callbacks. */
export async function commitAcceptance(
  id: string,
  responderId: string,
  prepared: PreparedPair,
  attemptId?: string,
): Promise<RideRequestResult> {
  const db = getFirestore();
  const ref = db.doc(`rideRequests/${id}`);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const request = snapshot.data() as RideRequest | undefined;
    if (!request || requestRecipient(request) !== responderId)
      throw new HttpsError('permission-denied', 'Only the request recipient may respond.');
    assertAttempt(request, attemptId);
    if (request.status === 'ACCEPTED') return result(snapshot);
    if (request.status !== 'PENDING')
      throw new HttpsError('failed-precondition', 'This request is no longer pending.');
    const vehicle = await tx.get(db.doc(`users/${request.driverId}/vehicles/primary`));
    if (!vehicleIsComplete(vehicle.data(), request.driverId))
      throw new HttpsError(
        'failed-precondition',
        'The driver must finish vehicle setup before this ride can be accepted.',
        { reason: 'VEHICLE_REQUIRED' },
      );
    if (
      request.riderId !== prepared.value.riderId ||
      request.driverId !== prepared.value.driverId ||
      request.localDate !== prepared.value.localDate ||
      request.riderRevision !== prepared.value.riderRevision ||
      request.driverRevision !== prepared.value.driverRevision
    )
      throw new HttpsError('failed-precondition', 'The pending request inputs changed.');
    if (
      request.source === 'CALENDAR' &&
      (['departure', 'pickup', 'vehicleCampusArrival', 'riderDestinationArrival'] as const).some(
        (key) => request.plan[key] !== prepared.value.plan[key],
      )
    )
      throw new HttpsError(
        'failed-precondition',
        'The proposed timing changed. This request cannot be accepted with different times.',
      );
    await assertCurrent(tx, prepared);
    const refs = await assertUncommitted(tx, prepared.value);
    refs.forEach((commitment, i) =>
      tx.create(commitment, {
        requestId: id,
        userId: prepared.value.participantIds[i],
        localDate: request.localDate,
        direction: 'TO_CAMPUS',
        reservedSeats: request.seats,
      }),
    );
    if (prepared.privatePickup) tx.set(db.doc(`ridePickups/${id}`), prepared.privatePickup);
    tx.update(ref, { ...prepared.value, status: 'ACCEPTED', updatedAt: now() });
    return { id, status: 'ACCEPTED' };
  });
}
async function authenticated(uid?: string) {
  localOnly();
  if (!uid || !(await eligible(uid)))
    throw new HttpsError('permission-denied', 'Sign in with a verified Stony Brook account.');
  return uid;
}
function mapped(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof DemoBusyError) throw new HttpsError('resource-exhausted', error.message);
  if (error instanceof MatchingError) throw new HttpsError(error.code, error.message);
  throw new HttpsError(
    'unavailable',
    'The ride action could not be completed. Retry; duplicate actions are safe.',
  );
}
const options = {
  region: 'us-central1',
  timeoutSeconds: 120,
  maxInstances: 1,
  concurrency: 4,
};
export const createRideRequest = onCall(options, async (request) => {
  try {
    const initiatorId = await authenticated(request.auth?.uid);
    const data = input(request.data);
    const riderId = data.riderId ?? initiatorId;
    if (initiatorId !== riderId && initiatorId !== data.driverId)
      throw new HttpsError('permission-denied', 'Only a trip participant may send this request.');
    if (riderId === data.driverId)
      throw new HttpsError('invalid-argument', 'You cannot request yourself.');
    const id = requestIdFor(riderId, data.driverId, data.localDate);
    const preview = await getFirestore().runTransaction(async (tx) => {
      const state = await creationState(
        tx,
        id,
        requestIdFor(data.driverId, riderId, data.localDate),
        data.attemptId,
      );
      return {
        existing: existingCreation(tx, state, initiatorId, data.attemptId),
        previous: state.own.data() as RideRequest | undefined,
      };
    });
    if (preview.existing) return preview.existing;
    const previous = preview.previous;
    if (initiatorId === data.driverId) {
      const vehicle = await getFirestore().doc(`users/${initiatorId}/vehicles/primary`).get();
      if (!vehicleIsComplete(vehicle.data(), initiatorId))
        throw new HttpsError(
          'failed-precondition',
          'Finish setting up your vehicle before requesting as a driver.',
          { reason: 'VEHICLE_REQUIRED' },
        );
    }
    const prepared = await withMatchingRouting(
      (routing) => preparePair(riderId, data, routing),
      data.source === 'CALENDAR',
    );
    if (
      data.source === 'CALENDAR' &&
      (['departure', 'pickup', 'vehicleCampusArrival'] as const).some(
        (key) => data.proposedPlan![key] !== prepared.value.plan[key],
      )
    )
      throw new HttpsError(
        'aborted',
        'Route estimates changed. Search again and review the proposed times.',
      );
    return await commitCreation(id, prepared, initiatorId, data.attemptId, previous);
  } catch (error) {
    mapped(error);
  }
});
export const respondToRideRequest = onCall(options, async (call) => {
  try {
    const uid = await authenticated(call.auth?.uid);
    const data = call.data;
    if (
      !record(data) ||
      Object.keys(data)
        .filter((key) => key !== 'attemptId')
        .sort()
        .join(',') !== 'decision,requestId' ||
      (data.attemptId !== undefined && !validAttempt(data.attemptId)) ||
      typeof data.requestId !== 'string' ||
      !/^[a-f0-9]{64}$/.test(data.requestId) ||
      (data.decision !== 'ACCEPTED' && data.decision !== 'DECLINED')
    )
      throw new HttpsError(
        'invalid-argument',
        'Supply a request ID and ACCEPTED or DECLINED decision.',
      );
    const ref = getFirestore().doc(`rideRequests/${data.requestId}`);
    const snapshot = await ref.get();
    const saved = snapshot.data() as RideRequest | undefined;
    if (!saved || requestRecipient(saved) !== uid)
      throw new HttpsError('permission-denied', 'Only the request recipient may respond.');
    assertAttempt(saved, data.attemptId);
    if (saved.status === data.decision) return result(snapshot);
    if (saved.status !== 'PENDING')
      throw new HttpsError('failed-precondition', 'This request already has a final decision.');
    if (data.decision === 'DECLINED')
      return await getFirestore().runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        const value = fresh.data() as RideRequest;
        if (!value || requestRecipient(value) !== uid)
          throw new HttpsError('permission-denied', 'Only the request recipient may respond.');
        assertAttempt(value, data.attemptId);
        if (value.status === 'DECLINED') return result(fresh);
        if (value.status !== 'PENDING')
          throw new HttpsError('failed-precondition', 'This request already has a final decision.');
        tx.update(ref, { status: 'DECLINED', updatedAt: now() });
        return { id: ref.id, status: 'DECLINED' };
      });
    const vehicle = await getFirestore().doc(`users/${saved.driverId}/vehicles/primary`).get();
    if (!vehicleIsComplete(vehicle.data(), saved.driverId))
      throw new HttpsError(
        'failed-precondition',
        'The driver must finish vehicle setup before this ride can be accepted.',
        { reason: 'VEHICLE_REQUIRED' },
      );
    const prepared = await withMatchingRouting(
      (routing) =>
        preparePair(
          saved.riderId,
          {
            ...(saved.source === 'CALENDAR' ? { source: 'CALENDAR' as const } : {}),
            driverId: saved.driverId,
            localDate: saved.localDate,
            direction: 'TO_CAMPUS',
            riderRevision: saved.riderRevision,
            driverRevision: saved.driverRevision,
          },
          routing,
        ),
      saved.source === 'CALENDAR',
    );
    return await commitAcceptance(ref.id, uid, prepared, data.attemptId);
  } catch (error) {
    mapped(error);
  }
});

function assertAttempt(request: RideRequest, attemptId: unknown = undefined) {
  if (request.attemptId !== attemptId)
    throw new HttpsError(
      'aborted',
      'This request changed. Reload the current request before acting.',
    );
}
/** Cancellation only changes a pending proposal; it never removes accepted reservations. */
export const cancelRideRequest = onCall(options, async (call) => {
  try {
    const uid = await authenticated(call.auth?.uid);
    const data = call.data;
    if (
      !record(data) ||
      Object.keys(data)
        .filter((k) => k !== 'attemptId')
        .join(',') !== 'requestId' ||
      typeof data.requestId !== 'string' ||
      !/^[a-f0-9]{64}$/.test(data.requestId) ||
      (data.attemptId !== undefined && !validAttempt(data.attemptId))
    )
      throw new HttpsError(
        'invalid-argument',
        'Supply the pending request and its proposal identifier.',
      );
    const ref = getFirestore().doc(`rideRequests/${data.requestId}`);
    return await getFirestore().runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const saved = snapshot.data() as RideRequest | undefined;
      if (!saved || requestInitiator(saved) !== uid)
        throw new HttpsError('permission-denied', 'Only the request sender may cancel.');
      assertAttempt(saved, data.attemptId);
      if (saved.status === 'CANCELLED') return result(snapshot);
      if (saved.status !== 'PENDING')
        throw new HttpsError(
          'failed-precondition',
          saved.status === 'ACCEPTED'
            ? 'This request was already accepted. The confirmed ride has not been cancelled.'
            : 'This request is no longer pending.',
        );
      tx.update(ref, { status: 'CANCELLED', updatedAt: now() });
      return {
        id: ref.id,
        status: 'CANCELLED',
        ...(saved.attemptId ? { attemptId: saved.attemptId } : {}),
      };
    });
  } catch (error) {
    mapped(error);
  }
});

/** Read-only preview: participants and points come from the accepted server record. */
export const previewAcceptedRide = onCall(options, async (call) => {
  try {
    const uid = await authenticated(call.auth?.uid);
    if (!record(call.data) || Object.keys(call.data).some((key) => key !== 'requestId') ||
        typeof call.data.requestId !== 'string' || !/^[a-f0-9]{64}$/.test(call.data.requestId))
      throw new HttpsError('invalid-argument', 'Supply an accepted trip ID.');
    const db = getFirestore();
    const snapshot = await db.doc(`rideRequests/${call.data.requestId}`).get();
    const ride = snapshot.data() as RideRequest | undefined;
    if (!ride || (uid !== ride.driverId && uid !== ride.riderId))
      throw new HttpsError('permission-denied', 'This trip is not available to your account.');
    if (ride.status !== 'ACCEPTED' || ride.source !== 'CALENDAR')
      throw new HttpsError('failed-precondition', 'Exact routes are shared only for accepted calendar trips.');
    const pickup = (await db.doc(`ridePickups/${snapshot.id}`).get()).data();
    const campus = pickup?.campus ?? CAMPUS_POINTS.find((point) => point.label === ride.campusLabel)?.coordinate;
    if (!isValidRouteCoordinate(pickup?.driverStart) || !isValidRouteCoordinate(pickup?.riderPickup) ||
        !isValidRouteCoordinate(campus))
      throw new HttpsError('failed-precondition', 'The confirmed route points are unavailable.');
    const points = [pickup.driverStart, pickup.riderPickup, campus];
    // Preview only: never modifies agreed timing, commitments, or acceptance state.
    return await withMatchingRouting(
      (routing) => routing.route(points, { departureEpochSeconds: Math.max(now() + 60, ride.plan.departure) }),
      true,
    );
  } catch (error) { mapped(error); }
});
