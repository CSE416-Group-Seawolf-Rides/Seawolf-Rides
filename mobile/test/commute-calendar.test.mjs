import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calendarDay,
  shiftDate,
  parseDayOverride,
} from '../src/calendar/commuteCalendar.ts';
import {
  arrivalTargetsOverlap,
  compareCalendarMatches,
  mergeCalendarPages,
  evaluateCalendarPair,
} from '../src/calendar/calendarMatching.ts';
import {
  buildCommuteSchedule,
  commuteToDraft,
  toPrivacyArea,
} from '../src/commute/commuteModel.ts';
import {
  toCommuteDocument,
  parseCommuteDocument,
} from '../src/persistence/userDataModel.ts';
import { localMinuteToEpoch } from '../src/mvp/settings.ts';
const point = { latitude: 40.92047, longitude: -73.12844 };
const commute = {
  startArea: toPrivacyArea(point, 'Stony Brook area'),
  startPoint: point,
  discoveryEnabled: true,
  campusLot: 'westSide',
  seats: 2,
  days: [
    { day: 'mon', mode: 'drive', startAt: 480, arriveBy: 540, leaveAt: 1020 },
    { day: 'tue', mode: 'either', startAt: 480, arriveBy: 540, leaveAt: 1020 },
    { day: 'wed', mode: 'drive', startAt: 480, arriveBy: 540, leaveAt: 1020 },
  ],
};
const date = '2026-10-19';
const now = localMinuteToEpoch('2026-10-18', 0);
const driver = {
  uid: 'd',
  name: 'Driver',
  revision: 'd1',
  commute,
  day: commute.days[0],
};
const rider = {
  uid: 'r',
  name: 'Rider',
  revision: 'r1',
  commute,
  day: { ...commute.days[0], mode: 'ride' },
};
const router = {
  route: async (points) => ({
    status: 'SUCCESS',
    route: {
      durationSeconds: points.length === 2 ? 1800 : 2100,
      distanceMeters: 10000,
      snappedWaypoints: points.map((input) => ({ input, distanceMeters: 0 })),
      legs: (points.length === 2 ? [1800] : [600, 1500]).map(
        (durationSeconds) => ({
          durationSeconds,
          distanceMeters: 5000,
        }),
      ),
    },
  }),
};
test('weekly roles repeat; date-only override and reset preserve the weekly template', () => {
  assert.equal(calendarDay(commute, 'both', date).mode, 'drive');
  assert.equal(calendarDay(commute, 'both', shiftDate(date, 1)).mode, 'either');
  assert.equal(calendarDay(commute, 'both', shiftDate(date, 7)).mode, 'drive');
  assert.equal(
    calendarDay(commute, 'both', date, { mode: 'ride' }).mode,
    'ride',
  );
  assert.equal(calendarDay(commute, 'both', shiftDate(date, 7)).mode, 'drive');
  assert.equal(calendarDay(commute, 'both', date, { mode: 'off' }), null);
  assert.equal(calendarDay(commute, 'both', shiftDate(date, 3)), null);
  assert.equal(
    calendarDay(commute, 'both', shiftDate(date, 3), { mode: 'ride' }).arriveBy,
    540,
  );
  assert.equal(
    calendarDay(commute, 'driver', shiftDate(date, 1)).mode,
    'drive',
  );
  assert.equal(calendarDay(commute, 'rider', date).mode, 'ride');
  assert.throws(() => parseDayOverride({ mode: 'surprise' }));
});
test('exact point and discovery preference survive edit/save; old approximate-only commutes still load', () => {
  const built = buildCommuteSchedule(commuteToDraft(commute), 'both');
  assert.deepEqual(built.startPoint, point);
  assert.deepEqual(
    parseCommuteDocument(toCommuteDocument('d', built), 'd').startPoint,
    point,
  );
  assert.notDeepEqual(built.startArea.center, point);
  const { startPoint, discoveryEnabled, ...legacy } = commute;
  assert.equal(
    parseCommuteDocument(toCommuteDocument('d', legacy), 'd').startPoint,
    undefined,
  );
  assert.throws(() =>
    toCommuteDocument('d', {
      ...commute,
      startPoint: { latitude: NaN, longitude: 10 },
    }),
  );
});
test('proposes a departure for buffered arrival while respecting rider readiness', async () => {
  const result = await evaluateCalendarPair(driver, rider, date, router, now);
  assert.equal(result.status, 'FEASIBLE');
  assert.equal(
    result.plan.vehicleCampusArrival,
    localMinuteToEpoch(date, 537),
  );
  assert.equal(result.plan.departure, localMinuteToEpoch(date, 500));
  assert.equal(result.plan.pickup, result.plan.departure + 600);
  assert.equal(result.metrics.driverExtraDurationSeconds, 420);
  assert.equal(
    (await evaluateCalendarPair(driver, driver, date, router, now)).status,
    'INFEASIBLE',
  );
});
test('missing exact locations, wrong roles, no seats and nonfinite estimates never produce recommendations', async () => {
  assert.equal(
    (
      await evaluateCalendarPair(
        { ...driver, commute: { ...commute, startPoint: undefined } },
        rider,
        date,
        router,
        now,
      )
    ).status,
    'UNKNOWN',
  );
  assert.equal(
    (
      await evaluateCalendarPair(
        { ...driver, day: rider.day },
        rider,
        date,
        router,
        now,
      )
    ).status,
    'INFEASIBLE',
  );
  assert.notEqual(
    (
      await evaluateCalendarPair(
        { ...driver, commute: { ...commute, seats: 0 } },
        rider,
        date,
        router,
        now,
      )
    ).status,
    'FEASIBLE',
  );
  const malformed = {
    route: async (points) => {
      const value = await router.route(points);
      value.route.legs[0].durationSeconds = Infinity;
      return value;
    },
  };
  assert.equal(
    (await evaluateCalendarPair(driver, rider, date, malformed, now)).status,
    'UNKNOWN',
  );
});

