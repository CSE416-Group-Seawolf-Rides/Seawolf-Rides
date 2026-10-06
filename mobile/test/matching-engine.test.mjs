import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateCommuteMatch,
  rankRiderMatches,
} from '../src/matching/matchingEngine.ts';

const driver = {
  id: 'driver-1',
  campusLot: 'tabler',
  days: [
    { day: 'mon', arriveBy: 9 * 60, leaveAt: 17 * 60 },
    { day: 'wed', arriveBy: 9 * 60, leaveAt: 17 * 60 },
  ],
  seatsAvailable: 2,
  maxDetourMinutes: 10,
};

const rider = {
  id: 'rider-1',
  campusLot: 'tabler',
  days: [
    { day: 'mon', arriveBy: 9 * 60 + 10, leaveAt: 17 * 60 + 15 },
    { day: 'wed', arriveBy: 9 * 60 + 10, leaveAt: null },
  ],
};

test('returns an explainable score for a compatible route and schedule', () => {
  const result = evaluateCommuteMatch(driver, rider, {
    directDurationMinutes: 60,
    pickupDurationMinutes: 66,
  });

  assert.equal(result.compatible, true);
  assert.equal(result.addedDetourMinutes, 6);
  assert.equal(result.requestedLegCount, 3);
  assert.equal(result.matchedLegCount, 3);
  assert.equal(result.score, 76);
  assert.deepEqual(result.scoreBreakdown, {
    schedule: 50,
    detour: 16,
    destination: 10,
    total: 76,
  });
  assert.deepEqual(
    result.matchedDays.map(({ day, legs }) => [day, legs.map(({ leg }) => leg)]),
    [
      ['mon', ['arriveBy', 'leaveAt']],
      ['wed', ['arriveBy']],
    ],
  );
  assert.match(result.explanations[0], /3 of 3/);
  assert.match(result.explanations[1], /adds 6 minutes/);
});

test('rejects candidates with no seats, schedule overlap, route, or acceptable detour', () => {
  const noSeats = evaluateCommuteMatch({ ...driver, seatsAvailable: 0 }, rider, {
    directDurationMinutes: 60,
    pickupDurationMinutes: 66,
  });
  const noSchedule = evaluateCommuteMatch(
    driver,
    { ...rider, days: [{ day: 'fri', arriveBy: 9 * 60, leaveAt: null }] },
    { directDurationMinutes: 60, pickupDurationMinutes: 66 },
  );
  const noRoute = evaluateCommuteMatch(driver, rider, null);
  const excessiveDetour = evaluateCommuteMatch(driver, rider, {
    directDurationMinutes: 60,
    pickupDurationMinutes: 71,
  });

  assert.deepEqual(noSeats.rejections.map(({ code }) => code), ['no-seats']);
  assert.deepEqual(noSchedule.rejections.map(({ code }) => code), ['no-schedule-overlap']);
  assert.deepEqual(noRoute.rejections.map(({ code }) => code), ['route-unavailable']);
  assert.deepEqual(excessiveDetour.rejections.map(({ code }) => code), ['detour-exceeded']);
  assert.equal(excessiveDetour.score, null);
});

test('uses separate arrival and departure tolerances', () => {
  const strictRider = {
    ...rider,
    days: [{ day: 'mon', arriveBy: 8 * 60 + 55, leaveAt: 17 * 60 + 45 }],
  };
  const result = evaluateCommuteMatch(
    driver,
    strictRider,
    { directDurationMinutes: 60, pickupDurationMinutes: 65 },
    { maxArrivalLateMinutes: 10, maxDepartureDifferenceMinutes: 30 },
  );

  assert.equal(result.compatible, true);
  assert.equal(result.matchedLegCount, 1);
  assert.equal(result.matchedDays[0].legs[0].leg, 'arriveBy');
  assert.equal(result.matchedDays[0].legs[0].differenceMinutes, 5);
});

test('can require the exact same campus destination', () => {
  const result = evaluateCommuteMatch(
    driver,
    { ...rider, campusLot: 'westSide' },
    { directDurationMinutes: 60, pickupDurationMinutes: 65 },
    { requireSameCampusLot: true },
  );

  assert.deepEqual(result.rejections.map(({ code }) => code), ['destination-mismatch']);
});

test('ranks compatible riders first by score, then detour, with a stable id tie-breaker', () => {
  const partial = {
    ...rider,
    id: 'partial',
    days: [
      ...rider.days,
      { day: 'fri', arriveBy: 9 * 60, leaveAt: null },
    ],
  };
  const closeB = { ...rider, id: 'close-b' };
  const closeA = { ...rider, id: 'close-a' };
  const unavailable = { ...rider, id: 'unavailable' };
  const routeEstimates = {
    partial: { directDurationMinutes: 60, pickupDurationMinutes: 65 },
    'close-a': { directDurationMinutes: 60, pickupDurationMinutes: 62 },
    'close-b': { directDurationMinutes: 60, pickupDurationMinutes: 62 },
    unavailable: null,
  };

  const results = rankRiderMatches(
    driver,
    [unavailable, closeB, partial, closeA],
    routeEstimates,
  );

  assert.deepEqual(results.map(({ riderId }) => riderId), [
    'close-a',
    'close-b',
    'partial',
    'unavailable',
  ]);
});

test('rejects invalid matching configuration', () => {
  assert.throws(
    () =>
      evaluateCommuteMatch(
        driver,
        rider,
        { directDurationMinutes: 60, pickupDurationMinutes: 65 },
        { maxArrivalEarlyMinutes: -1 },
      ),
    /non-negative finite numbers/,
  );
});
