import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { evaluateCalendarPair } from '../src/calendar/calendarMatching.ts';

const digest = (parts) => crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const requestIdFor = (rider, driver, date, direction = 'TO_CAMPUS') =>
  digest([rider, driver, date, direction]);
const commitmentIdFor = (uid, date, directionOrRequestId, maybeRequestId) => {
  let direction = 'TO_CAMPUS';
  let requestId = maybeRequestId;
  if (directionOrRequestId === 'TO_CAMPUS' || directionOrRequestId === 'FROM_CAMPUS') {
    direction = directionOrRequestId;
  } else if (directionOrRequestId) {
    requestId = directionOrRequestId;
  }
  return requestId
    ? digest([uid, date, direction, requestId])
    : digest([uid, date, direction]);
};

const fakeRouting = {
  timeDependent: false,
  async route(points) {
    const legs = [];
    let totalDuration = 0;
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const legDuration = 600; // 10 minutes per leg
      const legDistance = 8000; // 8km per leg
      legs.push({ durationSeconds: legDuration, distanceMeters: legDistance });
      totalDuration += legDuration;
      totalDistance += legDistance;
    }
    return {
      status: 'SUCCESS',
      route: {
        durationSeconds: totalDuration,
        distanceMeters: totalDistance,
        legs,
        snappedWaypoints: points.map((p) => ({ input: p, distanceMeters: 5 })),
      },
    };
  },
};

function fixtureParticipant(uid, name, role, arriveBy = 9 * 60 + 30, leaveAt = 17 * 60) {
  return {
    uid,
    name,
    revision: 'rev-' + uid,
    commute: {
      userId: uid,
      role: role === 'driver' ? 'driver' : 'rider',
      discoveryEnabled: true,
      campusLot: 'tabler',
      startArea: { id: 'selden', label: 'Selden' },
      startPoint: { latitude: 40.87, longitude: -73.05 },
      seats: role === 'driver' ? 3 : 0,
      days: [{ day: 'tue', mode: role === 'driver' ? 'drive' : 'ride', arriveBy, leaveAt, startAt: 9 * 60 }],
    },
    day: {
      mode: role === 'driver' ? 'drive' : 'ride',
      arriveBy,
      leaveAt,
      startAt: 9 * 60,
    },
    seatsRemaining: role === 'driver' ? 3 : 0,
    seatsCapacity: role === 'driver' ? 3 : 0,
    acceptedStops: [],
  };
}

test('commitmentIdFor generates distinct, non-colliding IDs for TO_CAMPUS and FROM_CAMPUS on the same date', () => {
  const uid = 'commuter-123';
  const date = '2026-11-03';

  const inboundCommitment = commitmentIdFor(uid, date, 'TO_CAMPUS');
  const outboundCommitment = commitmentIdFor(uid, date, 'FROM_CAMPUS');
  const defaultCommitment = commitmentIdFor(uid, date);

  assert.equal(defaultCommitment, inboundCommitment, 'Default direction must be TO_CAMPUS');
  assert.notEqual(inboundCommitment, outboundCommitment, 'TO_CAMPUS and FROM_CAMPUS must never collide');

  const inboundWithRequest = commitmentIdFor(uid, date, 'TO_CAMPUS', 'req-1');
  const outboundWithRequest = commitmentIdFor(uid, date, 'FROM_CAMPUS', 'req-2');
  assert.notEqual(inboundWithRequest, outboundWithRequest);
});

test('requestIdFor generates distinct IDs for morning and evening requests between same commuters on same date', () => {
  const rider = 'rider-1';
  const driver = 'driver-1';
  const date = '2026-11-03';

  const morningReq = requestIdFor(rider, driver, date, 'TO_CAMPUS');
  const eveningReq = requestIdFor(rider, driver, date, 'FROM_CAMPUS');
  const defaultReq = requestIdFor(rider, driver, date);

  assert.equal(defaultReq, morningReq);
  assert.notEqual(morningReq, eveningReq, 'Morning and evening requests must have distinct IDs');
});

