import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canAccept,
  describeArrivalFit,
  dateKeyOf,
  getCarpools,
  getNextTrip,
  getUpcoming,
  getWeekOverview,
  incomingForCommute,
  matchDrivers,
  matchDriversForDay,
  reconcileRideState,
  reconcileSkippedDays,
  requestableDays,
  requestSummary,
  sharedDrivingDays,
  weekDateKeys,
  weekdayOf,
} from '../src/rides/rideModel.ts';

const area = { center: { latitude: 40.87, longitude: -73.08 }, radiusMiles: 2, label: 'Centereach area' };

function day(dayId, mode, arriveBy = 9 * 60, leaveAt = 17 * 60) {
  return { day: dayId, mode, arriveBy, leaveAt };
}

function offer(id, days, arriveBy, extra = {}) {
  return {
    id,
    driverName: id,
    startAreaLabel: 'Lake Grove area',
    campusLot: 'tabler',
    days,
    pickupTime: arriveBy - 45,
    arriveBy,
    leaveAt: 17 * 60,
    seatsLeft: 2,
    vehicle: 'Car',
    ...extra,
  };
}

function riderRequest(id, days, status = 'pending') {
  return {
    id,
    riderName: id,
    startAreaLabel: 'Selden area',
    campusLot: 'roth',
    days,
    arriveBy: 9 * 60,
    leaveAt: 17 * 60,
    addedMinutes: 5,
    status,
  };
}

const riderCommute = {
  startArea: area,
  campusLot: 'tabler',
  days: [day('mon', 'ride'), day('wed', 'ride'), day('fri', 'ride')],
};

const driverCommute = {
  startArea: area,
  campusLot: 'roth',
  days: [day('mon', 'drive'), day('tue', 'drive')],
  seats: 1,
};

test('ranks drivers by shared days, then by arriving on time', () => {
  const matches = matchDrivers(riderCommute, [
    offer('late', ['mon', 'wed', 'fri'], 9 * 60 + 20),
    offer('onTime', ['mon', 'wed', 'fri'], 8 * 60 + 45),
    offer('oneDay', ['mon'], 8 * 60 + 50),
    offer('noOverlap', ['tue', 'thu'], 8 * 60 + 50),
  ]);

  assert.deepEqual(matches.map((m) => m.offer.id), ['onTime', 'late', 'oneDay']);
  assert.deepEqual(matches[0].sharedDays, ['mon', 'wed', 'fri']);
  assert.equal(matches[1].arrivalGap, 20);
});

test('without a commute, every driver is shown as a preview with no shared days', () => {
  const matches = matchDrivers(null, [offer('a', ['mon'], 540)]);

  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].sharedDays, []);
});

test('describes how a driver’s arrival fits the rider’s target', () => {
  assert.deepEqual(describeArrivalFit(-10), { label: 'Fits your arrival time', good: true });
  assert.deepEqual(describeArrivalFit(15), { label: 'Arrives 15 min after your target', good: false });
  assert.deepEqual(describeArrivalFit(-45), { label: 'Arrives 45 min early', good: true });
  assert.equal(describeArrivalFit(null), null);
});

test('the week shows confirmed, pending, open, and days off', () => {
  const overview = getWeekOverview(
    riderCommute,
    [
      { id: 'r1', offerId: 'a', days: ['mon'], status: 'accepted' },
      { id: 'r2', offerId: 'b', days: ['wed'], status: 'pending' },
    ],
    [],
  );
  const byDay = Object.fromEntries(overview.map((d) => [d.day, d.status]));

  assert.equal(byDay.mon, 'confirmed');
  assert.equal(byDay.wed, 'pending');
  assert.equal(byDay.fri, 'open');
  assert.equal(byDay.tue, 'off');
});

test('drivers only see requests for days they drive, and cannot overfill the car', () => {
  const dev = riderRequest('dev', ['mon', 'wed']);
  const accepted = riderRequest('chris', ['mon'], 'accepted');

  assert.deepEqual(sharedDrivingDays(driverCommute, dev), ['mon']);
  assert.deepEqual(canAccept(driverCommute, dev, [dev, accepted]), { ok: false, fullDay: 'mon' });
  assert.deepEqual(canAccept(driverCommute, dev, [dev]), { ok: true });
});

test('either days cannot accept a rider after a driver is confirmed', () => {
  const commute = {
    startArea: area,
    campusLot: 'tabler',
    days: [day('mon', 'either')],
    seats: 2,
  };
  const request = riderRequest('dev', ['mon']);
  const outgoing = [{ id: 'ride', offerId: 'alex', days: ['mon'], status: 'accepted' }];

  assert.deepEqual(canAccept(commute, request, [request], outgoing), {
    ok: false,
    conflictDay: 'mon',
  });
  assert.deepEqual(
    requestableDays(commute, offer('alex', ['mon'], 520), [], [
      riderRequest('maya', ['mon'], 'accepted'),
    ]),
    [],
  );
});

