import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateDriverRecommendations,
  LatestDriverRecommendationEvaluation,
  localMinuteToEpochSeconds,
  parseClockMinutes,
  validateRecommendationSetup,
  weekdayForLocalDate,
} from '../src/matching/driverRecommendations.ts';
import {
  queensTestDriverOffer,
  queensTestDriverRoutingProfile,
} from '../src/matching/driverRecommendationFixtures.ts';

const localDate = '2026-10-19';
const commute = {
  startArea: { center: { latitude: 40.8, longitude: -73.1 }, radiusMiles: 2, label: 'Private area' },
  campusLot: 'lot40',
  days: [{ day: 'mon', arriveBy: 9 * 60, leaveAt: null, mode: 'ride' }],
};
const setup = {
  pickupPoint: { id: 'public-point', label: 'Public point', coordinate: { latitude: 40.9, longitude: -73.12 } },
  pickupWindowMinutes: { earliest: 7 * 60, latest: 9 * 60 },
  destinationArrivalWindowMinutes: { earliest: 7 * 60, latest: 10 * 60 },
  seatsRequested: 1,
  accessWalkSeconds: 5 * 60,
  egressWalkSeconds: 4 * 60,
  maxAccessWalkSeconds: 10 * 60,
  maxEgressWalkSeconds: 10 * 60,
  maxExtraInVehicleSeconds: 10 * 60,
};

function offer(id, seatsLeft = 2, days = ['mon']) {
  return { id, driverName: id.toUpperCase(), startAreaLabel: `${id} area`, campusLot: 'lot40', days, pickupTime: 480, arriveBy: 540, leaveAt: null, seatsLeft, vehicle: 'Synthetic car', pickupSpot: 'Hidden until accepted' };
}

function profile(offerId, longitude, overrides = {}) {
  return {
    offerId,
    driverStart: { latitude: 40.85, longitude },
    departureWindowMinutes: { earliest: 420, latest: 510 },
    campusArrivalWindowMinutes: { earliest: 450, latest: 600 },
    preferredDepartureMinutes: 450,
    maxExtraDurationSeconds: 20 * 60,
    maxExtraDurationRatio: 0.75,
    pickupServiceSeconds: 2 * 60,
    skippedDates: [],
    conflictDates: [],
    ...overrides,
  };
}

function routeResult(coordinates, durationSeconds, legDurations) {
  const legs = legDurations.map((duration, index) => ({ durationSeconds: duration, distanceMeters: duration * 10, summary: '', steps: [], index }));
  return { status: 'SUCCESS', route: { geometry: coordinates, durationSeconds, distanceMeters: durationSeconds * 10, provider: { id: 'osrm', name: 'Test OSRM', baseUrl: 'https://example.test' }, snappedWaypoints: coordinates.map((coordinate) => ({ input: coordinate, snapped: coordinate, distanceMeters: 0, name: '' })), legs } };
}

function adapterFor(extraByLongitude = new Map()) {
  return { route: async (coordinates) => {
    if (coordinates.length === 2) return routeResult(coordinates, 30 * 60, [30 * 60]);
    const extra = extraByLongitude.get(coordinates[0].longitude) ?? 4 * 60;
    return routeResult(coordinates, 30 * 60 + extra - 2 * 60, [10 * 60, 20 * 60 + extra - 2 * 60]);
  } };
}

function evaluate(overrides = {}) {
  return evaluateDriverRecommendations({
    adapter: adapterFor(new Map([[-73.01, 4 * 60], [-73.02, 8 * 60]])),
    commute,
    localDate,
    timeZone: 'America/New_York',
    riderId: 'rider',
    offers: [offer('a'), offer('b')],
    profiles: [profile('a', -73.01), profile('b', -73.02)],
    setup,
    riderSkipped: false,
    riderCommitmentConflict: false,
    ...overrides,
  });
}

test('converts a weekly schedule date into New York epochs without using device timezone', () => {
  assert.equal(weekdayForLocalDate('2026-10-19'), 'mon');
  assert.equal(parseClockMinutes('08:15'), 8 * 60 + 15);
  assert.equal(localMinuteToEpochSeconds('2026-07-01', 8 * 60, 'America/New_York'), Date.parse('2026-07-01T08:00:00-04:00') / 1000);
  assert.equal(localMinuteToEpochSeconds('2026-01-07', 8 * 60, 'America/New_York'), Date.parse('2026-01-07T08:00:00-05:00') / 1000);
});

test('requires selected points, explicit windows, and limits before routing', () => {
  const missing = { ...setup, pickupPoint: null, pickupWindowMinutes: null, maxExtraInVehicleSeconds: null };
  assert.deepEqual(validateRecommendationSetup(missing), [
    'Choose a public meeting point.',
    'Enter the full pickup-ready window.',
    'Enter the maximum extra in-vehicle time.',
  ]);
});