test('evaluateCalendarPair evaluates a feasible FROM_CAMPUS evening return ride', async () => {
  const driver = fixtureParticipant('driver-1', 'Chris', 'driver', 9 * 60 + 30, 17 * 60); // 5:00 PM
  const rider = fixtureParticipant('rider-1', 'Jordan', 'rider', 9 * 60 + 30, 17 * 60 + 10); // 5:10 PM
  const date = '2026-11-03';
  const now = 1793400000; // safely before the date

  const result = await evaluateCalendarPair(driver, rider, date, fakeRouting, now, 'FROM_CAMPUS');

  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.plan.occurrence.direction, 'FROM_CAMPUS');
  assert.equal(result.plan.occurrence.localDate, date);
  assert.ok(result.plan.departure > 0);
  assert.equal(result.plan.pickup, result.plan.departure, 'Rider is picked up on campus at departure');
  assert.ok(result.plan.riderDestinationArrival > result.plan.departure);
  assert.ok(result.metrics.soloDurationSeconds > 0);
  assert.ok(result.metrics.sharedDurationSeconds > result.metrics.soloDurationSeconds);
  assert.ok(result.metrics.driverExtraDurationSeconds >= 0);
});

test('evaluateCalendarPair rejects FROM_CAMPUS when leaveAt times do not overlap', async () => {
  const driver = fixtureParticipant('driver-1', 'Chris', 'driver', 9 * 60 + 30, 15 * 60); // 3:00 PM
  const rider = fixtureParticipant('rider-1', 'Jordan', 'rider', 9 * 60 + 30, 18 * 60); // 6:00 PM (3hr diff)
  const date = '2026-11-03';
  const now = 1793400000;

  const result = await evaluateCalendarPair(driver, rider, date, fakeRouting, now, 'FROM_CAMPUS');

  assert.equal(result.status, 'INFEASIBLE');
  assert.ok(result.reasonCodes.includes('ARRIVAL_PREFERENCE_MISMATCH'));
});

test('evaluateCalendarPair rejects FROM_CAMPUS when either commuter has no return schedule (leaveAt is null)', async () => {
  const driver = fixtureParticipant('driver-1', 'Chris', 'driver', 9 * 60 + 30, null); // Morning only
  const rider = fixtureParticipant('rider-1', 'Jordan', 'rider', 9 * 60 + 30, 17 * 60);
  const date = '2026-11-03';
  const now = 1793400000;

  const result = await evaluateCalendarPair(driver, rider, date, fakeRouting, now, 'FROM_CAMPUS');

  assert.equal(result.status, 'INFEASIBLE');
  assert.ok(result.reasonCodes.includes('SKIPPED_OCCURRENCE'));
});

test('previewAcceptedRide points order for FROM_CAMPUS return trip starts at campus and ends at driver home', () => {
  const campus = { latitude: 40.9080, longitude: -73.1250 };
  const driverStart = { latitude: 40.8654, longitude: -73.0531 };
  const riderPickup = { latitude: 40.8258, longitude: -73.1205 };

  const getRoutePoints = (ride, pickup) => {
    return ride.direction === 'FROM_CAMPUS'
      ? [campus, pickup.riderPickup, pickup.driverStart]
      : [pickup.driverStart, pickup.riderPickup, campus];
  };

  const returnPoints = getRoutePoints({ direction: 'FROM_CAMPUS' }, { driverStart, riderPickup });
  assert.deepEqual(returnPoints, [campus, riderPickup, driverStart]);
  assert.notDeepEqual(returnPoints[0], returnPoints[1]);
  assert.notDeepEqual(returnPoints[1], returnPoints[2]);

  const morningPoints = getRoutePoints({ direction: 'TO_CAMPUS' }, { driverStart, riderPickup });
  assert.deepEqual(morningPoints, [driverStart, riderPickup, campus]);
});

test('LiveRequestCard labels FROM_CAMPUS trips with departure from campus to drop-off destination', () => {
  const ride = {
    driverId: 'wolfie',
    riderId: 'jordan',
    driverName: 'Wolfie',
    riderName: 'Jordan',
    localDate: '2026-11-03',
    direction: 'FROM_CAMPUS',
    status: 'PENDING',
    pickupLabel: 'Stony Brook Campus',
    campusLabel: 'Tabler',
    dropoffLabel: 'Selden area',
    plan: { departure: 1793473800, pickup: 1793473800, riderDestinationArrival: 1793474760 },
    metrics: { driverExtraDurationSeconds: 900 },
  };

  const isReturn = ride.direction === 'FROM_CAMPUS';
  const routeText = isReturn
    ? `${ride.campusLabel} → ${ride.dropoffLabel ?? `${ride.riderName}’s area`}`
    : `${ride.pickupLabel} → ${ride.campusLabel}`;
  const arrivalCaption = isReturn ? 'DROP-OFF' : 'CAMPUS ARRIVAL';

  assert.equal(routeText, 'Tabler → Selden area');
  assert.equal(arrivalCaption, 'DROP-OFF');
});
