import assert from 'node:assert/strict';
import test from 'node:test';

import { createDemo3x7LiveScenario, DEMO3X7_LIVE_STATIONS } from '../src/matching/demo3x7LiveInputs.ts';
import { countUniqueNonzeroCoordinatePairs, createScenarioLegRequests } from '../src/routing/directedTravelSource.ts';
import { SCENARIO_MAP_PIN_DIMENSIONS, scenarioMapPinAccessibilityLabel } from '../src/routing/scenarioMapPinModel.ts';

const byKey = (items, key) => items.find((item) => item.id.includes(`-${key}-`));

test('live scenario stores only authoritative confirmed inputs and no calculated outcomes', () => {
  const state = createDemo3x7LiveScenario({ generationId: 'live-input-test' });
  assert.equal(state.driverOccurrences.length, 3);
  assert.equal(state.riderIntents.length, 7);
  assert.equal(state.pendingRequests.length, 0);
  assert.equal(state.acceptedMemberships.length, 0);
  assert.equal(state.combinedPlans.length, 0);
  assert.equal(state.riderIntents.every((intent) => intent.pickup.status === 'CONFIRMED'), true);
  assert.equal(new Set(state.riderIntents.map((intent) => `${intent.pickup.point.coordinate.latitude},${intent.pickup.point.coordinate.longitude}`)).size, 7);
});

test('live drivers and riders use the specified MTA LIRR station records', () => {
  const state = createDemo3x7LiveScenario({ generationId: 'station-test' });
  assert.deepEqual(byKey(state.driverOccurrences, 'jordan').start.coordinate, DEMO3X7_LIVE_STATIONS.J.coordinate);
  assert.deepEqual(byKey(state.driverOccurrences, 'morgan').start.coordinate, DEMO3X7_LIVE_STATIONS.M.coordinate);
  assert.deepEqual(byKey(state.driverOccurrences, 'taylor').start.coordinate, DEMO3X7_LIVE_STATIONS.T.coordinate);
  for (const [key, stationKey] of Object.entries({ ava: 'A', ben: 'B', chloe: 'C', diego: 'D', emi: 'E', finn: 'F', grace: 'G' })) {
    assert.deepEqual(byKey(state.riderIntents, key).pickup.point.coordinate, DEMO3X7_LIVE_STATIONS[stationKey].coordinate);
  }
});

test('live constraints are explicit and use a full fifteen-minute elapsed detour cap', () => {
  const state = createDemo3x7LiveScenario({ generationId: 'constraint-test' });
  for (const driver of state.driverOccurrences) {
    assert.equal(driver.maxExtraDurationSeconds, 15 * 60);
    assert.equal(driver.maxExtraDurationRatio, undefined);
    assert.ok(driver.departureWindow.latest - driver.departureWindow.earliest >= 60 * 60);
  }
  for (const intent of state.riderIntents) {
    assert.equal(intent.pickupServiceSeconds, 120);
    assert.equal(intent.accessWalkSeconds, 5 * 60);
    assert.equal(intent.egressWalkSeconds, 5 * 60);
    assert.equal(intent.maxExtraInVehicleSeconds, 30 * 60);
  }
  assert.equal(byKey(state.riderIntents, 'ben').requestedSeats, 2);
});

test('live inputs expand through the shared directed source without stored routes', () => {
  const state = createDemo3x7LiveScenario({ generationId: 'request-expansion-test' });
  const requests = createScenarioLegRequests(state.driverOccurrences, state.riderIntents);
  assert.equal(countUniqueNonzeroCoordinatePairs(requests), 73);
});

test('standard map pins retain fixed dimensions and role-aware accessible labels', () => {
  assert.deepEqual(SCENARIO_MAP_PIN_DIMENSIONS, { width: 40, height: 52 });
  assert.equal(scenarioMapPinAccessibilityLabel('Jordan — Queens', 'DRIVER'), 'Jordan — Queens, driver');
  assert.equal(scenarioMapPinAccessibilityLabel('Ava', 'RIDER'), 'Ava, rider, confirmed pickup');
  assert.equal(scenarioMapPinAccessibilityLabel('Tabler', 'CAMPUS'), 'Tabler, campus destination');
});
