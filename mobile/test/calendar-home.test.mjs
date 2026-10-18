import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calendarWeek,
  nextAcceptedRide,
} from '../src/calendar/calendarHome.ts';
const commute = {
  startArea: {
    label: 'Stony Brook area',
    center: { latitude: 40.9, longitude: -73.1 },
    radiusMiles: 2,
  },
  campusLot: 'westSide',
  days: [
    { day: 'mon', mode: 'drive', arriveBy: 540, leaveAt: 1020 },
    { day: 'tue', mode: 'either', arriveBy: 540, leaveAt: 1020 },
    { day: 'wed', mode: 'ride', arriveBy: 540, leaveAt: 1020 },
  ],
};
function ride(
  id,
  date,
  status,
  driverId = 'me',
  departure = 100,
  arrival = 200,
) {
  return {
    id,
    localDate: date,
    status,
    driverId,
    riderId: driverId === 'me' ? 'other' : 'me',
    plan: { departure, vehicleCampusArrival: arrival },
  };
}
test('Home week follows calendar dates across months and shows saved Either days and date exceptions', () => {
  const week = calendarWeek(
    commute,
    'both',
    '2026-11-01',
    { '2026-10-28': { mode: 'off' } },
    [],
    'me',
  );
  assert.deepEqual(
    week.map((d) => d.date),
    [
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ],
  );
  assert.equal(week[0].mode, 'drive');
  assert.equal(week[1].mode, 'either');
  assert.equal(week[1].status, 'open');
  assert.equal(week[2].status, 'off');
  assert.equal(week[2].mode, null);
});
test('accepted trips keep their actual role despite weekly/date changes; pending and declined are distinct', () => {
  const week = calendarWeek(
    commute,
    'both',
    '2026-10-26',
    { '2026-10-26': { mode: 'off' } },
    [
      ride('pending', '2026-10-26', 'PENDING'),
      ride('accepted', '2026-10-26', 'ACCEPTED', 'other'),
      ride('waiting', '2026-10-27', 'PENDING'),
      ride('declined', '2026-10-28', 'DECLINED'),
    ],
    'me',
  );
  assert.equal(week[0].status, 'confirmed');
  assert.equal(week[0].mode, 'ride');
  assert.equal(week[1].status, 'pending');
  assert.equal(week[1].mode, 'drive');
  assert.equal(week[2].status, 'open');
});
test('next-trip card chooses a real accepted or ongoing trip, never a pending, declined or completed one', () => {
  const requests = [
    ride('completed', '2026-10-26', 'ACCEPTED', 'me', 1, 50),
    ride('pending', '2026-10-26', 'PENDING', 'me', 60, 400),
    ride('later', '2026-10-27', 'ACCEPTED', 'me', 300, 400),
    ride('ongoing', '2026-10-26', 'ACCEPTED', 'me', 80, 200),
  ];
  assert.equal(nextAcceptedRide(requests, 100).id, 'ongoing');
  assert.equal(nextAcceptedRide(requests, 210).id, 'later');
  assert.equal(nextAcceptedRide(requests, 500), undefined);
});

test('an unmatched saved commute still supplies Your Next Trip, including date overrides', async () => {
  const { nextScheduledCommute } =
    await import('../src/calendar/calendarHome.ts');
  const { localMinuteToEpoch } = await import('../src/mvp/settings.ts');
  const timed = {
    ...commute,
    days: commute.days.map((d) => ({ ...d, startAt: 450 })),
  };
  const now = localMinuteToEpoch('2026-10-18', 600);
  assert.equal(
    nextScheduledCommute(timed, 'both', '2026-10-18', {}, now).date,
    '2026-10-19',
  );
  const changed = nextScheduledCommute(
    timed,
    'both',
    '2026-10-18',
    { '2026-10-19': { mode: 'off' } },
    now,
  );
  assert.equal(changed.date, '2026-10-20');
  assert.equal(changed.day.mode, 'either');
  // An already-missed driver departure must not be presented as a future trip.
  assert.equal(
    nextScheduledCommute(
      timed,
      'both',
      '2026-10-19',
      {},
      localMinuteToEpoch('2026-10-19', 480),
    ).date,
    '2026-10-20',
  );
});

test('an unmatched rider commute remains available until the end of its arrival window', async () => {
  const { nextScheduledCommute } =
    await import('../src/calendar/calendarHome.ts');
  const { localMinuteToEpoch: at } = await import('../src/mvp/settings.ts');
  const { weekAgenda } = await import('../src/mvp/ridePresentation.ts');
  const date = '2026-10-19';
  const commute = {
    campusLot: 'westSide',
    days: [
      { day: 'mon', mode: 'ride', startAt: 480, arriveBy: 540, leaveAt: null },
    ],
  };
  assert.equal(
    nextScheduledCommute(commute, 'rider', date, {}, at(date, 539)).date,
    date,
  );
  assert.equal(
    weekAgenda([], 'me', at(date, 539), date, commute, 'rider', {})[0].date,
    date,
  );
  assert.notEqual(
    nextScheduledCommute(commute, 'rider', date, {}, at(date, 540)).date,
    date,
  );
  assert.equal(
    weekAgenda([], 'me', at(date, 540), date, commute, 'rider', {}).length,
    0,
  );
});
