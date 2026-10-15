import assert from 'node:assert/strict';
import test from 'node:test';

import { buildConfirmedPickupNavigationRequest } from '../src/navigation/routeNavigationRequest.ts';
import { riderRequestFixtures } from '../src/rides/rideFixtures.ts';
import {
  buildTripPickupManifest,
  calculateTripPickupRoute,
  evaluateTripPickupSchedule,
  LatestTripPickupRouteRequest,
  resolveTripPickupSelection,
} from '../src/routing/tripPickupRoute.ts';

const origin = { latitude: 40.69960817, longitude: -73.80852987 };

function accepted(id) {
  return { ...structuredClone(riderRequestFixtures.find((rider) => rider.id === id)), status: 'accepted' };
}

function trip(riders = [accepted('maya'), accepted('chris'), accepted('nia')], overrides = {}) {
  return {
    id: '2026-10-15', day: 'thu', whenLabel: 'Today', dateLabel: 'Thu, Oct 15', thisWeek: true,
    kind: 'drive', arriveBy: 9 * 60 + 30, leaveAt: 16 * 60 + 30, campusLot: 'tabler', skipped: false,
    seats: 3, riders, ...overrides,
  };
}

function roadRoute(coordinates, durationSeconds) {
  const legDuration = durationSeconds / (coordinates.length - 1);
  const legs = coordinates.slice(1).map((_, index) => ({ durationSeconds: legDuration, distanceMeters: legDuration * 18, index, summary: '', steps: [] }));
  return {
    status: 'SUCCESS',
    route: {
      geometry: coordinates,
      durationSeconds,
      distanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
      legs,
      provider: { id: 'osrm', name: 'Test OSRM', baseUrl: 'https://example.test' },
      snappedWaypoints: coordinates.map((coordinate) => ({ input: coordinate, snapped: coordinate, distanceMeters: 0, name: '' })),
    },
  };
}

function adapterFor(manifest, requests = []) {
  const idByCoordinate = new Map(manifest.stops.map((stop) => [`${stop.coordinate.latitude},${stop.coordinate.longitude}`, stop.riderId]));
  return {
    route: async (coordinates) => {
      requests.push(coordinates);
      const ids = coordinates.slice(1, -1).map((coordinate) => idByCoordinate.get(`${coordinate.latitude},${coordinate.longitude}`));
      const preferred = ids.join('|') === 'maya|nia|chris';
      return roadRoute(coordinates, preferred ? 40 * 60 : 50 * 60);
    },
  };
}

test('selected drive keeps its exact date, direction, Tabler destination, and accepted rider IDs', () => {
  const selected = resolveTripPickupSelection([trip()], { tripId: '2026-10-15', date: '2026-10-15', direction: 'TO_CAMPUS' });
  assert.equal(selected.id, '2026-10-15');
  assert.equal(resolveTripPickupSelection([trip()], { tripId: '2026-10-15', date: '2026-10-16', direction: 'TO_CAMPUS' }), null);
  assert.equal(resolveTripPickupSelection([trip()], { tripId: '2026-10-15', date: '2026-10-15', direction: 'FROM_CAMPUS' }), null);
  const riders = [accepted('maya'), { ...accepted('chris'), status: 'pending' }, accepted('nia'), accepted('maya')];
  const manifest = buildTripPickupManifest(trip(riders));
  assert.equal(manifest.tripId, '2026-10-15');
  assert.equal(manifest.direction, 'TO_CAMPUS');
  assert.equal(manifest.campus.label, 'Tabler');
  assert.deepEqual(manifest.acceptedRiderIds, ['maya', 'nia']);
  assert.deepEqual(manifest.stops.map((stop) => stop.riderId), ['maya', 'nia']);
});

test('seeded accepted riders have explicit sourced public fixture pins', () => {
  for (const id of ['maya', 'chris', 'nia']) {
    const rider = riderRequestFixtures.find((candidate) => candidate.id === id);
    assert.ok(rider.confirmedPickup);
    assert.ok(rider.confirmedPickup.fixtureSource.startsWith('https://'));
    assert.ok(rider.pickupWindow);
    assert.equal(rider.pickupServiceSeconds, 120);
  }
});

test('missing confirmed pickup blocks the complete pickup route without omitting the rider', async () => {
  const missing = { ...accepted('maya'), confirmedPickup: undefined };
  const manifest = buildTripPickupManifest(trip([missing, accepted('chris')]));
  assert.deepEqual(manifest.acceptedRiderIds, ['maya', 'chris']);
  assert.deepEqual(manifest.missingPickupRiders, [{ id: 'maya', name: 'Maya' }]);
  let requests = 0;
  await assert.rejects(() => calculateTripPickupRoute({ adapter: { route: async () => { requests += 1; } }, manifest, origin }), /Every accepted rider/);
  assert.equal(requests, 0);
});

