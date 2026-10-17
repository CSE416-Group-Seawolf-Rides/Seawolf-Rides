import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDatedDriverMapPresentation,
  PENDING_PICKUP_PRIVACY_LABEL,
  selectDatedDriverMapOccurrence,
} from '../src/map/datedDriverMapModel.ts';
import {
  applyFridayDriverTestLoad,
  buildFridayDriverTest,
  resetFridayDriverTestState,
} from '../src/rides/fridayDriverTest.ts';
import { getUpcoming, isTrip } from '../src/rides/rideModel.ts';
import { applyAcceptedGroupPlanToTrip, buildTripPickupManifest, calculateTripPickupRoute } from '../src/routing/tripPickupRoute.ts';

const driverId = 'current-demo-user';
const evaluatedAt = Date.parse('2026-10-16T00:00:00Z') / 1000;
const commute = {
  startArea: { center: { latitude: 40.86, longitude: -73.08 }, radiusMiles: 2, label: 'Demo privacy area' },
  campusLot: 'tabler',
  days: [{ day: 'fri', mode: 'drive', arriveBy: 10 * 60 + 30, leaveAt: null }],
  seats: 3,
};

function routeResult(coordinates, legDurations) {
  return {
    status: 'SUCCESS',
    route: {
      geometry: coordinates,
      durationSeconds: legDurations.reduce((sum, value) => sum + value, 0),
      distanceMeters: 1000,
      provider: { id: 'test', name: 'Test', baseUrl: 'https://example.test' },
      snappedWaypoints: coordinates.map((coordinate) => ({ input: coordinate, snapped: coordinate, distanceMeters: 0, name: '' })),
      legs: legDurations.map((durationSeconds, index) => ({ index, durationSeconds, distanceMeters: 500, summary: '', steps: [] })),
    },
  };
}

const loadingAdapter = {
  route: async (coordinates) => coordinates.length === 2
    ? routeResult(coordinates, [80 * 60])
    : routeResult(coordinates, [30 * 60, 55 * 60]),
};

async function load() {
  const loaded = await buildFridayDriverTest({ adapter: loadingAdapter, driverId, evaluatedAtEpochSeconds: evaluatedAt });
  assert.equal(loaded.status, 'SUCCESS');
  return loaded;
}

test('fresh and reset Friday state expose no unrelated rider markers', async () => {
  assert.deepEqual(buildDatedDriverMapPresentation({ occurrence: null, requests: [] }), {
    pendingRiders: [], acceptedRequestIds: [],
  });
  const loaded = await load();
  const state = applyFridayDriverTestLoad([], [], loaded);
  const reset = resetFridayDriverTestState(state.incoming, state.occurrences);
  assert.deepEqual(buildDatedDriverMapPresentation({ occurrence: reset.occurrences[0] ?? null, requests: reset.incoming }), {
    pendingRiders: [], acceptedRequestIds: [],
  });
});

test('an explicit date never falls through to the loaded Friday occurrence', async () => {
  const loaded = await load();
  assert.equal(selectDatedDriverMapOccurrence({
    occurrences: [loaded.occurrence],
    selection: { date: '2026-10-17', direction: 'TO_CAMPUS' },
    fallbackOccurrenceId: loaded.occurrence.id,
  }), null);
  assert.equal(selectDatedDriverMapOccurrence({
    occurrences: [loaded.occurrence], selection: {}, fallbackOccurrenceId: loaded.occurrence.id,
  })?.id, loaded.occurrence.id);
  assert.equal(selectDatedDriverMapOccurrence({
    occurrences: [loaded.occurrence], selection: { date: loaded.occurrence.localDate, direction: 'FROM_CAMPUS' },
    fallbackOccurrenceId: loaded.occurrence.id,
  }), null);
});

