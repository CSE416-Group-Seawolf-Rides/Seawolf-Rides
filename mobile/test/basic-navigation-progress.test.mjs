import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ResourceSlot,
  formatManeuver,
  getNextInstruction,
  initialNavigationProgress,
  prepareNavigationRoute,
  updateNavigationProgress,
  distanceMeters,
} from '../src/navigation/basicNavigationProgress.ts';
import { createNavigationSimulation, simulationCoversRoute } from '../src/navigation/basicNavigationSimulation.ts';

const p0 = { latitude: 40, longitude: -73 };
const p1 = { latitude: 40, longitude: -72.999 };
const p2 = { latitude: 40.0001, longitude: -72.999 };
const p3 = { latitude: 40.0001, longitude: -73 };
const p4 = { latitude: 40.0002, longitude: -73 };

function step(type, modifier, name, geometry, distance) {
  return {
    distanceMeters: distance,
    durationSeconds: distance / 10,
    geometry,
    name,
    reference: '',
    maneuver: {
      type, modifier, location: geometry[0], bearingBefore: 0, bearingAfter: 90, exit: null,
    },
  };
}

function route(geometry = [p0, p1, p2, p3, p4]) {
  const lengths = geometry.slice(1).map((point, index) => distanceMeters(geometry[index], point));
  const total = lengths.reduce((sum, value) => sum + value, 0);
  const steps = [
    step('depart', null, 'First Road', [geometry[0], geometry[1]], lengths[0]),
    step('turn', 'left', 'Second Road', [geometry[1], geometry[2]], lengths[1]),
    step('mystery maneuver', 'slight right', 'Parallel Road', [geometry[2], geometry[3]], lengths[2]),
    step('arrive', null, '', [geometry[3], geometry[4]], lengths[3]),
  ];
  return {
    distanceMeters: total,
    durationSeconds: total / 10,
    geometry,
    legs: [{ distanceMeters: total, durationSeconds: total / 10, summary: '', steps }],
    provider: { id: 'osrm', name: 'OSRM', baseUrl: 'test' },
    snappedWaypoints: [],
  };
}

function fix(coordinate, timestampEpochMs, accuracyMeters = 5, speedMetersPerSecond = 10) {
  return { coordinate, timestampEpochMs, accuracyMeters, speedMetersPerSecond };
}

test('projects progress along a curved route and advances a maneuver only after confirmed passage', () => {
  const prepared = prepareNavigationRoute(route());
  let state = initialNavigationProgress(prepared);
  state = updateNavigationProgress(prepared, state, fix(p0, 1_000), 1_000);
  const beforeTurn = { latitude: 40, longitude: -72.99905 };
  state = updateNavigationProgress(prepared, state, fix(beforeTurn, 3_000), 3_000);
  assert.equal(state.instructionIndex, 1);
  const afterTurn = { latitude: 40.00008, longitude: -72.999 };
  state = updateNavigationProgress(prepared, state, fix(afterTurn, 5_000), 5_000);
  assert.equal(state.instructionIndex, 1, 'one fix cannot advance an instruction');
  state = updateNavigationProgress(prepared, state, fix(afterTurn, 7_000), 7_000);
  assert.equal(state.instructionIndex, 2);
  assert.ok(state.alongRouteMeters > distanceMeters(p0, p1));
});

test('continuity prevents a jump to a nearby parallel or repeated route section', () => {
  const prepared = prepareNavigationRoute(route());
  let state = initialNavigationProgress(prepared);
  state = updateNavigationProgress(prepared, state, fix(p0, 1_000), 1_000);
  const early = { latitude: 40, longitude: -72.9997 };
  state = updateNavigationProgress(prepared, state, fix(early, 3_000), 3_000);
  const nearParallelReturn = { latitude: 40.00008, longitude: -72.99965 };
  state = updateNavigationProgress(prepared, state, fix(nearParallelReturn, 5_000, 12, 4), 5_000);
  assert.ok(state.alongRouteMeters < distanceMeters(p0, p1), `unexpected jump to ${state.alongRouteMeters}`);
  assert.ok(state.segmentIndex <= 1);
});