test('compares bounded directed permutations from the supplied origin and proposes the shortest road duration', async () => {
  const manifest = buildTripPickupManifest(trip());
  const requests = [];
  const result = await calculateTripPickupRoute({ adapter: adapterFor(manifest, requests), manifest, origin });
  assert.equal(requests.length, 6);
  assert.ok(requests.every((coordinates) => coordinates[0].latitude === origin.latitude && coordinates[0].longitude === origin.longitude));
  assert.ok(requests.every((coordinates) => coordinates.at(-1).latitude === manifest.campus.coordinate.latitude && coordinates.at(-1).longitude === manifest.campus.coordinate.longitude));
  assert.deepEqual(result.orderedStops.map((stop) => stop.riderId), ['maya', 'nia', 'chris']);
  assert.equal(result.orderKind, 'PROPOSED');
  assert.equal(result.route.durationSeconds, 40 * 60);
});

test('propagates directed legs and applies two-minute service exactly once per pickup', async () => {
  const manifest = buildTripPickupManifest(trip());
  const result = await calculateTripPickupRoute({ adapter: adapterFor(manifest), manifest, origin });
  const schedule = evaluateTripPickupSchedule({ trip: trip(), result, departureMinutes: 8 * 60 });
  assert.equal(schedule.status, 'VERIFIED');
  assert.equal(schedule.pickupEpochs.maya, Date.parse('2026-10-15T08:10:00-04:00') / 1000);
  assert.equal(schedule.pickupEpochs.nia, Date.parse('2026-10-15T08:22:00-04:00') / 1000);
  assert.equal(schedule.pickupEpochs.chris, Date.parse('2026-10-15T08:34:00-04:00') / 1000);
  assert.equal(schedule.campusEpoch, Date.parse('2026-10-15T08:46:00-04:00') / 1000);
});

test('schedule remains incomplete without supplied windows and reports conflicts without removing riders', async () => {
  const manifest = buildTripPickupManifest(trip());
  const result = await calculateTripPickupRoute({ adapter: adapterFor(manifest), manifest, origin });
  assert.equal(evaluateTripPickupSchedule({ trip: trip(), result, departureMinutes: null }).status, 'INCOMPLETE');
  const withoutWindow = { ...result, orderedStops: result.orderedStops.map((stop, index) => index === 0 ? { ...stop, pickupWindow: undefined } : stop) };
  assert.equal(evaluateTripPickupSchedule({ trip: trip(), result: withoutWindow, departureMinutes: 8 * 60 }).status, 'INCOMPLETE');
  const conflict = evaluateTripPickupSchedule({ trip: trip(), result, departureMinutes: 9 * 60 });
  assert.equal(conflict.status, 'CONFLICT');
  assert.equal(result.orderedStops.length, 3);
});

test('proposed order and schedule must be confirmed before navigation receives every stop', async () => {
  const manifest = buildTripPickupManifest(trip());
  const result = await calculateTripPickupRoute({ adapter: adapterFor(manifest), manifest, origin });
  const pickups = result.orderedStops.map((stop) => ({ label: `${stop.riderName} pickup`, coordinate: stop.coordinate }));
  assert.equal(buildConfirmedPickupNavigationRequest({ tripId: manifest.tripId, campus: manifest.campus, orderedPickups: pickups, acceptedRiderCount: 3, orderConfirmed: false, scheduleStatus: 'VERIFIED' }).code, 'PICKUP_ORDER_UNCONFIRMED');
  assert.equal(buildConfirmedPickupNavigationRequest({ tripId: manifest.tripId, campus: manifest.campus, orderedPickups: pickups, acceptedRiderCount: 3, orderConfirmed: true, scheduleStatus: 'CONFLICT' }).code, 'PICKUP_SCHEDULE_UNVERIFIED');
  const ready = buildConfirmedPickupNavigationRequest({ tripId: manifest.tripId, campus: manifest.campus, orderedPickups: pickups, acceptedRiderCount: 3, orderConfirmed: true, scheduleStatus: 'VERIFIED' });
  assert.equal(ready.status, 'READY');
  assert.deepEqual(ready.request.waypoints.map((waypoint) => waypoint.label), ['Maya pickup', 'Nia pickup', 'Chris pickup', 'Tabler']);
});

test('superseded pickup-route work cannot repopulate a changed trip', async () => {
  const latest = new LatestTripPickupRouteRequest();
  const resolvers = [];
  const first = latest.run(() => new Promise((resolve) => resolvers.push(resolve)));
  const second = latest.run(() => new Promise((resolve) => resolvers.push(resolve)));
  const manifest = buildTripPickupManifest(trip());
  const result = await calculateTripPickupRoute({ adapter: adapterFor(manifest), manifest, origin });
  resolvers[1](result);
  assert.equal((await second).status, 'CURRENT');
  resolvers[0](result);
  assert.equal((await first).status, 'STALE');
});
