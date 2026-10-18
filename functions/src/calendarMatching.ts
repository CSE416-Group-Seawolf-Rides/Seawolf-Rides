import { createHash } from 'node:crypto';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  calendarDay,
  checkDemoDate,
  parseDayOverride,
} from '../../mobile/src/calendar/commuteCalendar';
import {
  evaluateCalendarPair,
  type CalendarParticipant,
  type CalendarSearchResult,
} from '../../mobile/src/calendar/calendarMatching';
import {
  parseCommuteDocument,
  parseUserProfileDocument,
} from '../../mobile/src/persistence/userDataModel';
import { CAMPUS_POINTS } from '../../mobile/src/mvp/settings';
import type { RideRequest } from '../../mobile/src/mvp/rideRequestModel';
import type { RoutingAdapter } from '../../mobile/src/routing/types';
import { eligible, withMatchingRouting } from './matchingRuntime';
import { DemoBusyError, DEMO_CANDIDATE_LIMIT } from './demoRouting';

const commitmentId = (uid: string, date: string) =>
  createHash('sha256')
    .update(JSON.stringify([uid, date, 'TO_CAMPUS']))
    .digest('hex');
const timestamp = () => Math.floor(Date.now() / 1000);
export function requireLocalDemo() {
  if (
    process.env.FUNCTIONS_EMULATOR !== 'true' ||
    process.env.GCLOUD_PROJECT !== 'demo-seawolf-rides' ||
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST
  )
    throw new HttpsError(
      'failed-precondition',
      'Calendar matching is available only in the demo-seawolf-rides emulators.',
    );
}
export async function loadCalendarParticipant(uid: string, date: string) {
  const db = getFirestore();
  const snapshots = await db.getAll(
    db.doc(`users/${uid}/commuteDays/${date}`),
    db.doc(`users/${uid}`),
    db.doc(`users/${uid}/commutes/primary`),
    db.doc(`_rideCommitments/${commitmentId(uid, date)}`),
  );
  if (!(await eligible(uid)) || !snapshots[1].exists || !snapshots[2].exists) return null;
  const profile = parseUserProfileDocument(snapshots[1].data());
  const commute = parseCommuteDocument(snapshots[2].data(), uid);
  const day = calendarDay(commute, profile.role, date, parseDayOverride(snapshots[0].data()));
  if (!day || day.arriveBy === null || !commute.discoveryEnabled || !commute.startPoint)
    return null;
  const revision = createHash('sha256')
    .update(
      JSON.stringify(
        snapshots
          .slice(0, 3)
          .map((s) => [
            s.ref.path,
            s.updateTime ? [s.updateTime.seconds, s.updateTime.nanoseconds] : null,
          ]),
      ),
    )
    .digest('hex');
  const participant: CalendarParticipant = {
    uid,
    name: profile.firstName,
    revision,
    commute,
    day,
  };
  return { participant, snapshots, committed: snapshots[3].exists };
}
const options = {
  region: 'us-central1',
  timeoutSeconds: 120,
  maxInstances: 1,
  concurrency: 4,
};
function mapped(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof DemoBusyError) throw new HttpsError('resource-exhausted', error.message);
  throw new HttpsError('unavailable', 'Could not complete calendar matching. Retry later.');
}
export const setCommuteDay = onCall(options, async (call) => {
  requireLocalDemo();
  const uid = call.auth?.uid;
  if (!uid || !(await eligible(uid)))
    throw new HttpsError('permission-denied', 'Sign in with a verified campus account.');
  const data = call.data;
  if (
    !data ||
    Object.keys(data).sort().join(',') !== 'localDate,mode' ||
    typeof data.localDate !== 'string' ||
    !['drive', 'ride', 'either', 'off', 'default'].includes(data.mode)
  )
    throw new HttpsError('invalid-argument', 'Choose a date and calendar role.');
  try {
    checkDemoDate(data.localDate, timestamp());
  } catch {
    throw new HttpsError('invalid-argument', 'Choose a date within the next 30 days.');
  }
  const db = getFirestore();
  const ref = db.doc(`users/${uid}/commuteDays/${data.localDate}`);
  await db.runTransaction(async (tx) => {
    const [lock, commute] = await tx.getAll(
      db.doc(`_rideCommitments/${commitmentId(uid, data.localDate)}`),
      db.doc(`users/${uid}/commutes/primary`),
    );
    if (lock.exists)
      throw new HttpsError(
        'failed-precondition',
        'This date has an accepted ride. Changing an accepted trip is not available yet.',
      );
    if (!commute.exists)
      throw new HttpsError('failed-precondition', 'Save your weekly commute first.');
    if (
      (data.mode === 'drive' || data.mode === 'either') &&
      !(parseCommuteDocument(commute.data(), uid).seats ?? 0)
    )
      throw new HttpsError(
        'failed-precondition',
        'Set passenger seats in your weekly commute before offering to drive.',
      );
    if (data.mode === 'default') tx.delete(ref);
    else tx.set(ref, { mode: data.mode, updatedAt: timestamp() });
  });
  return { saved: true };
});
export const findCommuteMatches = onCall(options, async (call) => {
  requireLocalDemo();
  const uid = call.auth?.uid;
  if (!uid || !(await eligible(uid)))
    throw new HttpsError('permission-denied', 'Sign in with a verified campus account.');
  if (
    !call.data ||
    Object.keys(call.data).join(',') !== 'localDate' ||
    typeof call.data.localDate !== 'string'
  )
    throw new HttpsError('invalid-argument', 'Supply one calendar date.');
  const date = call.data.localDate;
  try {
    checkDemoDate(date, timestamp());
  } catch {
    throw new HttpsError('invalid-argument', 'Choose a date within the next 30 days.');
  }
  try {
    const own = await loadCalendarParticipant(uid, date);
    if (!own)
      throw new HttpsError(
        'failed-precondition',
        'Save your commute, confirm your private starting point, enable matching and set the morning start time for an inbound day.',
      );
    if (own.committed)
      throw new HttpsError(
        'failed-precondition',
        'You already have an accepted ride on this date.',
      );
    // Bounded setup discovery, including date overrides. Self never consumes a slot.
    const snapshot = await getFirestore()
      .collectionGroup('commutes')
      .where('campusLot', '==', own.participant.commute.campusLot)
      .where('discoveryEnabled', '==', true)
      .orderBy(FieldPath.documentId())
      .limit(DEMO_CANDIDATE_LIMIT + 2)
      .get();
    const ids = snapshot.docs
      .filter((s) => s.id === 'primary' && s.ref.parent.parent?.id !== uid)
      .map((s) => s.ref.parent.parent!.id);
    const idsToTry = ids.slice(0, DEMO_CANDIDATE_LIMIT);
    const result: CalendarSearchResult = {
      matches: [],
      incomplete: ids.length > DEMO_CANDIDATE_LIMIT || snapshot.size === DEMO_CANDIDATE_LIMIT + 2,
      unknownCount: 0,
      incompatibleCount: 0,
    };
    const proposals: {
      driver: CalendarParticipant;
      rider: CalendarParticipant;
      other: CalendarParticipant;
    }[] = [];
    for (const id of idsToTry) {
      const loaded = await loadCalendarParticipant(id, date);
      if (!loaded || loaded.committed) continue;
      const a = own.participant,
        b = loaded.participant;
      if (a.day.mode !== 'ride' && b.day.mode !== 'drive' && (a.commute.seats ?? 0) > 0)
        proposals.push({ driver: a, rider: b, other: b });
      if (b.day.mode !== 'ride' && a.day.mode !== 'drive' && (b.commute.seats ?? 0) > 0)
        proposals.push({ driver: b, rider: a, other: b });
    }
    // Each proposed orientation uses two routes. Either/Either can use both slots;
    // skipped orientations/candidates must be reported rather than exceeding the gate budget.
    if (proposals.length > DEMO_CANDIDATE_LIMIT) result.incomplete = true;
    await withMatchingRouting(async (routing) => {
      for (const { driver, rider, other } of proposals.slice(0, DEMO_CANDIDATE_LIMIT)) {
        const evaluation = await evaluateCalendarPair(driver, rider, date, routing, timestamp());
        if (evaluation.status === 'UNKNOWN') {
          result.unknownCount++;
          continue;
        }
        if (evaluation.status === 'INFEASIBLE') {
          result.incompatibleCount++;
          continue;
        }
        result.matches.push({
          driverId: driver.uid,
          riderId: rider.uid,
          driverRevision: driver.revision,
          riderRevision: rider.revision,
          name: other.name,
          role: driver.uid === uid ? 'rider' : 'driver',
          area: other.commute.startArea,
          plan: evaluation.plan,
          addedDrivingSeconds: evaluation.metrics.driverExtraDurationSeconds,
          metrics: evaluation.metrics,
        });
      }
    });
    // Never return results based on inputs edited during routing.
    const fresh = await loadCalendarParticipant(uid, date);
    if (!fresh || fresh.committed || fresh.participant.revision !== own.participant.revision)
      throw new HttpsError('aborted', 'Your calendar changed. Search again.');
    for (const item of [...result.matches]) {
      const otherId = item.driverId === uid ? item.riderId : item.driverId;
      const other = await loadCalendarParticipant(otherId, date);
      if (
        !other ||
        other.committed ||
        other.participant.revision !==
          (otherId === item.driverId ? item.driverRevision : item.riderRevision)
      ) {
        result.matches.splice(result.matches.indexOf(item), 1);
        result.unknownCount++;
      }
    }
    result.matches.sort(
      (a, b) =>
        a.addedDrivingSeconds - b.addedDrivingSeconds ||
        (a.driverId < b.driverId ? -1 : a.driverId > b.driverId ? 1 : 0) ||
        (a.riderId < b.riderId ? -1 : a.riderId > b.riderId ? 1 : 0),
    );
    return result;
  } catch (error) {
    mapped(error);
  }
});

