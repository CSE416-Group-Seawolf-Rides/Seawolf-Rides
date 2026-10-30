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
  arrivalTargetsOverlap,
  compareCalendarMatches,
  type CalendarParticipant,
  type CalendarSearchResult,
} from '../../mobile/src/calendar/calendarMatching';
import {
  parseCommuteDocument,
  parseUserProfileDocument,
  profileWithPublicDetails,
} from '../../mobile/src/persistence/userDataModel';
import {
  CAMPUS_POINTS,
  localMinuteToEpoch,
} from '../../mobile/src/mvp/settings';
import type { RideRequest } from '../../mobile/src/mvp/rideRequestModel';
import type { RoutingAdapter } from '../../mobile/src/routing/types';
import { eligible, withMatchingRouting, trafficRoutingEnabled } from './matchingRuntime';
import { ARRIVAL_BUFFER_SECONDS } from '../../mobile/src/commute/arrivalPolicy';
import { DemoBusyError, DEMO_CANDIDATE_LIMIT } from './demoRouting';

const commitmentId = (uid: string, date: string) =>
  createHash('sha256')
    .update(JSON.stringify([uid, date, 'TO_CAMPUS']))
    .digest('hex');
const timestamp = () => Math.floor(Date.now() / 1000);
import { loadFuelPrices, pricer } from './payments';

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
export async function areUsersMutuallyBlocked(uidA: string, uidB: string): Promise<boolean> {
  if (!uidA || !uidB || uidA === uidB) return false;
  const db = getFirestore();
  const [aBlocksB, bBlocksA] = await db.getAll(
    db.doc(`users/${uidA}/blockedUsers/${uidB}`),
    db.doc(`users/${uidB}/blockedUsers/${uidA}`),
  );
  return Boolean(aBlocksB?.exists || bBlocksA?.exists);
}

