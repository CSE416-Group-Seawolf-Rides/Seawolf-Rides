import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateCalendarPair, compareCalendarMatches } from '../src/calendar/calendarMatching.ts';
import { preferredArrivalWindow } from '../src/commute/arrivalPolicy.ts';
import { matchScheduleLabel } from '../src/calendar/matchPresentation.ts';
import { localMinuteToEpoch } from '../src/mvp/settings.ts';

const date = '2026-11-02', at = (minute) => localMinuteToEpoch(date, minute), now = at(0);
const point = { latitude: 40.92, longitude: -73.12 };
const day = { day: 'mon', mode: 'drive', startAt: 420, arriveBy: 540, leaveAt: 1020 };
const commute = { startPoint: point, startArea: { center: point, label: 'Area', radiusMiles: 2 }, campusLot: 'westSide', days: [day], seats: 3, discoveryEnabled: true };
const driver = { uid: 'd', name: 'Driver', revision: 'd1', day, commute };
const rider = { uid: 'r', name: 'Rider', revision: 'r1', day: { ...day, mode: 'ride' }, commute };
const routing = { route: async (points) => ({ status: 'SUCCESS', route: {
  durationSeconds: points.length === 2 ? 1800 : 2100, distanceMeters: 10000,
  legs: (points.length === 2 ? [1800] : [600,1500]).map((durationSeconds) => ({ durationSeconds, distanceMeters: 5000 })),
  snappedWaypoints: points.map((input) => ({ input, distanceMeters: 0 })),
} }) };

test('9 AM and 10 AM preferences meet near the midpoint within both windows', async () => {
  const result = await evaluateCalendarPair(driver, { ...rider, day: { ...rider.day, arriveBy: 600 } }, date, routing, now);
  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.plan.vehicleCampusArrival, at(567));
  assert.equal(result.plan.riderDestinationArrival, at(567));
  assert.equal(driver.day.arriveBy, 540);
});

test('the shared 45-minute boundary is inclusive and never expands to a union of both windows', async () => {
  const edge = await evaluateCalendarPair(driver, { ...rider, day: { ...rider.day, arriveBy: 630 } }, date, routing, now);
  assert.equal(edge.status, 'FEASIBLE');
  assert.equal(edge.plan.vehicleCampusArrival, at(585));
  const outside = await evaluateCalendarPair(driver, { ...rider, day: { ...rider.day, arriveBy: 631 } }, date, routing, now);
  assert.equal(outside.status, 'INFEASIBLE');
  assert.deepEqual(outside.reasonCodes, ['ARRIVAL_PREFERENCE_MISMATCH']);
});

test('flexibility respects the local date, current time and a saved return', () => {
  assert.deepEqual(preferredArrivalWindow(date, { arriveBy: 15, leaveAt: null }), { earliest: at(0), latest: at(60) });
  assert.deepEqual(preferredArrivalWindow(date, { arriveBy: 1430, leaveAt: null }), { earliest: at(1385), latest: at(1439) + 59 });
  assert.deepEqual(preferredArrivalWindow(date, { arriveBy: 540, leaveAt: 560 }, at(530)), { earliest: at(530), latest: at(560) });
});

test('return departures use the intersection of the same two preference windows', async () => {
  const result = await evaluateCalendarPair(driver, { ...rider, day: { ...rider.day, leaveAt: 1080 } }, date, routing, now, 'FROM_CAMPUS');
  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.plan.departure, at(1050));
});

test('ranking considers both schedules and travel instead of letting seconds outweigh a long detour', () => {
  const base = { driverId: 'a', riderId: 'r', arrivalDifferenceSeconds: 0, otherScheduleOffsetSeconds: 0, addedDrivingSeconds: 1800 };
  const practical = { ...base, driverId: 'b', arrivalDifferenceSeconds: 120, otherScheduleOffsetSeconds: -120, addedDrivingSeconds: 300 };
  const disruptive = { ...practical, driverId: 'c', otherScheduleOffsetSeconds: -2700 };
  assert.deepEqual([base, disruptive, practical].sort(compareCalendarMatches).map((match) => match.driverId), ['b', 'a', 'c']);
  const extraRide = { ...practical, driverId: 'd', metrics: { riderExtraInVehicleSeconds: 1800 } };
  assert.ok(compareCalendarMatches(practical, extraRide) < 0);
});

test('match cards show the direction and size of a timing change, including a retained request plan', () => {
  const plan = { occurrence: { localDate: date, direction: 'TO_CAMPUS' }, departure: at(500), vehicleCampusArrival: at(560), riderDestinationArrival: at(560) };
  const match = { driverId: 'd', riderId: 'r', plan, preferredTimeEpochSeconds: at(540) };
  assert.equal(matchScheduleLabel(match, 'r'), 'Arrives 20 min after your preferred time');
  assert.equal(matchScheduleLabel(match, 'r', { ...plan, riderDestinationArrival: at(520) }), 'Arrives 20 min before your preferred time');
  assert.equal(matchScheduleLabel({ ...match, direction: 'FROM_CAMPUS', preferredTimeEpochSeconds: at(510) }, 'd'), 'Departs 10 min before your preferred time');
  assert.equal(matchScheduleLabel({ ...match, preferredTimeEpochSeconds: undefined }, 'r'), null);
});
