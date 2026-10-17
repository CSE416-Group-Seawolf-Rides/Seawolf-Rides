import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluatePair } from '../src/matching/index.ts';
import { createWorkedExampleInput } from './fixtures/matching.ts';

test('invalid numeric inputs never produce a feasible evaluation', async (t) => {
  const cases = [
    ['NaN seats', (x) => { x.driver.seatsRemaining = NaN; }, 'MALFORMED_SEAT_COUNT'],
    ['infinite requested seats', (x) => { x.rider.seatsRequested = Infinity; }, 'MALFORMED_SEAT_COUNT'],
    ['fractional seats', (x) => { x.driver.seatsRemaining = 1.5; }, 'MALFORMED_SEAT_COUNT'],
    ['unsafe seat integer', (x) => { x.driver.seatsRemaining = 2 ** 53; }, 'MALFORMED_SEAT_COUNT'],
    ['NaN timestamp', (x) => { x.driver.departureWindow.earliest = NaN; }, 'MALFORMED_WINDOW'],
    ['infinite timestamp', (x) => { x.rider.pickupWindow.latest = Infinity; }, 'MALFORMED_WINDOW'],
    ['fractional timestamp', (x) => { x.driver.preferredDeparture += 0.5; }, 'MALFORMED_WINDOW'],
    ['unsafe timestamp', (x) => { x.driver.preferredDeparture = 2 ** 53; }, 'MALFORMED_WINDOW'],
    ['NaN coordinate', (x) => { x.anchors.riderPickup.coordinate.latitude = NaN; }, 'MALFORMED_COORDINATE'],
    ['infinite coordinate', (x) => { x.anchors.driverStart.coordinate.longitude = Infinity; }, 'MALFORMED_COORDINATE'],
    ['NaN service time', (x) => { x.pickupServiceSeconds = NaN; }, 'MALFORMED_DURATION'],
    ['infinite walk', (x) => { x.rider.accessWalkSeconds = Infinity; }, 'MALFORMED_DURATION'],
    ['NaN absolute limit', (x) => { x.driver.maxExtraDurationSeconds = NaN; }, 'MALFORMED_LIMIT'],
    ['infinite ratio', (x) => { x.driver.maxExtraDurationRatio = Infinity; }, 'MALFORMED_LIMIT'],
    ['ratio multiplication overflow', (x) => { x.driver.maxExtraDurationRatio = Number.MAX_VALUE; }, 'MALFORMED_LIMIT'],
    ['fractional duration', (x) => { x.travel.startToPickup.durationSeconds = 600.5; }, 'MALFORMED_TRAVEL_ESTIMATE'],
    ['NaN distance', (x) => { x.travel.startToCampus.distanceMeters = NaN; }, 'MALFORMED_TRAVEL_ESTIMATE'],
    ['infinite duration', (x) => { x.travel.pickupToCampus.durationSeconds = Infinity; }, 'MALFORMED_TRAVEL_ESTIMATE'],
    ['unsafe duration', (x) => { x.travel.startToCampus.durationSeconds = 2 ** 53; }, 'MALFORMED_TRAVEL_ESTIMATE'],
    ['combined duration overflow', (x) => { x.travel.startToPickup.durationSeconds = Number.MAX_SAFE_INTEGER; }, 'MALFORMED_TRAVEL_ESTIMATE'],
    ['combined distance overflow', (x) => { x.travel.startToPickup.distanceMeters = Number.MAX_SAFE_INTEGER; }, 'MALFORMED_TRAVEL_ESTIMATE'],
  ];
  for (const [name, change, reason] of cases) {
    await t.test(name, () => {
      const input = createWorkedExampleInput();
      change(input);
      assert.deepEqual(evaluatePair(input), { status: 'UNKNOWN', reasonCodes: [reason] });
    });
  }
});

test('missing routing anchors return UNKNOWN instead of throwing or inventing a point', async (t) => {
  for (const key of ['driverStart', 'riderPickup', 'campusDropoff']) {
    await t.test(key, () => {
      const input = createWorkedExampleInput();
      delete input.anchors[key];
      assert.deepEqual(evaluatePair(input), {
        status: 'UNKNOWN', reasonCodes: ['MALFORMED_COORDINATE'],
      });
    });
  }
  const input = createWorkedExampleInput();
  delete input.anchors;
  assert.equal(evaluatePair(input).status, 'UNKNOWN');
});

test('missing trip objects return a structured unknown result', () => {
  assert.deepEqual(evaluatePair(null), { status: 'UNKNOWN', reasonCodes: ['MALFORMED_USER_ID'] });
  const input = createWorkedExampleInput();
  delete input.driver;
  assert.equal(evaluatePair(input).status, 'UNKNOWN');
});

test('an inconsistent shared route is not promoted to a zero-detour recommendation', () => {
  const input = createWorkedExampleInput();
  input.travel.startToCampus.durationSeconds = 60 * 60;
  assert.deepEqual(evaluatePair(input), {
    status: 'UNKNOWN', reasonCodes: ['INCONSISTENT_TRAVEL_ESTIMATES'],
  });
});

test('percentage limits resolve to whole seconds without permitting fractional excess', () => {
  const input = createWorkedExampleInput();
  input.driver.maxExtraDurationRatio = 420.9 / 1800;
  const result = evaluatePair(input);
  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.metrics.activeDriverDetourLimitSeconds, 420);
});