export async function loadCalendarParticipant(uid: string, date: string, requestingUid?: string) {
  const db = getFirestore();
  const refs = [
    db.doc(`users/${uid}/commuteDays/${date}`),
    db.doc(`users/${uid}`),
    db.doc(`users/${uid}/commutes/primary`),
    db.doc(`_rideCommitments/${commitmentId(uid, date)}`),
    db.doc(`publicProfiles/${uid}`),
  ];
  if (requestingUid && requestingUid !== uid) {
    refs.push(db.doc(`users/${uid}/blockedUsers/${requestingUid}`));
  }
  const snapshots = await db.getAll(...refs);
  if (!(await eligible(uid)) || !snapshots[1].exists || !snapshots[2].exists)
    return null;
  if (requestingUid && requestingUid !== uid && snapshots[5]?.exists)
    return null;
  const profile = profileWithPublicDetails(parseUserProfileDocument(snapshots[1].data()), snapshots[4].data(), uid);
  const commute = parseCommuteDocument(snapshots[2].data(), uid);
  const day = calendarDay(
    commute,
    profile.role,
    date,
    parseDayOverride(snapshots[0].data()),
  );
  if (
    !day ||
    day.arriveBy === null ||
    !commute.discoveryEnabled ||
    !commute.startPoint
  )
    return null;
  // Public name/photo/bio changes do not invalidate existing request revisions.
  const revision = createHash('sha256')
    .update(
      JSON.stringify(
        snapshots
          .slice(0, 3)
          .map((s) => [
            s.ref.path,
            s.updateTime
              ? [s.updateTime.seconds, s.updateTime.nanoseconds]
              : null,
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
  if (error instanceof DemoBusyError)
    throw new HttpsError('resource-exhausted', error.message);
  throw new HttpsError(
    'unavailable',
    'Could not complete calendar matching. Retry later.',
  );
}
export const setCommuteDay = onCall(options, async (call) => {
  requireLocalDemo();
  const uid = call.auth?.uid;
  if (!uid || !(await eligible(uid)))
    throw new HttpsError(
      'permission-denied',
      'Sign in with a verified campus account.',
    );
  const data = call.data;
  if (
    !data ||
    Object.keys(data).sort().join(',') !== 'localDate,mode' ||
    typeof data.localDate !== 'string' ||
    !['drive', 'ride', 'either', 'off', 'default'].includes(data.mode)
  )
    throw new HttpsError(
      'invalid-argument',
      'Choose a date and calendar role.',
    );
  try {
    checkDemoDate(data.localDate, timestamp());
  } catch {
    throw new HttpsError(
      'invalid-argument',
      'Choose a date within the next 30 days.',
    );
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
      throw new HttpsError(
        'failed-precondition',
        'Save your weekly commute first.',
      );
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
    throw new HttpsError(
      'permission-denied',
      'Sign in with a verified campus account.',
    );
  if (
    !call.data ||
    Object.keys(call.data).some(
      (key) => !['localDate', 'cursor'].includes(key),
    ) ||
    typeof call.data.localDate !== 'string' ||
    (call.data.cursor !== undefined &&
      (typeof call.data.cursor !== 'string' || call.data.cursor.length > 256))
  )
    throw new HttpsError('invalid-argument', 'Supply one calendar date.');
  const date = call.data.localDate;
  try {
    checkDemoDate(date, timestamp());
  } catch {
    throw new HttpsError(
      'invalid-argument',
      'Choose a date within the next 30 days.',
    );
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
    // Discover the complete opted-in metadata set before spending any public routing budget.
    const snapshot = await getFirestore()
      .collectionGroup('commutes')
      .where('discoveryEnabled', '==', true)
      .orderBy(FieldPath.documentId())
      .get();
    const blockedByCallerSnap = await getFirestore()
      .collection(`users/${uid}/blockedUsers`)
      .get();
    const blockedByCaller = new Set(blockedByCallerSnap.docs.map((d) => d.id));
    const ids = [
      ...new Set(
        snapshot.docs
          .filter((s) => s.id === 'primary' && s.ref.parent.parent?.id !== uid && !blockedByCaller.has(s.ref.parent.parent?.id ?? ''))
          .map((s) => s.ref.parent.parent!.id),
      ),
    ];
    let unreadable = 0;
    const others = await Promise.all(
      ids.map(async (id) => {
        try {
          return await loadCalendarParticipant(id, date, uid);
        } catch {
          unreadable++;
          return null;
        }
      }),
    );
    const proposals: {
      driver: CalendarParticipant;
      rider: CalendarParticipant;
      other: CalendarParticipant;
    }[] = [];
    for (const loaded of others) {
      if (!loaded || loaded.committed) continue;
      const a = own.participant,
        b = loaded.participant;
      if (!arrivalTargetsOverlap(a.day.arriveBy, b.day.arriveBy)) continue;
      if (
        a.day.mode !== 'ride' &&
        b.day.mode !== 'drive' &&
        (a.commute.seats ?? 0) > 0
      )
        proposals.push({ driver: a, rider: b, other: b });
      if (
        b.day.mode !== 'ride' &&
        a.day.mode !== 'drive' &&
        (b.commute.seats ?? 0) > 0
      )
        proposals.push({ driver: b, rider: a, other: b });
    }
    // Closest saved targets are checked first; final ranking uses actual evaluated arrivals.
    const preferencePenalty = (proposal: typeof proposals[number]) =>
      proposal.rider.commute.riderDropoffPreference === 'any' || proposal.rider.commute.campusLot === 'other' || proposal.rider.commute.campusLot === proposal.driver.commute.campusLot ? 0 : 1;
    proposals.sort(
      (a, b) =>
        Math.abs(a.other.day.arriveBy! - own.participant.day.arriveBy!) -
          Math.abs(b.other.day.arriveBy! - own.participant.day.arriveBy!) ||
        preferencePenalty(a) - preferencePenalty(b) ||
        (a.driver.uid < b.driver.uid
          ? -1
          : a.driver.uid > b.driver.uid
            ? 1
            : 0) ||
        (a.rider.uid < b.rider.uid ? -1 : a.rider.uid > b.rider.uid ? 1 : 0),
    );
    const searchRevision = createHash('sha256')
      .update(
        JSON.stringify([
          'buffered-arrival-dropoff-v3', date, trafficRoutingEnabled() ? 'tomtom-v1' : 'osrm',
          own.participant.revision,
          proposals.map((p) => [
            p.driver.uid,
            p.driver.revision,
            p.rider.uid,
            p.rider.revision,
          ]),
        ]),
      )
      .digest('hex');
    const pageLimit = trafficRoutingEnabled() ? 1 : DEMO_CANDIDATE_LIMIT;
    let offset = 0;
    if (call.data.cursor !== undefined) {
      let cursor: { offset: number; revision: string };
      try {
        if (!/^[A-Za-z0-9_-]+$/.test(call.data.cursor)) throw new Error();
        cursor = JSON.parse(
          Buffer.from(call.data.cursor, 'base64url').toString(),
        );
        if (
          !cursor ||
          Object.keys(cursor).sort().join(',') !== 'offset,revision' ||
          !Number.isSafeInteger(cursor.offset) ||
          cursor.offset < 0 ||
          cursor.offset % pageLimit !== 0 ||
          typeof cursor.revision !== 'string' ||
          !/^[a-f0-9]{64}$/.test(cursor.revision)
        )
          throw new Error();
      } catch {
        throw new HttpsError(
          'invalid-argument',
          'Invalid search page. Start a new search.',
        );
      }
      if (cursor.revision !== searchRevision)
        throw new HttpsError(
          'aborted',
          'The candidate list changed. Start a new search.',
        );
      offset = cursor.offset;
      if (offset > proposals.length)
        throw new HttpsError('invalid-argument', 'Invalid search page.');
    }
    const page = proposals.slice(offset, offset + pageLimit);
    const checked = offset + page.length;
    const result: CalendarSearchResult = {
      policyVersion: 3,
      searchRevision,
      totalCandidatePlans: proposals.length,
      checkedCandidatePlans: checked,
      nextCursor:
        checked < proposals.length
          ? Buffer.from(
              JSON.stringify({ offset: checked, revision: searchRevision }),
            ).toString('base64url')
          : null,
      matches: [],
      incomplete: checked < proposals.length,
      unknownCount: offset === 0 ? unreadable : 0,
      incompatibleCount: 0,
    };
    // Two static pairs or one traffic pair (arrival seed plus three timed routes), within the four-request budget.
    const priceFor = pricer(await loadFuelPrices());
    if (page.length)
      await withMatchingRouting(async (routing) => {
        for (const { driver, rider, other } of page) {
          const evaluation = await evaluateCalendarPair(
            driver,
            rider,
            date,
            routing,
            timestamp(),
          );
          if (evaluation.status === 'UNKNOWN') {
            result.unknownCount++;
            continue;
          }
          if (evaluation.status === 'INFEASIBLE') {
            result.incompatibleCount++;
            continue;
          }
          const ownArrival =
            driver.uid === uid
              ? evaluation.plan.vehicleCampusArrival
              : evaluation.plan.riderDestinationArrival;
          result.matches.push({
            eta: evaluation.eta,
            dropoffLabel: CAMPUS_POINTS.find((point) => point.id === driver.commute.campusLot)?.label,
            preferredDropoffLabel: rider.commute.riderDropoffPreference === 'any' || rider.commute.campusLot === 'other' ? 'Any' : CAMPUS_POINTS.find((point) => point.id === rider.commute.campusLot)?.label,
            dropoffPreferenceMatch: preferencePenalty({ driver, rider, other }) === 0,
            savedDriverDeparture: localMinuteToEpoch(date, driver.day.startAt!),
            driverId: driver.uid,
            riderId: rider.uid,
            driverRevision: driver.revision,
            riderRevision: rider.revision,
            name: other.name,
            role: driver.uid === uid ? 'rider' : 'driver',
            area: other.commute.startArea,
            plan: evaluation.plan,
            addedDrivingSeconds: evaluation.metrics.driverExtraDurationSeconds,
            arrivalDifferenceSeconds: Math.abs(
              ownArrival -
                (localMinuteToEpoch(date, own.participant.day.arriveBy!) - ARRIVAL_BUFFER_SECONDS),
            ),
            metrics: evaluation.metrics,
            price: await priceFor(driver.uid, rider.uid, evaluation.metrics),
          });
        }
      }, true);
    // Never return results based on inputs edited during routing.
    const fresh = await loadCalendarParticipant(uid, date);
    if (
      !fresh ||
      fresh.committed ||
      fresh.participant.revision !== own.participant.revision
    )
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
    result.matches.sort(compareCalendarMatches);
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
  if (await areUsersMutuallyBlocked(riderId, driverId)) {
    throw new HttpsError('failed-precondition', 'Cannot request a ride with this commuter.');
  }
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
    throw new HttpsError(
      'failed-precondition',
      'The commute or calendar changed. Search again.',
    );
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
  if (
    (await Promise.all([eligible(riderId), eligible(driverId)])).some(
      (ok) => !ok,
    )
  )
    throw new HttpsError(
      'permission-denied',
      'Both accounts must remain eligible.',
    );
  const value: Omit<RideRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'> =
    {
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
      campusLabel: CAMPUS_POINTS.find(
        (p) => p.id === d.participant.commute.campusLot,
      )!.label,
      plan: evaluated.plan,
      metrics: evaluated.metrics,
      // Locked here: later gas updates never change a price someone already agreed to.
      price: await pricer(await loadFuelPrices())(driverId, riderId, evaluated.metrics),
    };
  return {
    value,
    snapshots: [...r.snapshots, ...d.snapshots],
    participants: { driver: d.participant, rider: r.participant },
    eta: evaluated.eta,
    privatePickup: {
      campus: CAMPUS_POINTS.find((p) => p.id === d.participant.commute.campusLot)!.coordinate,
      driverStart: d.participant.commute.startPoint!,
      riderPickup: r.participant.commute.startPoint!,
    },
  };
}
