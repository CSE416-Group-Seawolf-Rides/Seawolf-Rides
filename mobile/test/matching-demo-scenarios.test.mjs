import assert from 'node:assert/strict';
import test from 'node:test';

import { createMatchingDemoScenarios } from '../src/matching/demoScenarios.ts';
import { evaluatePair } from '../src/matching/evaluatePair.ts';
import { workedExampleEpochSeconds } from '../src/matching/fixtureTravel.ts';

test('matching demo scenarios produce their intended evaluator results', () => {
  const results = Object.fromEntries(
    createMatchingDemoScenarios().map((scenario) => [scenario.id, evaluatePair(scenario.input)]),
  );

  assert.equal(results.feasible.status, 'FEASIBLE');
  assert.deepEqual(results.feasible.plan.feasibleDepartureWindow, {
    earliest: workedExampleEpochSeconds(8, 2),
    latest: workedExampleEpochSeconds(8, 3),
  });
  assert.equal(results.feasible.plan.departure, workedExampleEpochSeconds(8, 3));
  assert.equal(results.feasible.plan.pickup, workedExampleEpochSeconds(8, 13));
  assert.equal(results.feasible.plan.boardingComplete, workedExampleEpochSeconds(8, 15));
  assert.equal(results.feasible.plan.vehicleCampusArrival, workedExampleEpochSeconds(8, 40));
  assert.equal(
    results.feasible.plan.riderDestinationArrival,
    workedExampleEpochSeconds(8, 45),
  );
  assert.equal(results.feasible.metrics.driverExtraDurationSeconds, 7 * 60);
  assert.equal(results.feasible.metrics.activeDriverDetourLimitSeconds, 9 * 60);

  assert.deepEqual(results['detour-limit'], {
    status: 'INFEASIBLE',
    reasonCodes: ['DRIVER_DETOUR_LIMIT'],
  });
  assert.deepEqual(results.windows, {
    status: 'INFEASIBLE',
    reasonCodes: ['NO_FEASIBLE_DEPARTURE'],
  });
  assert.deepEqual(results['egress-walk'], {
    status: 'INFEASIBLE',
    reasonCodes: ['NO_FEASIBLE_DEPARTURE'],
  });
  assert.deepEqual(results['no-seats'], {
    status: 'INFEASIBLE',
    reasonCodes: ['NO_SEAT'],
  });
  assert.deepEqual(results['approximate-location'], {
    status: 'UNKNOWN',
    reasonCodes: ['LOCATION_UNCONFIRMED'],
  });
  assert.deepEqual(results['missing-route'], {
    status: 'UNKNOWN',
    reasonCodes: ['MISSING_TRAVEL_ESTIMATE'],
  });
  assert.deepEqual(results['unreachable-route'], {
    status: 'INFEASIBLE',
    reasonCodes: ['NO_ROAD_ROUTE'],
  });
});

test('each demo scenario owns independent mutable input data', () => {
  const scenarios = createMatchingDemoScenarios();
  scenarios[0].input.driver.seatsRemaining = 99;
  scenarios[0].input.travel.pickupToCampus = { status: 'MISSING' };

  assert.equal(scenarios[1].input.driver.seatsRemaining, 2);
  assert.equal(scenarios[1].input.travel.pickupToCampus.status, 'AVAILABLE');
  assert.equal(createMatchingDemoScenarios()[0].input.driver.seatsRemaining, 2);
});
