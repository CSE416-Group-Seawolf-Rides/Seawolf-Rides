import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trafficForecastIsStale } from '../src/routing/types.ts';
import { evaluateCalendarPair } from '../src/calendar/calendarMatching.ts';
import { localMinuteToEpoch } from '../src/mvp/settings.ts';
const point = { latitude: 40.92047, longitude: -73.12844 };
const day = { day: 'mon', mode: 'drive', startAt: 480, arriveBy: 540, leaveAt: 1020 };
const commute = {
  startPoint: point,
  startArea: { center: point, label: 'Area', radiusMiles: 2 },
  seats: 1,
  discoveryEnabled: true,
  campusLot: 'westSide',
  days: [day],
};
const driver = { uid: 'driver', name: 'Driver', revision: 'd1', commute, day };
const rider = {
  uid: 'rider',
  name: 'Rider',
  revision: 'r1',
  commute,
  day: { ...day, mode: 'ride' },
};
const now = localMinuteToEpoch('2026-10-18', 0);
function router(missingEvidence = false) {
  const calls = [];
  return {
    calls,
    timeDependent: true,
    async route(points, options) {
      calls.push({ points, departure: options.departureEpochSeconds });
      const duration = calls.length === 1 ? 1800 : calls.length === 2 ? 600 : 1500;
      return {
        status: 'SUCCESS',
        route: {
          durationSeconds: duration,
          distanceMeters: 10000,
          provider: { id: 'tomtom' },
          estimate: missingEvidence
            ? undefined
            : {
                model: 'TRAFFIC_FORECAST',
                computedAtEpochSeconds: now,
                departureEpochSeconds: options.departureEpochSeconds,
              },
          snappedWaypoints: points.map((input) => ({ input, distanceMeters: 0 })),
          legs: [{ durationSeconds: duration, distanceMeters: 10000 }],
        },
      };
    },
  };
}
test('scheduled traffic uses driver departure for baseline and pickup, then adds driving plus boarding before the next leg', async () => {
  const routing = router(),
    date = '2026-10-19',
    start = localMinuteToEpoch(date, 480);
  const result = await evaluateCalendarPair(driver, rider, date, routing, now);
  assert.equal(result.status, 'FEASIBLE');
  assert.deepEqual(
    routing.calls.map((c) => c.departure),
    [start, start, start + 600 + 120],
  );
  assert.ok(routing.calls.every((c) => c.points.length === 2));
  assert.equal(result.plan.pickup, start + 600);
  assert.equal(result.plan.vehicleCampusArrival, start + 2220);
  assert.equal(result.metrics.driverExtraDurationSeconds, 420);
  assert.deepEqual(result.eta, {
    model: 'TRAFFIC_FORECAST',
    provider: 'TomTom',
    computedAtEpochSeconds: now,
    departureEpochSeconds: start,
  });
});
test('future weekdays across daylight saving use the selected New York departure rather than current traffic time', async () => {
  const routing = router();
  const result = await evaluateCalendarPair(driver, rider, '2026-11-02', routing, now);
  assert.equal(result.status, 'FEASIBLE');
  assert.equal(
    routing.calls[0].departure,
    Date.parse('2026-11-02T08:00:00-05:00') / 1000,
  );
});
test('traffic metadata cannot silently become static timing and provider failure remains UNKNOWN', async () => {
  assert.equal(
    (await evaluateCalendarPair(driver, rider, '2026-10-19', router(true), now)).status,
    'UNKNOWN',
  );
  const calls = [];
  const routing = {
    timeDependent: true,
    route: async (points) => {
      calls.push(points);
      return {
        status: 'FAILURE',
        code: 'PROVIDER_ERROR',
        retryable: true,
        message: 'Unavailable',
      };
    },
  };
  assert.equal(
    (await evaluateCalendarPair(driver, rider, '2026-10-19', routing, now)).status,
    'UNKNOWN',
  );
  assert.equal(
    calls.length,
    2,
    'failed pickup does not trigger a speculative campus request',
  );
});

test('traffic evidence must confirm the requested leg departure and have a finite computation time', async () => {
  for (const change of [
    (eta) => ({ ...eta, departureEpochSeconds: eta.departureEpochSeconds + 60 }),
    (eta) => ({ ...eta, computedAtEpochSeconds: NaN }),
  ]) {
    const original = router();
    const routing = {
      timeDependent: true,
      route: async (...args) => {
        const result = await original.route(...args);
        return {
          ...result,
          route: { ...result.route, estimate: change(result.route.estimate) },
        };
      },
    };
    assert.equal(
      (await evaluateCalendarPair(driver, rider, '2026-10-19', routing, now)).status,
      'UNKNOWN',
    );
  }
});

test('traffic expiry prompts refresh exactly at the shared two-minute boundary, without expiring static estimates', () => {
  const estimate = { model: 'TRAFFIC_FORECAST', computedAtEpochSeconds: now };
  assert.equal(trafficForecastIsStale(estimate, now + 119), false);
  assert.equal(trafficForecastIsStale(estimate, now + 120), true);
  assert.equal(trafficForecastIsStale(estimate, now + 121), true);
  assert.equal(
    trafficForecastIsStale({ ...estimate, computedAtEpochSeconds: NaN }, now),
    true,
  );
  assert.equal(trafficForecastIsStale(estimate, NaN), true);
  assert.equal(
    trafficForecastIsStale({ ...estimate, model: 'STATIC_ROAD' }, now + 600),
    false,
  );
  assert.equal(trafficForecastIsStale(undefined, now), false);
});
