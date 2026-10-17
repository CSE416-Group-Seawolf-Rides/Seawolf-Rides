import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createQueensDriverTestRiders,
  defaultQueensDriverTestConfig,
  queensDriverTestCampus,
  queensDriverTestStart,
  validateQueensDriverTestConfig,
} from '../src/matching/queensDriverTestFixtures.ts';
import {
  createQueensDriverTestPresentationState,
  queensDriverTestPresentationReducer,
} from '../src/matching/queensDriverTestPresentation.ts';
import { evaluateRiderDemo } from '../src/matching/riderDemoEvaluation.ts';

function route(coordinates, legSeconds) {
  const legs = legSeconds.map((durationSeconds, index) => ({
    durationSeconds, distanceMeters: durationSeconds * 15, index, summary: '', steps: [],
  }));
  return {
    status: 'SUCCESS',
    route: {
      geometry: coordinates,
      durationSeconds: legSeconds.reduce((sum, value) => sum + value, 0),
      distanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
      legs,
      provider: { id: 'osrm', name: 'Test OSRM', baseUrl: 'https://example.test' },
      snappedWaypoints: coordinates.map((coordinate) => ({ input: coordinate, snapped: coordinate, distanceMeters: 0, name: '' })),
    },
  };
}

function deterministicAdapter(requests = []) {
  const firstLegByPickup = new Map([
    ['queens-rider-maya', [20 * 60, 55 * 60]],
    ['queens-rider-eli', [30 * 60, 48 * 60]],
    ['queens-rider-nina', [70 * 60, 8 * 60]],
    ['queens-rider-rowan', [80 * 60, 25 * 60]],
  ]);
  const riders = createQueensDriverTestRiders(defaultQueensDriverTestConfig);
  return {
    route: async (coordinates) => {
      requests.push(coordinates);
      if (coordinates.length === 2) return route(coordinates, [70 * 60]);
      const rider = riders.find((candidate) => candidate.pickup.latitude === coordinates[1].latitude && candidate.pickup.longitude === coordinates[1].longitude);
      return route(coordinates, firstLegByPickup.get(rider.id));
    },
  };
}

async function evaluate(requests = []) {
  const candidates = createQueensDriverTestRiders(defaultQueensDriverTestConfig);
  return evaluateRiderDemo({
    adapter: deterministicAdapter(requests), candidates,
    campus: queensDriverTestCampus.coordinate, driverStart: queensDriverTestStart,
    mode: 'LIVE_OSRM',
  });
}

test('maps the editable Queens driver profile and dated rider schedules into evaluator inputs', () => {
  const candidates = createQueensDriverTestRiders(defaultQueensDriverTestConfig);
  const maya = candidates.find((candidate) => candidate.id === 'queens-rider-maya');
  assert.deepEqual(queensDriverTestStart, { latitude: 40.69960817, longitude: -73.80852987 });
  assert.equal(maya.input.driver.occurrence.localDate, '2026-10-19');
  assert.equal(maya.input.driver.departureWindow.earliest, Date.parse('2026-10-19T06:30:00-04:00') / 1000);
  assert.equal(maya.input.driver.departureWindow.latest, Date.parse('2026-10-19T07:15:00-04:00') / 1000);
  assert.equal(maya.input.driver.preferredDeparture, Date.parse('2026-10-19T06:45:00-04:00') / 1000);
  assert.equal(maya.input.driver.seatsRemaining, 3);
  assert.equal(maya.input.driver.maxExtraDurationSeconds, 25 * 60);
  assert.equal(maya.input.driver.maxExtraDurationRatio, 0.3);
  assert.deepEqual(maya.input.anchors.driverStart.coordinate, queensDriverTestStart);
  assert.deepEqual(maya.input.anchors.campusDropoff.coordinate, queensDriverTestCampus.coordinate);
});

test('reuses one Queens baseline and sends each confirmed pickup as an independent directed route', async () => {
  const requests = [];
  await evaluate(requests);
  assert.equal(requests.filter((coordinates) => coordinates.length === 2).length, 1);
  assert.equal(requests.filter((coordinates) => coordinates.length === 3).length, 4);
  assert.ok(requests.every((coordinates) => coordinates[0].latitude === queensDriverTestStart.latitude && coordinates[0].longitude === queensDriverTestStart.longitude));
  assert.ok(requests.every((coordinates) => {
    const last = coordinates.at(-1);
    return last.latitude === queensDriverTestCampus.coordinate.latitude && last.longitude === queensDriverTestCampus.coordinate.longitude;
  }));
});

test('evaluatePair applies timing and stricter detour constraints and ranks only feasible riders', async () => {
  const result = await evaluate();
  const byId = new Map(result.candidates.map((candidate) => [candidate.candidate.id, candidate]));
  assert.equal(byId.get('queens-rider-maya').evaluation.status, 'FEASIBLE');
  assert.equal(byId.get('queens-rider-maya').rank, 1);
  assert.equal(byId.get('queens-rider-eli').evaluation.status, 'FEASIBLE');
  assert.equal(byId.get('queens-rider-eli').rank, 2);
  assert.deepEqual(byId.get('queens-rider-nina').evaluation.reasonCodes, ['NO_FEASIBLE_DEPARTURE']);
  assert.deepEqual(byId.get('queens-rider-rowan').evaluation.reasonCodes, ['DRIVER_DETOUR_LIMIT']);
  assert.equal(byId.get('queens-rider-rowan').rank, null);
  assert.equal(byId.get('queens-rider-maya').evaluation.metrics.activeDriverDetourLimitSeconds, 21 * 60);
});

test('missing confirmed pickup stays unknown and is never sent to OSRM', async () => {
  const requests = [];
  const result = await evaluate(requests);
  const sam = result.candidates.find((candidate) => candidate.candidate.id === 'queens-rider-sam');
  assert.equal(sam.evaluation.status, 'UNKNOWN');
  assert.deepEqual(sam.evaluation.reasonCodes, ['LOCATION_UNCONFIRMED']);
  assert.equal(sam.route, null);
  assert.ok(requests.every((coordinates) => coordinates.length !== 3 || coordinates[1].latitude !== sam.candidate.pickup.latitude));
});

test('validates edited driver constraints before loading riders', () => {
  assert.deepEqual(validateQueensDriverTestConfig({ ...defaultQueensDriverTestConfig, seatsRemaining: 0 }), ['Passenger seats must be a positive whole number.']);
  assert.deepEqual(validateQueensDriverTestConfig({ ...defaultQueensDriverTestConfig, preferredDepartureMinutes: 8 * 60 }), ['Preferred departure must be inside the departure window.']);
});

test('input invalidation clears riders and stale completion cannot repopulate results', async () => {
  const riders = createQueensDriverTestRiders(defaultQueensDriverTestConfig);
  const result = await evaluate();
  let state = createQueensDriverTestPresentationState();
  state = queensDriverTestPresentationReducer(state, { type: 'LOAD', riders, token: 1 });
  state = queensDriverTestPresentationReducer(state, { type: 'BEGIN', token: 2 });
  state = queensDriverTestPresentationReducer(state, { type: 'INVALIDATE', token: 3 });
  const stale = queensDriverTestPresentationReducer(state, { type: 'COMPLETE', result, token: 2 });
  assert.equal(stale.riders, null);
  assert.equal(stale.result, null);
  assert.equal(stale.selectedRiderId, null);
});
