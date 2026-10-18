import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  currentCarpools,
  homeHeaderDate,
  rideDate,
  rideEnd,
  rideHistory,
  requestNeedsAnswer,
  startOfWeek,
  weekAgenda,
} from '../src/mvp/ridePresentation.ts';
import { localMinuteToEpoch } from '../src/mvp/settings.ts';

const at = (date, minute) => localMinuteToEpoch(date, minute);
function ride(id, date, changes = {}) {
  return {
    id,
    participantIds: ['me', 'alex'],
    driverId: 'me',
    riderId: 'alex',
    driverName: 'Me',
    riderName: 'Alex',
    localDate: date,
    status: 'ACCEPTED',
    pickupLabel: 'Station area',
    campusLabel: 'West Side',
    plan: {
      departure: at(date, 450),
      pickup: at(date, 460),
      vehicleCampusArrival: at(date, 510),
      riderDestinationArrival: at(date, 510),
    },
    ...changes,
  };
}
const monday = ride('mon', '2026-10-19');
const wednesday = ride('wed', '2026-10-21');

test('only the Home header expands the month; trip labels stay abbreviated', () => {
  assert.equal(homeHeaderDate('2026-10-18'), 'Sunday, October 18');
  assert.match(homeHeaderDate('2026-11-01'), /November/);
  assert.equal(rideDate('2026-10-19'), 'Mon, Oct 19');
});
test('a Monday/Wednesday carpool shrinks at Monday arrival and disappears at the final arrival', () => {
  const records = [wednesday, monday];
  assert.deepEqual(
    currentCarpools(records, 'me', at('2026-10-19', 449))[0].accepted.map(
      (r) => r.id,
    ),
    ['mon', 'wed'],
  );
  assert.deepEqual(
    currentCarpools(records, 'me', rideEnd(monday))[0].accepted.map(
      (r) => r.id,
    ),
    ['wed'],
  );
  assert.equal(currentCarpools(records, 'me', rideEnd(wednesday)).length, 0);
  assert.deepEqual(
    rideHistory(records, 'me', rideEnd(wednesday)).map((r) => r.id),
    ['wed', 'mon'],
  );
  assert.equal(
    monday.status,
    'ACCEPTED',
    'presentation never rewrites persisted status',
  );
});
test('ongoing rides remain active until both arrival boundaries have passed', () => {
  const later = {
    ...monday,
    plan: {
      ...monday.plan,
      riderDestinationArrival: monday.plan.vehicleCampusArrival + 300,
    },
  };
  assert.equal(
    currentCarpools([later], 'me', monday.plan.vehicleCampusArrival).length,
    1,
  );
  assert.equal(currentCarpools([later], 'me', rideEnd(later)).length, 0);
});
test('live record edits, removals, names and timing are reflected without a saved carpool cache', () => {
  const now = rideEnd(monday);
  assert.equal(
    currentCarpools([monday, { ...wednesday, status: 'DECLINED' }], 'me', now)
      .length,
    0,
  );
  assert.equal(currentCarpools([monday], 'me', now).length, 0);
  const changed = {
    ...wednesday,
    riderName: 'Alex updated',
    pickupLabel: 'New agreed spot',
    plan: { ...wednesday.plan, pickup: wednesday.plan.pickup + 60 },
  };
  const pool = currentCarpools([changed], 'me', now)[0];
  assert.equal(pool.name, 'Alex updated');
  assert.equal(pool.accepted[0].pickupLabel, 'New agreed spot');
  assert.equal(pool.accepted[0].plan.pickup, wednesday.plan.pickup + 60);
});
test('one person can drive and ride on different days; equal names never combine different accounts', () => {
  const reverse = {
    ...wednesday,
    driverId: 'alex',
    riderId: 'me',
    driverName: 'Alex',
    riderName: 'Me',
  };
  const sameName = ride('other', '2026-10-22', {
    riderId: 'different',
    riderName: 'Alex',
    participantIds: ['me', 'different'],
  });
  const groups = currentCarpools(
    [monday, reverse, sameName],
    'me',
    at('2026-10-18', 600),
  );
  assert.equal(groups.length, 2);
  assert.equal(groups[0].accepted.length, 2);
});
test('pending requests are visibly separate from confirmed trips and expire at departure', () => {
  const pending = { ...monday, status: 'PENDING' };
  assert.equal(
    requestNeedsAnswer(pending, 'me', monday.plan.departure - 1),
    true,
  );
  assert.equal(
    requestNeedsAnswer(pending, 'alex', monday.plan.departure - 1),
    false,
  );
  assert.equal(
    currentCarpools([pending], 'me', monday.plan.departure - 1).length,
    0,
  );
  const outgoing = currentCarpools(
    [pending],
    'alex',
    monday.plan.departure - 1,
  )[0];
  assert.equal(outgoing.accepted.length, 0);
  assert.equal(outgoing.pending.length, 1);
  assert.equal(outgoing.name, 'Me');
  assert.equal(
    currentCarpools([pending], 'alex', monday.plan.departure).length,
    0,
  );
  assert.equal(requestNeedsAnswer(pending, 'me', monday.plan.departure), false);
  assert.equal(rideHistory([pending], 'me', monday.plan.departure).length, 1);
});
test('history isolates participants and includes declined and expired asks without future confirmations', () => {
  const declined = { ...wednesday, id: 'declined', status: 'DECLINED' };
  const unrelated = { ...monday, id: 'unrelated', participantIds: ['x', 'y'] };
  assert.deepEqual(
    rideHistory(
      [monday, wednesday, declined, unrelated],
      'me',
      rideEnd(monday),
    ).map((r) => r.id),
    ['declined', 'mon'],
  );
  assert.equal(
    currentCarpools([unrelated], 'me', at('2026-10-18', 600)).length,
    0,
  );
});
test('agendas honor date overrides and current accepted records rather than invent recurring accepted rides', () => {
  const commute = {
    campusLot: 'westSide',
    days: [
      { day: 'mon', mode: 'drive', startAt: 450, arriveBy: 540, leaveAt: null },
      { day: 'tue', mode: 'ride', startAt: 450, arriveBy: 540, leaveAt: null },
      {
        day: 'wed',
        mode: 'either',
        startAt: 450,
        arriveBy: 540,
        leaveAt: null,
      },
    ],
  };
  const before = weekAgenda(
    [monday],
    'me',
    at('2026-10-18', 600),
    '2026-10-19',
    commute,
    'both',
    { '2026-10-20': { mode: 'off' } },
  );
  assert.deepEqual(
    before.map((d) => [d.date, d.status]),
    [
      ['2026-10-19', 'confirmed'],
      ['2026-10-21', 'open'],
    ],
  );
  const after = weekAgenda(
    [monday],
    'me',
    at('2026-10-19', 515),
    '2026-10-19',
    commute,
    'both',
    {},
  );
  assert.equal(
    after.some((d) => d.date === '2026-10-19'),
    false,
    'a completed ride must not reappear as an open commute',
  );
  const next = weekAgenda(
    [monday],
    'me',
    at('2026-10-18', 600),
    '2026-10-26',
    commute,
    'both',
    {},
  );
  assert.ok(next.every((d) => d.status === 'open'));
  assert.equal(
    weekAgenda(
      [monday],
      'me',
      at('2026-10-18', 600),
      '2026-10-19',
      null,
      'rider',
      {},
    )[0].status,
    'confirmed',
  );
});
test('weekly navigation crosses month, year and daylight-saving boundaries by local date', () => {
  assert.equal(startOfWeek('2026-11-01'), '2026-10-26');
  assert.equal(startOfWeek('2027-01-01'), '2026-12-28');
});
test('a long history does not displace an upcoming carpool', () => {
  const old = Array.from({ length: 150 }, (_, i) => ({
    ...monday,
    id: `old-${i}`,
  }));
  const now = rideEnd(monday);
  assert.equal(
    currentCarpools([...old, wednesday], 'me', now)[0].accepted[0].id,
    'wed',
  );
  assert.equal(rideHistory([...old, wednesday], 'me', now).length, 150);
});