test('loaded pending riders expose only occurrence-owned privacy areas', async () => {
  const loaded = await load();
  const presentation = buildDatedDriverMapPresentation({ occurrence: loaded.occurrence, requests: loaded.requests });
  assert.deepEqual(presentation.pendingRiders.map((rider) => rider.name), ['Ava', 'Ben', 'Chloe']);
  assert.deepEqual(presentation.acceptedRequestIds, []);
  for (const rider of presentation.pendingRiders) {
    const source = loaded.requests.find((request) => request.id === rider.id);
    assert.equal(rider.privacyLabel, PENDING_PICKUP_PRIVACY_LABEL);
    assert.equal(rider.ownership.driverOccurrenceId, loaded.occurrence.id);
    assert.notDeepEqual(rider.approximateArea.center, source.proposal.agreed.pickup.coordinate);
    assert.equal('confirmedPickup' in rider, false);
    assert.equal('proposal' in rider, false);
  }

  const wrongOwner = { ...loaded.requests[0], id: 'wrong-owner', proposal: {
    ...loaded.requests[0].proposal,
    participants: { ...loaded.requests[0].proposal.participants, driverId: 'different-driver' },
  } };
  const terminal = { ...loaded.requests[1], id: 'terminal', status: 'declined' };
  const isolated = buildDatedDriverMapPresentation({ occurrence: loaded.occurrence, requests: [...loaded.requests, wrongOwner, terminal] });
  assert.equal(isolated.pendingRiders.some((rider) => rider.id === 'wrong-owner' || rider.id === 'terminal'), false);
});

test('acceptance replaces only that rider privacy area and exact routing ignores remaining areas', async () => {
  const loaded = await load();
  const afterAva = loaded.requests.map((request) => request.riderName === 'Ava' ? { ...request, status: 'accepted' } : request);
  let presentation = buildDatedDriverMapPresentation({ occurrence: loaded.occurrence, requests: afterAva });
  assert.deepEqual(presentation.acceptedRequestIds, ['friday-driver-test-ava']);
  assert.deepEqual(presentation.pendingRiders.map((rider) => rider.name), ['Ben', 'Chloe']);

  const afterBen = afterAva.map((request) => request.riderName === 'Ben' ? { ...request, status: 'accepted' } : request);
  presentation = buildDatedDriverMapPresentation({ occurrence: loaded.occurrence, requests: afterBen });
  assert.deepEqual(presentation.acceptedRequestIds, ['friday-driver-test-ava', 'friday-driver-test-ben']);
  assert.deepEqual(presentation.pendingRiders.map((rider) => rider.name), ['Chloe']);

  const trip = getUpcoming(commute, [], afterBen, [], new Date(2026, 9, 16, 5, 0), [], 2, [loaded.occurrence]).filter(isTrip)[0];
  const selectedRequestOrder = ['friday-driver-test-ava', 'friday-driver-test-ben'];
  const promises = selectedRequestOrder.map((requestId) => {
    const request = afterBen.find((item) => item.id === requestId);
    return { requestId, pickup: request.proposal.agreed.pickup };
  });
  const adaptedTrip = applyAcceptedGroupPlanToTrip(trip, {
    occurrence: { localDate: loaded.occurrence.localDate },
    driverStart: trip.routingPoints.start,
    campusDropoff: trip.routingPoints.destination,
    selectedRequestOrder,
    riderPromises: promises,
  });
  const manifest = buildTripPickupManifest(adaptedTrip);
  assert.deepEqual(manifest.stops.map((stop) => stop.riderName), ['Ava', 'Ben']);
  const requestedCoordinates = [];
  await calculateTripPickupRoute({
    adapter: { route: async (coordinates) => {
      requestedCoordinates.push(...coordinates);
      return routeResult(coordinates, coordinates.slice(1).map(() => 60));
    } },
    manifest,
    origin: adaptedTrip.routingPoints.start.coordinate,
  });
  const approximateCenters = presentation.pendingRiders.map((rider) => rider.approximateArea.center);
  assert.equal(requestedCoordinates.some((coordinate) => approximateCenters.some((center) =>
    center.latitude === coordinate.latitude && center.longitude === coordinate.longitude)), false);
});