test('routes through the selected public point and never through the saved privacy center', async () => {
  const requests = [];
  const baseAdapter = adapterFor();
  await evaluate({
    offers: [offer('a')],
    profiles: [profile('a', -73.01)],
    adapter: { route: async (coordinates, options) => {
      requests.push(coordinates);
      return baseAdapter.route(coordinates, options);
    } },
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.find((coordinates) => coordinates.length === 3)[1], setup.pickupPoint.coordinate);
  assert.ok(requests.flat().every((coordinate) => coordinate.latitude !== commute.startArea.center.latitude || coordinate.longitude !== commute.startArea.center.longitude));
});

test('Queens test driver uses the verified station origin while rider pickup stays independently selected', async () => {
  const requests = [];
  const baseAdapter = adapterFor();
  await evaluate({
    offers: [queensTestDriverOffer],
    profiles: [queensTestDriverRoutingProfile],
    adapter: { route: async (coordinates, options) => {
      requests.push(coordinates);
      return baseAdapter.route(coordinates, options);
    } },
  });

  assert.deepEqual(queensTestDriverRoutingProfile.driverStart, {
    latitude: 40.69960817,
    longitude: -73.80852987,
  });
  assert.equal(requests.length, 2);
  assert.ok(requests.every((coordinates) => (
    coordinates[0].latitude === queensTestDriverRoutingProfile.driverStart.latitude
    && coordinates[0].longitude === queensTestDriverRoutingProfile.driverStart.longitude
  )));
  assert.deepEqual(requests.find((coordinates) => coordinates.length === 3)[1], setup.pickupPoint.coordinate);
  assert.notDeepEqual(setup.pickupPoint.coordinate, queensTestDriverRoutingProfile.driverStart);
});

test('Queens synthetic schedule is explicitly suitable for a morning Queens to campus trip', () => {
  assert.deepEqual(queensTestDriverRoutingProfile.departureWindowMinutes, { earliest: 390, latest: 435 });
  assert.equal(queensTestDriverRoutingProfile.preferredDepartureMinutes, 405);
  assert.deepEqual(queensTestDriverRoutingProfile.campusArrivalWindowMinutes, { earliest: 480, latest: 570 });
  assert.equal(queensTestDriverOffer.seatsLeft, 3);
});

test('ranks only feasible recommendations by real evaluator detour metrics', async () => {
  const result = await evaluate();
  const a = result.recommendations.find((item) => item.offer.id === 'a');
  const b = result.recommendations.find((item) => item.offer.id === 'b');
  assert.equal(a.evaluation.status, 'FEASIBLE');
  assert.equal(a.rank, 1);
  assert.equal(a.evaluation.metrics.driverExtraDurationSeconds, 4 * 60);
  assert.equal(b.evaluation.status, 'FEASIBLE');
  assert.equal(b.rank, 2);
});

test('respects dated skips and excludes offers not active on the selected weekday', async () => {
  const result = await evaluate({
    offers: [offer('a'), offer('b', 2, ['tue'])],
    profiles: [profile('a', -73.01, { skippedDates: [localDate] }), profile('b', -73.02)],
  });
  const a = result.recommendations.find((item) => item.offer.id === 'a');
  const b = result.recommendations.find((item) => item.offer.id === 'b');
  assert.equal(a.evaluation.status, 'INFEASIBLE');
  assert.deepEqual(a.evaluation.reasonCodes, ['SKIPPED_OCCURRENCE']);
  assert.equal(a.rank, null);
  assert.equal(b.excludedReason, 'NOT_OFFERED_ON_DATE');
});

test('maps recurring rider roles and dated commitments into evaluator conflicts', async () => {
  const drivingCommute = { ...commute, days: [{ ...commute.days[0], mode: 'drive' }] };
  const roleResult = await evaluate({ commute: drivingCommute, offers: [offer('a')], profiles: [profile('a', -73.01)] });
  assert.deepEqual(roleResult.recommendations[0].evaluation.reasonCodes, ['ROLE_CONFLICT']);

  const committed = await evaluate({ offers: [offer('a')], profiles: [profile('a', -73.01)], riderCommitmentConflict: true });
  assert.deepEqual(committed.recommendations[0].evaluation.reasonCodes, ['COMMITMENT_CONFLICT']);

  const skipped = await evaluate({ offers: [offer('a')], profiles: [profile('a', -73.01)], riderSkipped: true });
  assert.deepEqual(skipped.recommendations[0].evaluation.reasonCodes, ['SKIPPED_OCCURRENCE']);
});

test('filters insufficient capacity before issuing route requests', async () => {
  let requests = 0;
  const result = await evaluate({
    adapter: { route: async (coordinates) => { requests += 1; return routeResult(coordinates, 1800, coordinates.length === 2 ? [1800] : [600, 1080]); } },
    offers: [offer('a', 1)],
    profiles: [profile('a', -73.01)],
    setup: { ...setup, seatsRequested: 2 },
  });
  assert.equal(requests, 0);
  assert.equal(result.recommendations[0].excludedReason, 'NO_PASSENGER_CAPACITY');
  assert.equal(result.recommendations[0].rank, null);
});

test('keeps provider failures unknown and never replaces them with fixture estimates', async () => {
  const failure = { status: 'FAILURE', code: 'NETWORK_ERROR', message: 'offline', retryable: true };
  const result = await evaluate({ offers: [offer('a')], profiles: [profile('a', -73.01)], adapter: { route: async () => failure } });
  assert.equal(result.recommendations[0].evaluation.status, 'UNKNOWN');
  assert.deepEqual(result.recommendations[0].evaluation.reasonCodes, ['MISSING_TRAVEL_ESTIMATE']);
  assert.equal(result.recommendations[0].routingFailure.code, 'NETWORK_ERROR');
  assert.equal(result.recommendations[0].rank, null);
});

test('superseded recommendation responses cannot become current', async () => {
  const latest = new LatestDriverRecommendationEvaluation();
  const resolvers = [];
  const first = latest.run(() => new Promise((resolve) => resolvers.push(resolve)));
  const second = latest.run(() => new Promise((resolve) => resolvers.push(resolve)));
  const result = await evaluate();
  resolvers[1](result);
  assert.equal((await second).status, 'CURRENT');
  resolvers[0](result);
  assert.equal((await first).status, 'STALE');
});
