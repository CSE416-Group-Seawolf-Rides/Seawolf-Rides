import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_RANKING_WEIGHTS, rankDriversForRider } from '../src/matching/index.ts';
import { createWorkedExampleInput } from './fixtures/matching.ts';

function setup(id = 'driver-a') {
  const { rider, ...candidate } = createWorkedExampleInput();
  candidate.driver.userId = id;
  return { rider, candidate };
}

test('only feasible drivers become recommendations while every outcome remains available', () => {
  const { rider, candidate } = setup();
  const noSeat = setup('full').candidate;
  noSeat.driver.seatsRemaining = 0;
  const missingRoute = setup('unknown-route').candidate;
  missingRoute.travel.startToPickup = { status: 'MISSING' };
  const invalidLimit = setup('invalid-limit').candidate;
  invalidLimit.driver.maxExtraDurationSeconds = NaN;
  const result = rankDriversForRider(rider, [missingRoute, candidate, noSeat, invalidLimit]);

  assert.deepEqual(result.recommendations.map((x) => x.driverId), ['driver-a']);
  assert.deepEqual(result.evaluations.map((x) => [x.driverId, x.evaluation.status]), [
    ['unknown-route', 'UNKNOWN'], ['driver-a', 'FEASIBLE'], ['full', 'INFEASIBLE'], ['invalid-limit', 'UNKNOWN'],
  ]);
  assert.deepEqual(result.evaluations[0].evaluation.reasonCodes, ['MISSING_TRAVEL_ESTIMATE']);
  assert.deepEqual(result.evaluations[2].evaluation.reasonCodes, ['NO_SEAT']);
});

test('rider-facing results carry the actual candidate driver identity and canonical plan', () => {
  const { rider, candidate } = setup('real-driver-id');
  const [result] = rankDriversForRider(rider, [candidate]).recommendations;

  assert.equal(result.driverId, 'real-driver-id');
  assert.equal(result.riderId, rider.userId);
  assert.notEqual(result.driverId, result.riderId);
  assert.equal(result.evaluation.metrics.driverExtraDurationSeconds, 420);
});

test('self-matching is rejected through the canonical evaluator', () => {
  const { rider, candidate } = setup();
  candidate.driver.userId = rider.userId;
  const result = rankDriversForRider(rider, [candidate]);
  assert.deepEqual(result.recommendations, []);
  assert.deepEqual(result.evaluations[0].evaluation, {
    status: 'INFEASIBLE', reasonCodes: ['SELF_MATCH'],
  });
});

test('scores use evaluated detour and feasible departure flexibility with documented defaults', () => {
  const { rider, candidate } = setup();
  const [result] = rankDriversForRider(rider, [candidate]).recommendations;
  assert.deepEqual(DEFAULT_RANKING_WEIGHTS, { detour: 60, scheduleFlexibility: 40 });
  assert.ok(Math.abs(result.scoreComponents.detour - (1 - 420 / 540)) < 1e-12);
  assert.ok(Math.abs(result.scoreComponents.scheduleFlexibility - 60 / 900) < 1e-12);
  assert.equal(result.score, 16);
  assert.ok(result.explanations.some((x) => x.includes('420 seconds') && x.includes('540-second')));
  for (const key of ['departure', 'pickup', 'vehicleCampusArrival', 'riderDestinationArrival']) {
    assert.ok(result.explanations.some((x) => x.includes(String(result.evaluation.plan[key]))));
  }
});

test('a single dated result never claims weekly coverage', () => {
  const { rider, candidate } = setup();
  const [result] = rankDriversForRider(rider, [candidate]).recommendations;
  assert.equal(Object.hasOwn(result.scoreComponents, 'coverage'), false);
  assert.equal(Object.hasOwn(result, 'matchedDays'), false);
  assert.ok(result.explanations.every((x) => !/week|requested legs|coverage/i.test(x)));
});

