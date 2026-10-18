import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarDay, shiftDate, parseDayOverride } from '../src/calendar/commuteCalendar.ts';
import { evaluateCalendarPair } from '../src/calendar/calendarMatching.ts';
import {
  buildCommuteSchedule,
  commuteToDraft,
  toPrivacyArea,
} from '../src/commute/commuteModel.ts';
import { toCommuteDocument, parseCommuteDocument } from '../src/persistence/userDataModel.ts';
import { localMinuteToEpoch } from '../src/mvp/settings.ts';
const point = { latitude: 40.92047, longitude: -73.12844 };
const commute = {
  startArea: toPrivacyArea(point, 'Stony Brook area'),
  startPoint: point,
  discoveryEnabled: true,
  campusLot: 'westSide',
  seats: 2,
  days: [
    { day: 'mon', mode: 'drive', arriveBy: 540, leaveAt: 1020 },
    { day: 'tue', mode: 'either', arriveBy: 540, leaveAt: 1020 },
    { day: 'wed', mode: 'drive', arriveBy: 540, leaveAt: 1020 },
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
      legs: (points.length === 2 ? [1800] : [600, 1500]).map((durationSeconds) => ({
        durationSeconds,
        distanceMeters: 5000,
      })),
    },
  }),
};
test('weekly roles repeat; date-only override and reset preserve the weekly template', () => {
  assert.equal(calendarDay(commute, 'both', date).mode, 'drive');
  assert.equal(calendarDay(commute, 'both', shiftDate(date, 1)).mode, 'either');
  assert.equal(calendarDay(commute, 'both', shiftDate(date, 7)).mode, 'drive');
  assert.equal(calendarDay(commute, 'both', date, { mode: 'ride' }).mode, 'ride');
  assert.equal(calendarDay(commute, 'both', shiftDate(date, 7)).mode, 'drive');
  assert.equal(calendarDay(commute, 'both', date, { mode: 'off' }), null);
  assert.equal(calendarDay(commute, 'both', shiftDate(date, 3)), null);
  assert.equal(calendarDay(commute, 'both', shiftDate(date, 3), { mode: 'ride' }).arriveBy, 540);
  assert.equal(calendarDay(commute, 'driver', shiftDate(date, 1)).mode, 'drive');
  assert.equal(calendarDay(commute, 'rider', date).mode, 'ride');
  assert.throws(() => parseDayOverride({ mode: 'surprise' }));
});
test('exact point and discovery preference survive edit/save; old approximate-only commutes still load', () => {
  const built = buildCommuteSchedule(commuteToDraft(commute), 'both');
  assert.deepEqual(built.startPoint, point);
  assert.deepEqual(parseCommuteDocument(toCommuteDocument('d', built), 'd').startPoint, point);
  assert.notDeepEqual(built.startArea.center, point);
  const { startPoint, discoveryEnabled, ...legacy } = commute;
  assert.equal(parseCommuteDocument(toCommuteDocument('d', legacy), 'd').startPoint, undefined);
  assert.throws(() =>
    toCommuteDocument('d', {
      ...commute,
      startPoint: { latitude: NaN, longitude: 10 },
    }),
  );
});
test('proposes latest feasible times from saved arrival deadlines without extra user inputs', async () => {
  const result = await evaluateCalendarPair(driver, rider, date, router, now);
  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.plan.vehicleCampusArrival, localMinuteToEpoch(date, 540));
  assert.equal(result.plan.departure, localMinuteToEpoch(date, 540) - 2220);
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
    (await evaluateCalendarPair({ ...driver, day: rider.day }, rider, date, router, now)).status,
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
  assert.equal((await evaluateCalendarPair(driver, rider, date, malformed, now)).status, 'UNKNOWN');
});