test('the next trip is the next confirmed day, skipping today once its time has passed', () => {
  const offers = [offer('alex', ['mon', 'wed', 'fri'], 8 * 60 + 40)];
  const outgoing = [{ id: 'r', offerId: 'alex', days: ['mon', 'fri'], status: 'accepted' }];
  const mondayEvening = new Date(2026, 8, 28, 18, 0); // Mon, Sep 28 2026

  assert.equal(weekdayOf(mondayEvening), 'mon');
  const trip = getNextTrip(riderCommute, outgoing, [], offers, mondayEvening);
  assert.equal(trip.day, 'fri');
  assert.equal(trip.whenLabel, 'Friday');
  assert.equal(trip.kind, 'ride');

  const mondayMorning = new Date(2026, 8, 28, 7, 0);
  assert.equal(getNextTrip(riderCommute, outgoing, [], offers, mondayMorning).whenLabel, 'Today');

  const mondayMidday = new Date(2026, 8, 28, 12, 0);
  assert.equal(getNextTrip(riderCommute, outgoing, [], offers, mondayMidday).whenLabel, 'Today');
});

test('return-only schedules match drivers and remain upcoming until the ride home', () => {
  const commute = {
    startArea: area,
    campusLot: 'tabler',
    days: [day('mon', 'ride', null, 17 * 60)],
  };
  const alex = offer('alex', ['mon'], 8 * 60 + 40, { leaveAt: 17 * 60 + 15 });
  const morningOnly = offer('morning', ['mon'], 8 * 60 + 30, { leaveAt: null });

  assert.deepEqual(matchDrivers(commute, [alex, morningOnly]).map((match) => match.offer.id), [
    'alex',
  ]);
  assert.deepEqual(requestableDays(commute, morningOnly, []), []);
  const [trip] = getUpcoming(
    commute,
    [{ id: 'return', offerId: 'alex', days: ['mon'], status: 'accepted' }],
    [],
    [alex],
    new Date(2026, 8, 28, 12, 0),
  );
  assert.equal(trip.kind, 'ride');
  assert.equal(trip.arriveBy, null);
  assert.equal(trip.leaveAt, 17 * 60 + 15);
});

test('a driver’s next trip lists the riders they accepted', () => {
  const trip = getNextTrip(
    driverCommute,
    [],
    [riderRequest('dev', ['tue'], 'accepted')],
    [],
    new Date(2026, 8, 28, 18, 0),
  );

  assert.equal(trip.kind, 'drive');
  assert.equal(trip.whenLabel, 'Tomorrow');
  assert.deepEqual(trip.riders.map((r) => r.riderName), ['dev']);
});

test('upcoming lists two weeks of dated trips, with open days where a rider has no driver', () => {
  const offers = [offer('alex', ['mon', 'wed', 'fri'], 8 * 60 + 40)];
  const outgoing = [
    { id: 'r', offerId: 'alex', days: ['mon', 'fri'], status: 'accepted' },
    { id: 'p', offerId: 'sarah', days: ['wed'], status: 'pending' },
  ];
  const mondayMorning = new Date(2026, 8, 28, 7, 0); // Mon, Sep 28 2026

  const items = getUpcoming(riderCommute, outgoing, [], offers, mondayMorning);
  assert.deepEqual(
    items.map((item) => [item.id, item.kind]),
    [
      ['2026-09-28', 'ride'],
      ['2026-09-30', 'open'],
      ['2026-10-02', 'ride'],
      ['2026-10-05', 'ride'],
      ['2026-10-07', 'open'],
      ['2026-10-09', 'ride'],
    ],
  );
  assert.equal(items[0].whenLabel, 'Today');
  assert.equal(items[1].pending, true);
  assert.equal(items[2].thisWeek, true);
  assert.equal(items[3].thisWeek, false);
  assert.equal(items[3].whenLabel, items[3].dateLabel);
});

test('skipping a date keeps the trip listed but moves the next trip along', () => {
  const offers = [offer('alex', ['mon', 'wed', 'fri'], 8 * 60 + 40)];
  const outgoing = [{ id: 'r', offerId: 'alex', days: ['mon', 'fri'], status: 'accepted' }];
  const mondayMorning = new Date(2026, 8, 28, 7, 0);

  const items = getUpcoming(riderCommute, outgoing, [], offers, mondayMorning, ['2026-09-28']);
  assert.equal(items[0].skipped, true);
  assert.equal(getNextTrip(riderCommute, outgoing, [], offers, mondayMorning, ['2026-09-28']).day, 'fri');
});

