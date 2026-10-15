import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyFridayDriverTestLoad,
  buildFridayDriverTest,
  FRIDAY_DRIVER_TEST_DATE,
  FRIDAY_DRIVER_TEST_TIME_ZONE,
  resetFridayDriverTestState,
} from '../src/rides/fridayDriverTest.ts';
import { getUpcoming, isTrip, requestSeats } from '../src/rides/rideModel.ts';
import { transitionIncomingRequest } from '../src/rides/requestTransitions.ts';
import { buildTripPickupManifest } from '../src/routing/tripPickupRoute.ts';

const evaluatedAt = Date.parse('2026-10-16T00:00:00Z') / 1000;
const driverId = 'current-demo-user';
const commute = {
  startArea: { center: { latitude: 40.86, longitude: -73.08 }, radiusMiles: 2, label: 'Demo privacy area' },
  campusLot: 'tabler',
  days: [{ day: 'fri', mode: 'ride', arriveBy: 10 * 60, leaveAt: 14 * 60 }],
  seats: 3,
};

function routeResult(coordinates, legDurations) {
  const durationSeconds = legDurations.reduce((sum, value) => sum + value, 0);
  return {
    status: 'SUCCESS',
    route: {
      geometry: coordinates,
      durationSeconds,
      distanceMeters: durationSeconds * 12,
      provider: { id: 'test-live-shape', name: 'Test road provider', baseUrl: 'https://example.test' },
      snappedWaypoints: coordinates.map((coordinate) => ({ input: coordinate, snapped: coordinate, distanceMeters: 0, name: '' })),
      legs: legDurations.map((durationSeconds, index) => ({ index, durationSeconds, distanceMeters: durationSeconds * 12, summary: '', steps: [] })),
    },
  };
}

const adapter = {
  route: async (coordinates) => coordinates.length === 2
    ? routeResult(coordinates, [80 * 60])
    : routeResult(coordinates, [30 * 60, 55 * 60]),
};

async function load() {
  const result = await buildFridayDriverTest({ adapter, driverId, evaluatedAtEpochSeconds: evaluatedAt });
  assert.equal(result.status, 'SUCCESS');
  return result;
}

test('loads three fresh versioned proposals for the exact Friday occurrence and requested seat quantities', async () => {
  const loaded = await load();
  assert.deepEqual(loaded.occurrence, {
    id: 'friday-driver-test-2026-10-16-to-campus',
    driverId,
    localDate: FRIDAY_DRIVER_TEST_DATE,
    direction: 'TO_CAMPUS',
    timeZone: FRIDAY_DRIVER_TEST_TIME_ZONE,
    campusLot: 'tabler',
    passengerCapacity: 3,
    source: 'DEVELOPMENT_TEST',
  });
  assert.deepEqual(loaded.requests.map((request) => [request.riderName, requestSeats(request)]), [['Ava', 1], ['Ben', 2], ['Chloe', 1]]);
  for (const request of loaded.requests) {
    assert.equal(request.proposal.schema, 'seawolf-rides/dated-to-campus-proposal');
    assert.equal(request.proposal.version, 1);
    assert.equal(request.proposal.occurrence.localDate, FRIDAY_DRIVER_TEST_DATE);
    assert.equal(request.proposal.occurrence.direction, 'TO_CAMPUS');
    assert.equal(request.proposal.occurrence.timeZone, FRIDAY_DRIVER_TEST_TIME_ZONE);
    assert.equal(request.proposal.participants.driverId, driverId);
    assert.deepEqual(request.proposal.agreed.driverStart.coordinate, { latitude: 40.69960817, longitude: -73.80852987 });
    assert.equal(request.proposal.agreed.driverStart.accuracy, 'SELECTED_POINT');
    assert.equal(request.proposal.agreed.campusDropoff.campusLot, 'tabler');
    assert.equal(request.proposal.agreed.campusDropoff.accuracy, 'SELECTED_POINT');
    assert.equal(request.proposal.createdAtEpochSeconds, evaluatedAt);
    assert.ok(request.proposal.expiresAtEpochSeconds > evaluatedAt);
  }
});

test('loading is idempotent and reset removes only Friday test requests and occurrence', async () => {
  const loaded = await load();
  const unrelated = { id: 'unrelated', riderName: 'Other', startAreaLabel: 'Other area', campusLot: 'tabler', days: ['tue'], arriveBy: 540, leaveAt: null, addedMinutes: 2, pickupSpot: 'Other point', status: 'pending' };
  const first = applyFridayDriverTestLoad([unrelated], [], loaded);
  const second = applyFridayDriverTestLoad(first.incoming, first.occurrences, loaded);
  assert.equal(second.incoming.length, 4);
  assert.equal(new Set(second.incoming.map((request) => request.id)).size, 4);
  assert.equal(second.occurrences.length, 1);

  const reset = resetFridayDriverTestState(second.incoming, second.occurrences);
  assert.deepEqual(reset.incoming.map((request) => request.id), ['unrelated']);
  assert.deepEqual(reset.occurrences, []);
});

test('Ava plus Ben fill all three seats and Chloe rejection leaves state unchanged', async () => {
  const loaded = await load();
  const ava = accept(loaded.requests, loaded, 'friday-driver-test-ava');
  const ben = accept(ava.requests, loaded, 'friday-driver-test-ben');
  assert.equal(ava.code, 'ACCEPTED');
  assert.equal(ben.code, 'ACCEPTED');
  assert.equal(ben.requests.filter((request) => request.status === 'accepted').reduce((sum, request) => sum + requestSeats(request), 0), 3);

  const beforeChloe = ben.requests;
  const chloe = accept(beforeChloe, loaded, 'friday-driver-test-chloe');
  assert.equal(chloe.code, 'NO_REMAINING_CAPACITY');
  assert.equal(chloe.requests, beforeChloe);
  assert.equal(chloe.requests.find((request) => request.riderName === 'Chloe').status, 'pending');

  const trips = getUpcoming(commute, [], chloe.requests, [], new Date(2026, 9, 15, 18, 0), [], 3, [loaded.occurrence]).filter(isTrip);
  assert.equal(trips.length, 1);
  assert.equal(trips[0].id, FRIDAY_DRIVER_TEST_DATE);
  assert.equal(trips[0].kind, 'drive');
  const manifest = buildTripPickupManifest(trips[0]);
  assert.deepEqual(manifest.stops.map((stop) => stop.riderName), ['Ava', 'Ben']);
  assert.equal(manifest.acceptedRiderIds.length, 2);
});

test('reverse acceptance order preserves two-seat accounting and blocks the fourth seat', async () => {
  const loaded = await load();
  const ben = accept(loaded.requests, loaded, 'friday-driver-test-ben');
  const ava = accept(ben.requests, loaded, 'friday-driver-test-ava');
  const chloe = accept(ava.requests, loaded, 'friday-driver-test-chloe');
  assert.equal(ben.code, 'ACCEPTED');
  assert.equal(ava.code, 'ACCEPTED');
  assert.equal(chloe.code, 'NO_REMAINING_CAPACITY');
  assert.equal(chloe.requests.find((request) => request.riderName === 'Chloe').status, 'pending');
});

function accept(requests, loaded, requestId) {
  return transitionIncomingRequest({
    commute,
    requests,
    outgoing: [],
    requestId,
    status: 'accepted',
    nowEpochSeconds: evaluatedAt + 30,
    driverOccurrences: [loaded.occurrence],
  });
}