test('an exactly repeated section stays on the occurrence nearest prior progress', () => {
  const repeated = route([p0, p1, p0, p1, p2]);
  const prepared = prepareNavigationRoute(repeated);
  let state = initialNavigationProgress(prepared);
  state = updateNavigationProgress(prepared, state, fix(p0, 1_000), 1_000);
  const sharedPoint = { latitude: 40, longitude: -72.99965 };
  state = updateNavigationProgress(prepared, state, fix(sharedPoint, 3_000, 5, 8), 3_000);
  assert.ok(state.alongRouteMeters < distanceMeters(p0, p1));
  assert.equal(state.segmentIndex, 0);
});

test('stale, poor-accuracy, and implausible fixes do not advance progress', () => {
  const prepared = prepareNavigationRoute(route());
  let state = initialNavigationProgress(prepared);
  state = updateNavigationProgress(prepared, state, fix(p0, 10_000), 10_000);
  const baseline = state.alongRouteMeters;
  const stale = updateNavigationProgress(prepared, state, fix(p1, 1_000), 20_000);
  assert.equal(stale.disposition, 'STALE');
  assert.equal(stale.alongRouteMeters, baseline);
  const poor = updateNavigationProgress(prepared, state, fix(p1, 12_000, 150), 12_000);
  assert.equal(poor.disposition, 'POOR_ACCURACY');
  const jump = updateNavigationProgress(prepared, state, fix({ latitude: 41, longitude: -74 }, 11_000), 11_000);
  assert.equal(jump.disposition, 'IMPLAUSIBLE');
});

test('off-route detection is sustained, accuracy-aware, and reroute-rate-limited', () => {
  const prepared = prepareNavigationRoute(route());
  let state = initialNavigationProgress(prepared);
  state = updateNavigationProgress(prepared, state, fix(p0, 1_000), 1_000);
  const off = { latitude: 40.0008, longitude: -72.9996 };
  state = updateNavigationProgress(prepared, state, fix(off, 3_000), 3_000);
  assert.equal(state.offRoute, false);
  state = updateNavigationProgress(prepared, state, fix(off, 5_000), 5_000);
  assert.equal(state.offRoute, false);
  state = updateNavigationProgress(prepared, state, fix(off, 7_000), 7_000);
  assert.equal(state.offRoute, true);
  assert.equal(state.shouldReroute, true);
  state = updateNavigationProgress(prepared, state, fix(off, 9_000), 9_000);
  assert.equal(state.shouldReroute, false);

  let accurateState = initialNavigationProgress(prepared);
  accurateState = updateNavigationProgress(prepared, accurateState, fix(p0, 1_000), 1_000);
  const poor = updateNavigationProgress(prepared, accurateState, fix(off, 3_000, 90), 3_000);
  assert.equal(poor.offRouteConfirmations, 0);
});

test('arrival requires consecutive accepted on-route fixes and remaining estimates reach zero', () => {
  const prepared = prepareNavigationRoute(route());
  let state = initialNavigationProgress(prepared);
  state = updateNavigationProgress(prepared, state, fix(p2, 1_000), 1_000);
  state = updateNavigationProgress(prepared, state, fix(p4, 3_000, 5, 0), 3_000);
  assert.equal(state.arrived, false);
  state = updateNavigationProgress(prepared, state, fix(p4, 5_000, 5, 0), 5_000);
  assert.equal(state.arrived, true);
  assert.equal(getNextInstruction(prepared, state).distanceMeters, 0);
});

test('unknown maneuver types have a safe readable fallback', () => {
  const unknown = route().legs[0].steps[2];
  assert.equal(formatManeuver(unknown), 'Continue Slight Right');
});

test('development simulation includes poor fixes, sustained off-route movement, and arrival', () => {
  const prepared = prepareNavigationRoute(route());
  const trace = createNavigationSimulation(prepared, 1_000);
  assert.equal(simulationCoversRoute(prepared), true);
  assert.ok(trace.some((item) => item.accuracyMeters > 100));
  assert.equal(trace.filter((item) => item.label === 'Off route').length, 3);
  assert.match(trace.at(-1).label, /Arrival/);
});

test('resource slot replaces and cleans up watchers deterministically', () => {
  const removed = [];
  const slot = new ResourceSlot();
  slot.replace({ remove: () => removed.push('first') });
  assert.equal(slot.active, true);
  slot.replace({ remove: () => removed.push('second') });
  assert.deepEqual(removed, ['first']);
  slot.clear();
  slot.clear();
  assert.deepEqual(removed, ['first', 'second']);
  assert.equal(slot.active, false);
});