test('drivers without accepted riders have no trips and no open days', () => {
  const items = getUpcoming(driverCommute, [], [riderRequest('dev', ['mon'])], [], new Date(2026, 8, 28, 7, 0));
  assert.deepEqual(items, []);
});

test('a skipped day shows as skipped in the week', () => {
  const overview = getWeekOverview(
    riderCommute,
    [{ id: 'r1', offerId: 'a', days: ['mon'], status: 'accepted' }],
    [],
    ['mon'],
  );
  assert.equal(overview.find((d) => d.day === 'mon').status, 'skipped');
});

test('date keys are local calendar dates for the Monday-to-Sunday week', () => {
  const wednesday = new Date(2026, 8, 30, 23, 30);
  assert.equal(dateKeyOf(wednesday), '2026-09-30');
  const keys = weekDateKeys(wednesday);
  assert.equal(keys.mon, '2026-09-28');
  assert.equal(keys.sun, '2026-10-04');
});

test('incoming requests are limited to the days the user drives', () => {
  const views = incomingForCommute(driverCommute, [
    riderRequest('dev', ['mon', 'wed']),
    riderRequest('maya', ['thu']),
  ]);
  assert.deepEqual(views.map((view) => [view.request.id, view.sharedDays]), [['dev', ['mon']]]);
  assert.deepEqual(incomingForCommute(null, [riderRequest('dev', ['mon'])]), []);
});

test('requests with the same driver roll up per day without replacing each other', () => {
  const outgoing = [
    { id: 'a', offerId: 'alex', days: ['mon', 'wed'], status: 'accepted' },
    { id: 'b', offerId: 'alex', days: ['fri'], status: 'pending' },
  ];
  assert.deepEqual(requestSummary(outgoing, 'alex'), {
    status: 'accepted',
    days: ['mon', 'wed', 'fri'],
    acceptedDays: ['mon', 'wed'],
    pendingDays: ['fri'],
    declinedDays: [],
  });
  assert.equal(requestSummary(outgoing, 'alex', 'fri').status, 'pending');
  assert.equal(requestSummary(outgoing, 'sarah'), undefined);
});

test('commute changes remove incompatible ride state and obsolete skips', () => {
  const driverOnly = {
    startArea: area,
    campusLot: 'tabler',
    days: [day('mon', 'drive')],
    seats: 2,
  };
  const state = reconcileRideState(
    driverOnly,
    [{ id: 'ride', offerId: 'alex', days: ['mon'], status: 'accepted' }],
    [riderRequest('dev', ['mon'], 'accepted')],
  );

  assert.deepEqual(state.outgoing, []);
  assert.deepEqual(state.incoming.map((request) => request.id), ['dev']);
  assert.deepEqual(
    reconcileSkippedDays(driverOnly, ['2026-09-28', '2026-09-29']),
    ['2026-09-28'],
  );
});

test('only shared riding days not already requested can be requested', () => {
  const alex = offer('alex', ['mon', 'wed', 'fri'], 8 * 60 + 40);
  const outgoing = [{ id: 'a', offerId: 'sarah', days: ['mon'], status: 'pending' }];
  assert.deepEqual(requestableDays(riderCommute, alex, outgoing), ['wed', 'fri']);
});

test('per-day matching ranks drivers against that day alone', () => {
  const matches = matchDriversForDay(riderCommute, [
    offer('monOnly', ['mon'], 8 * 60 + 50),
    offer('fri', ['fri'], 8 * 60 + 50),
  ], 'fri');
  assert.deepEqual(matches.map((m) => m.offer.id), ['fri']);
});

test('carpools group requests by person, with waiting-only asks last', () => {
  const offers = [offer('alex', ['mon', 'wed', 'fri'], 520), offer('marcus', ['fri'], 500)];
  const outgoing = [
    { id: 'a', offerId: 'marcus', days: ['fri'], status: 'pending' },
    { id: 'b', offerId: 'alex', days: ['wed', 'mon'], status: 'accepted' },
    { id: 'c', offerId: 'alex', days: ['fri'], status: 'pending' },
  ];
  const maya = riderRequest('maya', ['tue'], 'accepted');
  const carpools = getCarpools(outgoing, [{ request: maya, sharedDays: ['tue'] }], offers);

  assert.deepEqual(carpools.map((c) => c.id), ['driver-alex', 'rider-maya', 'driver-marcus']);
  assert.deepEqual(carpools[0].days, ['mon', 'wed']);
  assert.deepEqual(carpools[0].pendingDays, ['fri']);
  assert.deepEqual(carpools[0].pendingRequestIds, ['c']);
});