test('saved morning timing survives persistence and blocks pickups before rider readiness', async () => {
  const { setStartTime, toggleDay, hasMorningTimes, hasSameTimes } =
    await import('../src/commute/commuteModel.ts');
  let days = toggleDay([], 'mon', 'driver');
  assert.equal(hasMorningTimes(days), false);
  days = setStartTime(days, 'all', 450);
  days = toggleDay(days, 'tue', 'driver');
  assert.equal(days[1].startAt, 450);
  assert.equal(hasMorningTimes(days), true);
  days = setStartTime(days, 'tue', 480);
  assert.equal(hasSameTimes(days), false);
  const parsed = parseCommuteDocument(
    toCommuteDocument('d', { ...commute, days }),
    'd',
  );
  assert.equal(parsed.days[1].startAt, 480);
  assert.throws(() =>
    toCommuteDocument('d', {
      ...commute,
      days: [{ ...commute.days[0], startAt: Infinity }],
    }),
  );
  assert.throws(() =>
    toCommuteDocument('d', {
      ...commute,
      days: [{ ...commute.days[0], startAt: 600 }],
    }),
  );
  const notReady = await evaluateCalendarPair(
    driver,
    { ...rider, day: { ...rider.day, startAt: 538 } },
    date,
    router,
    now,
  );
  assert.equal(notReady.status, 'INFEASIBLE');
  assert.equal(
    (
      await evaluateCalendarPair(
        { ...driver, day: { ...driver.day, startAt: undefined } },
        rider,
        date,
        router,
        now,
      )
    ).status,
    'UNKNOWN',
  );
});

