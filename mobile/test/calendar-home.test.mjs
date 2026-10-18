import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarWeek, nextAcceptedRide } from '../src/calendar/calendarHome.ts';
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
function ride(id, date, status, driverId = 'me', departure = 100, arrival = 200) {
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
