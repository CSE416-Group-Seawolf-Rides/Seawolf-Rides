import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCommuteSchedule,
  countTrips,
  distanceMiles,
  emptyCommuteDraft,
  formatTime,
  getDayError,
  hasSameTimes,
  isScheduleValid,
  setLegTime,
  toggleDay,
  toPrivacyArea,
} from '../src/commute/commuteModel.ts';

const home = { latitude: 40.8687, longitude: -73.0773 }; // around Centereach

test('the privacy area is at most ~1.41 miles from the real point, inside the 2-mile circle', () => {
  const area = toPrivacyArea(home, 'Centereach area');
  const offset = distanceMiles(home, area.center);

  assert.equal(area.radiusMiles, 2);
  assert.ok(offset <= Math.SQRT2 + 0.01, `offset was ${offset}`);
  assert.ok(offset < area.radiusMiles);
});

test('nearby homes in the same grid cell share one privacy area', () => {
  const { center } = toPrivacyArea(home, '');
  const a = { latitude: center.latitude + 0.004, longitude: center.longitude - 0.004 };
  const b = { latitude: center.latitude - 0.004, longitude: center.longitude + 0.004 };

  assert.deepEqual(toPrivacyArea(a, '').center, center);
  assert.deepEqual(toPrivacyArea(b, '').center, center);
});

test('formats times as 12-hour clock strings', () => {
  assert.equal(formatTime(9 * 60), '9:00 AM');
  assert.equal(formatTime(12 * 60 + 30), '12:30 PM');
  assert.equal(formatTime(0), '12:00 AM');
  assert.equal(formatTime(17 * 60 + 45), '5:45 PM');
});

test('new days copy the usual times and stay in weekday order', () => {
  let days = toggleDay([], 'wed', 'rider');
  days = setLegTime(days, 'all', 'arriveBy', 8 * 60);
  days = toggleDay(days, 'mon', 'rider');

  assert.deepEqual(days.map((d) => d.day), ['mon', 'wed']);
  assert.equal(days[0].arriveBy, 8 * 60);
  assert.equal(days[0].mode, 'ride');
  assert.equal(hasSameTimes(days), true);
});

test('tapping a selected day removes it', () => {
  const days = toggleDay(toggleDay([], 'mon', 'driver'), 'mon', 'driver');

  assert.deepEqual(days, []);
});

test('flags a leave time before arrival and a day with no trips', () => {
  const [day] = toggleDay([], 'tue', 'rider');

  assert.equal(getDayError({ ...day, arriveBy: 17 * 60, leaveAt: 9 * 60 }), 'Leave time should be after you arrive.');
  assert.equal(getDayError({ ...day, arriveBy: null, leaveAt: null }), 'Add at least one trip, or remove this day.');
  assert.equal(getDayError({ ...day, leaveAt: null }), null);
});

test('counts one trip per leg that needs a ride', () => {
  let days = toggleDay(toggleDay([], 'mon', 'rider'), 'tue', 'rider');
  days = setLegTime(days, 'tue', 'leaveAt', null);

  assert.equal(countTrips(days), 3);
  assert.equal(hasSameTimes(days), false);
  assert.equal(isScheduleValid(days), true);
});

test('saving requires every part and drops seats for riders', () => {
  const days = toggleDay([], 'mon', 'rider');
  const draft = {
    ...emptyCommuteDraft,
    startArea: toPrivacyArea(home, 'Centereach area'),
    campusLot: 'tabler',
    days,
    seats: 4,
  };

  assert.equal(buildCommuteSchedule(draft, 'rider').seats, undefined);
  assert.equal(buildCommuteSchedule(draft, 'driver').seats, 4);
  assert.throws(() => buildCommuteSchedule({ ...draft, campusLot: undefined }, 'rider'));
  assert.throws(() => buildCommuteSchedule({ ...draft, days: [] }, 'rider'));
});