test('preferred arrival target discovery is inclusive at ±30 minutes and rejects ±31 before routing', async () => {
  for (const target of [510, 570]) {
    assert.equal(arrivalTargetsOverlap(540, target), true);
  }
  for (const target of [509, 571, NaN, Infinity, -1, 1440, null]) {
    assert.equal(arrivalTargetsOverlap(540, target), false);
    if (target === 509 || target === 571) {
      const result = await evaluateCalendarPair(
        driver,
        { ...rider, day: { ...rider.day, arriveBy: target } },
        date,
        {
          route() {
            throw new Error('Must not route outside target range');
          },
        },
        now,
      );
      assert.deepEqual(result, {
        status: 'INFEASIBLE',
        reasonCodes: ['ARRIVAL_PREFERENCE_MISMATCH'],
      });
    }
  }
});
test('saved departures are reviewable references; proposals arrive at most five minutes early and never late', async () => {
  for (const startAt of [473, 500, 533, 534]) {
    const result = await evaluateCalendarPair({ ...driver, day: { ...driver.day, startAt } }, rider, date, router, now);
    assert.equal(result.status, 'FEASIBLE');
    assert.equal(result.plan.vehicleCampusArrival, localMinuteToEpoch(date, 537));
    assert.equal(result.plan.departure, localMinuteToEpoch(date, 500));
  }
  const noSharedWindow = await evaluateCalendarPair(driver, { ...rider, day: { ...rider.day, arriveBy: 550 } }, date, router, now);
  assert.equal(noSharedWindow.status, 'INFEASIBLE');
  const returnBound = await evaluateCalendarPair(driver, { ...rider, day: { ...rider.day, leaveAt: 534 } }, date, router, now);
  assert.equal(returnBound.status, 'INFEASIBLE');
});
test('invalid saved arrival/start times and nonfinite current times remain UNKNOWN', async () => {
  for (const value of [NaN, Infinity, -1, 1440, 500.5]) {
    assert.equal(
      (
        await evaluateCalendarPair(
          { ...driver, day: { ...driver.day, startAt: value } },
          rider,
          date,
          router,
          now,
        )
      ).status,
      'UNKNOWN',
    );
    assert.equal(
      (
        await evaluateCalendarPair(
          driver,
          { ...rider, day: { ...rider.day, arriveBy: value } },
          date,
          router,
          now,
        )
      ).status,
      'UNKNOWN',
    );
  }
  assert.equal(
    (await evaluateCalendarPair(driver, rider, date, router, NaN)).status,
    'UNKNOWN',
  );
});
test('pages rank actual arrival first, detour second, stable identities last and refuse stale lists', () => {
  const make = (driverId, arrivalDifferenceSeconds, addedDrivingSeconds) => ({
    driverId,
    riderId: 'r',
    arrivalDifferenceSeconds,
    addedDrivingSeconds,
  });
  const matches = [
    make('z', 0, 500),
    make('b', 60, 100),
    make('a', 60, 100),
    make('c', 60, 90),
    make('d', 120, 0),
  ];
  assert.deepEqual(
    [...matches]
      .reverse()
      .sort(compareCalendarMatches)
      .map((m) => m.driverId),
    ['z', 'c', 'a', 'b', 'd'],
  );
  const first = {
    policyVersion: 3,
    searchRevision: 'same',
    totalCandidatePlans: 5,
    checkedCandidatePlans: 2,
    nextCursor: 'next',
    matches: matches.slice(1),
    incomplete: true,
    unknownCount: 1,
    incompatibleCount: 2,
  };
  const next = {
    ...first,
    checkedCandidatePlans: 5,
    nextCursor: null,
    incomplete: false,
    matches: [matches[0], matches[1]],
    unknownCount: 2,
    incompatibleCount: 1,
  };
  const result = mergeCalendarPages(first, next);
  assert.deepEqual(
    result.matches.map((m) => m.driverId),
    ['z', 'c', 'a', 'b', 'd'],
  );
  assert.equal(result.unknownCount, 3);
  assert.equal(result.incompatibleCount, 3);
  assert.equal(result.incomplete, false);
  assert.throws(
    () => mergeCalendarPages(first, { ...next, searchRevision: 'changed' }),
    /changed/,
  );
});
