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
function input(value: unknown): CreateRideRequestInput {
  if (
    !record(value) ||
    Object.keys(value).sort().join(',') !==
      'direction,driverId,driverRevision,localDate,riderRevision' ||
    !uidValue(value.driverId) ||
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
  const [rider, driver] = await Promise.all([participant(riderId), participant(data.driverId)]);
  if (!rider.saved.eligible || !driver.saved.eligible)
    throw new HttpsError('permission-denied', 'Both accounts must remain eligible.');
  const result = await findMatches(
    riderId,
    { localDate: data.localDate, revision: data.riderRevision, direction: data.direction },
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
  return { value, snapshots: [...rider.snapshots, ...driver.snapshots] };
}
type PreparedPair = Awaited<ReturnType<typeof preparePair>>;
async function assertCurrent(tx: Transaction, prepared: PreparedPair) {
  const current = await tx.getAll(...prepared.snapshots.map((s) => s.ref));
  current.forEach((snapshot, index) => {
    if (!snapshot.exists || !snapshot.updateTime?.isEqual(prepared.snapshots[index].updateTime!))
      throw new HttpsError('aborted', 'Saved inputs changed during validation. Reload and retry.');
  });
  if (prepared.value.plan.departure <= now())
    throw new HttpsError(
      'failed-precondition',
      'This trip departure has passed. Choose a future trip.',
    );
  const driverCommute = parseCommuteDocument(current[5].data(), prepared.value.driverId);
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
  return { id: snapshot.id, status: snapshot.data()!.status };
}
async function commitCreation(id: string, prepared: PreparedPair): Promise<RideRequestResult> {
  const ref = getFirestore().doc(`rideRequests/${id}`);
  return getFirestore().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return result(existing);
    await assertCurrent(tx, prepared);
    await assertUncommitted(tx, prepared.value);
    const timestamp = now();
    tx.create(ref, {
      ...prepared.value,
      id,
      status: 'PENDING',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return { id, status: 'PENDING' };
  });
}
/** All reservations and the accepted status commit together. No network/routing in retry callbacks. */
export async function commitAcceptance(
  id: string,
  driverId: string,
  prepared: PreparedPair,
): Promise<RideRequestResult> {
  const db = getFirestore();
  const ref = db.doc(`rideRequests/${id}`);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const request = snapshot.data() as RideRequest | undefined;
    if (!request || request.driverId !== driverId)
      throw new HttpsError('permission-denied', 'Only this request’s driver may respond.');
    if (request.status === 'ACCEPTED') return result(snapshot);
    if (request.status !== 'PENDING')
      throw new HttpsError('failed-precondition', 'This request is already declined.');
    if (
      request.riderId !== prepared.value.riderId ||
      request.driverId !== prepared.value.driverId ||
      request.localDate !== prepared.value.localDate ||
      request.riderRevision !== prepared.value.riderRevision ||
      request.driverRevision !== prepared.value.driverRevision
    )
      throw new HttpsError('failed-precondition', 'The pending request inputs changed.');
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
const options = { region: 'us-central1', timeoutSeconds: 120, maxInstances: 1, concurrency: 4 };
export const createRideRequest = onCall(options, async (request) => {
  try {
    const riderId = await authenticated(request.auth?.uid);
    const data = input(request.data);
    if (riderId === data.driverId)
      throw new HttpsError('invalid-argument', 'You cannot request yourself.');
    const id = requestIdFor(riderId, data.driverId, data.localDate);
    const existing = await getFirestore().doc(`rideRequests/${id}`).get();
    if (existing.exists) return result(existing);
    const prepared = await withMatchingRouting((routing) => preparePair(riderId, data, routing));
    return await commitCreation(id, prepared);
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
      Object.keys(data).sort().join(',') !== 'decision,requestId' ||
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
    if (!saved || saved.driverId !== uid)
      throw new HttpsError('permission-denied', 'Only this request’s driver may respond.');
    if (saved.status === data.decision) return result(snapshot);
    if (saved.status !== 'PENDING')
      throw new HttpsError('failed-precondition', 'This request already has a final decision.');
    if (data.decision === 'DECLINED')
      return await getFirestore().runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (fresh.data()?.status === 'DECLINED') return result(fresh);
        if (fresh.data()?.driverId !== uid || fresh.data()?.status !== 'PENDING')
          throw new HttpsError('failed-precondition', 'This request already has a final decision.');
        tx.update(ref, { status: 'DECLINED', updatedAt: now() });
        return { id: ref.id, status: 'DECLINED' };
      });
    const prepared = await withMatchingRouting((routing) =>
      preparePair(
        saved.riderId,
        {
          driverId: saved.driverId,
          localDate: saved.localDate,
          direction: 'TO_CAMPUS',
          riderRevision: saved.riderRevision,
          driverRevision: saved.driverRevision,
        },
        routing,
      ),
    );
    return await commitAcceptance(ref.id, uid, prepared);
  } catch (error) {
    mapped(error);
  }
});
