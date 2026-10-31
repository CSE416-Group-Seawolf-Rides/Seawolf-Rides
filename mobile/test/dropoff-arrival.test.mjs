import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateCalendarPair, compareCalendarMatches } from '../src/calendar/calendarMatching.ts';
import { buildCommuteSchedule, commuteToDraft, riderDropoffTitle } from '../src/commute/commuteModel.ts';
import { parseCommuteDocument, toCommuteDocument } from '../src/persistence/userDataModel.ts';
import { preferredArrivalWindow } from '../src/commute/arrivalPolicy.ts';
import { suggestedStartMinute } from '../src/commute/morningTiming.ts';
import { localMinuteToEpoch } from '../src/mvp/settings.ts';
const date = '2026-10-19', at = (minute) => localMinuteToEpoch(date, minute), now = at(0);
const point = { latitude: 40.92, longitude: -73.12 };
const day = { day: 'mon', mode: 'drive', startAt: 530, arriveBy: 540, leaveAt: 1020 };
const commute = { startPoint: point, startArea: { center: point, label: 'Area', radiusMiles: 2 }, campusLot: 'westSide', days: [day], seats: 1, discoveryEnabled: true };
const driver = { uid: 'd', name: 'Driver', revision: 'd1', day, commute };
const rider = { uid: 'r', name: 'Rider', revision: 'r1', day: { ...day, mode: 'ride', startAt: 480 }, commute: { ...commute, campusLot: 'lot40' } };
const routing = { route: async (points) => ({ status: 'SUCCESS', route: {
  durationSeconds: points.length === 2 ? 1800 : 2100, distanceMeters: 10000,
  legs: (points.length === 2 ? [1800] : [600,1500]).map((durationSeconds) => ({ durationSeconds, distanceMeters: 5000 })),
  snappedWaypoints: points.map((input) => ({ input, distanceMeters: 0 })),
} }) };
test('Any round-trips without changing a Both user’s driver parking', () => {
  const built = buildCommuteSchedule({ ...commuteToDraft(commute), riderDropoffPreference: 'any' }, 'both');
  assert.equal(built.campusLot, 'westSide');
  const saved = parseCommuteDocument(toCommuteDocument('d', built), 'd');
  assert.equal(saved.riderDropoffPreference, 'any');
  assert.equal(riderDropoffTitle(saved), 'Any');
  assert.equal(commuteToDraft(saved).riderDropoffPreference, 'any');
  assert.throws(() => toCommuteDocument('d', { ...built, riderDropoffPreference: 'unknown' }));
});
test('different preferred stops and Any riders remain feasible at the driver’s actual campus stop', async () => {
  for (const riderCommute of [{ ...rider.commute }, { ...rider.commute, campusLot: 'other', riderDropoffPreference: 'any' }]) {
    const calls = [];
    const result = await evaluateCalendarPair(driver, { ...rider, commute: riderCommute }, date,
      { route: async (points) => { calls.push(points); return routing.route(points); } }, now);
    assert.equal(result.status, 'FEASIBLE');
    assert.equal(result.plan.vehicleCampusArrival, at(537));
    assert.ok(calls.every((points) => points.at(-1).latitude === 40.9130574));
  }
});
test('a late usual departure is proposed earlier for review, with pickup/boarding included and no saved mutation', async () => {
  const result = await evaluateCalendarPair(driver, rider, date, routing, now);
  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.plan.departure, at(500));
  assert.equal(result.plan.pickup, at(510));
  assert.equal(result.plan.boardingComplete, at(512));
  assert.equal(result.plan.vehicleCampusArrival, at(537));
  assert.equal(driver.day.startAt, 530);
});
test('9 AM is a real deadline; arrival window respects early bounds and deadline is inclusive', async () => {
  assert.deepEqual(preferredArrivalWindow(date, { arriveBy: 540, leaveAt: null }), { earliest: at(520), latest: at(540) });
  const atDeadline = await evaluateCalendarPair(driver, { ...rider, day: { ...rider.day, startAt: 513 } }, date, routing, now);
  assert.equal(atDeadline.status, 'FEASIBLE');
  assert.equal(atDeadline.plan.vehicleCampusArrival, at(540));
  assert.equal((await evaluateCalendarPair(driver, { ...rider, day: { ...rider.day, startAt: 514 } }, date, routing, now)).status, 'INFEASIBLE');
  assert.equal((await evaluateCalendarPair(driver, { ...rider, day: { ...rider.day, arriveBy: 565 } }, date, routing, now)).status, 'INFEASIBLE');
});
test('buffered onboarding rounding stays 2–5 minutes early for fractional-minute durations', () => {
  for (const duration of [60,308,1800,1801,2700,3509]) {
    const depart = suggestedStartMinute(540, duration);
    const early = 540 * 60 - (depart * 60 + duration);
    assert.ok(early >= 120 && early <= 300, `${duration}: ${early}`);
  }
});
test('timing remains primary; preferred drop-off breaks ties before detour and stable identity', () => {
  const base = { driverId: 'z', riderId: 'r', arrivalDifferenceSeconds: 180, addedDrivingSeconds: 400, dropoffPreferenceMatch: true };
  const alternative = { ...base, driverId: 'a', addedDrivingSeconds: 0, dropoffPreferenceMatch: false };
  assert.deepEqual([alternative,base].sort(compareCalendarMatches).map((m) => m.driverId), ['z','a']);
  assert.ok(compareCalendarMatches({ ...alternative, arrivalDifferenceSeconds: 60 }, base) < 0);
  assert.ok(compareCalendarMatches({ ...base, driverId: 'a' }, base) < 0);
});


test('Any does not invent an onboarding destination; Both still gets driving-day forecasts', async () => {
  const { forecastableDays } = await import('../src/commute/commuteForecast.ts');
  assert.deepEqual(forecastableDays({ campusLot: 'other', riderDropoffPreference: 'any', days: [day] }), []);
  const days = [day, { ...day, day: 'tue', mode: 'ride' }, { ...day, day: 'wed', mode: 'either' }];
  assert.deepEqual(forecastableDays({ campusLot: 'westSide', riderDropoffPreference: 'any', days }).map((d) => d.day), ['mon']);
  assert.equal(forecastableDays({ campusLot: 'westSide', days }).length, 3);
});