export async function prepareCalendarPair(
  riderId: string,
  driverId: string,
  date: string,
  riderRevision: string,
  driverRevision: string,
  routing: RoutingAdapter,
) {
  checkDemoDate(date, timestamp());
  const [r, d] = await Promise.all([
    loadCalendarParticipant(riderId, date),
    loadCalendarParticipant(driverId, date),
  ]);
  if (
    !r ||
    !d ||
    r.committed ||
    d.committed ||
    r.participant.revision !== riderRevision ||
    d.participant.revision !== driverRevision
  )
    throw new HttpsError('failed-precondition', 'The commute or calendar changed. Search again.');
  const evaluated = await evaluateCalendarPair(
    d.participant,
    r.participant,
    date,
    routing,
    timestamp(),
  );
  if (evaluated.status !== 'FEASIBLE')
    throw new HttpsError(
      'failed-precondition',
      evaluated.status === 'UNKNOWN'
        ? 'Commute timing or routing could not be confirmed. Update the commute or retry later.'
        : 'This trip is no longer feasible.',
    );
  if ((await Promise.all([eligible(riderId), eligible(driverId)])).some((ok) => !ok))
    throw new HttpsError('permission-denied', 'Both accounts must remain eligible.');
  const value: Omit<RideRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'> = {
    schemaVersion: 1,
    source: 'CALENDAR',
    participantIds: [riderId, driverId],
    driverId,
    riderId,
    driverName: d.participant.name,
    riderName: r.participant.name,
    localDate: date,
    direction: 'TO_CAMPUS',
    riderRevision,
    driverRevision,
    seats: 1,
    pickupLabel: r.participant.commute.startArea.label,
    campusLabel: CAMPUS_POINTS.find((p) => p.id === r.participant.commute.campusLot)!.label,
    plan: evaluated.plan,
    metrics: evaluated.metrics,
  };
  return {
    value,
    snapshots: [...r.snapshots, ...d.snapshots],
    privatePickup: {
      driverStart: d.participant.commute.startPoint!,
      riderPickup: r.participant.commute.startPoint!,
    },
  };
}