test('feasible drivers rank by score and ties are independent of candidate order', () => {
  const { rider, candidate: a } = setup('driver-a');
  const b = setup('driver-b').candidate;
  const better = setup('driver-c').candidate;
  better.driver.maxExtraDurationSeconds = 1200;
  delete better.driver.maxExtraDurationRatio;
  for (const candidates of [[b, better, a], [a, better, b], [better, b, a]]) {
    assert.deepEqual(rankDriversForRider(rider, candidates).recommendations.map((x) => x.driverId), [
      'driver-c', 'driver-a', 'driver-b',
    ]);
  }
});

test('equal scores prefer less actual added detour before the stable ID tie-break', () => {
  const { rider, candidate: larger } = setup('driver-a');
  const smaller = setup('driver-z').candidate;
  smaller.travel.startToCampus.durationSeconds = 31 * 60;
  const result = rankDriversForRider(rider, [larger, smaller], {
    weights: { detour: 0, scheduleFlexibility: 1 },
  });
  assert.equal(result.recommendations[0].score, result.recommendations[1].score);
  assert.deepEqual(result.recommendations.map((x) => x.driverId), ['driver-z', 'driver-a']);
});

test('driver ID ties use locale-independent code-unit order', () => {
  const { rider, candidate: lower } = setup('driver-a');
  const upper = setup('driver-Z').candidate;
  assert.deepEqual(rankDriversForRider(rider, [lower, upper]).recommendations.map((x) => x.driverId), [
    'driver-Z', 'driver-a',
  ]);
});

test('zero detour limits and exact departure windows yield finite bounded scores', () => {
  const { rider, candidate } = setup();
  candidate.driver.departureWindow.earliest = candidate.driver.preferredDeparture;
  candidate.driver.departureWindow.latest = candidate.driver.preferredDeparture;
  candidate.driver.maxExtraDurationSeconds = 0;
  delete candidate.driver.maxExtraDurationRatio;
  candidate.travel.startToCampus.durationSeconds = 37 * 60;
  const [result] = rankDriversForRider(rider, [candidate]).recommendations;
  assert.equal(result.score, 100);
  assert.deepEqual(result.scoreComponents, { detour: 1, scheduleFlexibility: 1 });
});

test('ranking rejects nonfinite, negative, zero-total, or overflowing weights', () => {
  const { rider, candidate } = setup();
  for (const weights of [
    { detour: NaN }, { detour: Infinity }, { scheduleFlexibility: -1 },
    { detour: 0, scheduleFlexibility: 0 },
    { detour: Number.MAX_VALUE, scheduleFlexibility: Number.MAX_VALUE },
  ]) {
    assert.throws(() => rankDriversForRider(rider, [candidate], { weights }), /weights/);
  }
});

test('large valid weights normalize without overflowing the score', () => {
  const { rider, candidate } = setup();
  const [result] = rankDriversForRider(rider, [candidate], {
    weights: { detour: 1e300, scheduleFlexibility: 0 },
  }).recommendations;
  assert.equal(result.score, 22.22);
  assert.ok(Number.isFinite(result.score));
});

test('unsupported directions remain UNKNOWN instead of silently becoming recommendations', () => {
  const { rider, candidate } = setup();
  candidate.driver.occurrence.direction = 'FROM_CAMPUS';
  rider.occurrence.direction = 'FROM_CAMPUS';
  const result = rankDriversForRider(rider, [candidate]);
  assert.deepEqual(result.recommendations, []);
  assert.deepEqual(result.evaluations[0].evaluation.reasonCodes, ['UNSUPPORTED_DIRECTION']);
});

test('duplicate candidate IDs are rejected rather than returning ambiguous recommendations', () => {
  const { rider, candidate } = setup();
  assert.throws(() => rankDriversForRider(rider, [candidate, structuredClone(candidate)]), /unique/);
});

test('ranking does not mutate caller inputs and an empty candidate list is valid', () => {
  const { rider, candidate } = setup();
  const before = structuredClone({ rider, candidate });
  rankDriversForRider(rider, [candidate]);
  assert.deepEqual({ rider, candidate }, before);
  assert.deepEqual(rankDriversForRider(rider, []), { recommendations: [], evaluations: [] });
});
