import assert from 'node:assert/strict';
import test from 'node:test';

import { LatestRouteRequest } from '../src/routing/latestRouteRequest.ts';
import { createOsrmRoutingAdapter } from '../src/routing/osrmAdapter.ts';
import { isValidRouteCoordinate } from '../src/routing/types.ts';

const start = { latitude: 40.92047, longitude: -73.12844 };
const destination = { latitude: 40.9130574, longitude: -73.1304816 };

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function successfulBody() {
  return {
    code: 'Ok',
    routes: [
      {
        distance: 2350.4,
        duration: 362.8,
        geometry: {
          type: 'LineString',
          coordinates: [
            [-73.1285, 40.9204],
            [-73.129, 40.917],
            [-73.1305, 40.9131],
          ],
        },
      },
    ],
    waypoints: [
      { distance: 8.2, location: [-73.1285, 40.9204], name: 'Stony Brook Road' },
      { distance: 3.1, location: [-73.1305, 40.9131], name: 'Circle Road' },
    ],
  };
}

test('coordinate validation accepts only finite coordinates in world bounds', () => {
  assert.equal(isValidRouteCoordinate(start), true);
  assert.equal(isValidRouteCoordinate({ latitude: 91, longitude: 0 }), false);
  assert.equal(isValidRouteCoordinate({ latitude: 0, longitude: -181 }), false);
  assert.equal(isValidRouteCoordinate({ latitude: Number.NaN, longitude: 0 }), false);
  assert.equal(isValidRouteCoordinate(null), false);
});

test('maps a successful OSRM response and preserves snapped waypoints', async () => {
  let requestedUrl = '';
  const adapter = createOsrmRoutingAdapter({
    baseUrl: 'https://osrm.example.test/',
    fetchImplementation: async (url) => {
      requestedUrl = url;
      return response(successfulBody());
    },
  });

  const result = await adapter.route([start, destination]);
  assert.equal(result.status, 'SUCCESS');
  assert.match(requestedUrl, /-73\.12844,40\.92047;-73\.1304816,40\.9130574/);
  assert.match(requestedUrl, /geometries=geojson/);
  assert.equal(result.route.distanceMeters, 2350.4);
  assert.equal(result.route.durationSeconds, 362.8);
  assert.equal(result.route.provider.id, 'osrm');
  assert.deepEqual(result.route.geometry[1], { latitude: 40.917, longitude: -73.129 });
  assert.deepEqual(result.route.snappedWaypoints[0], {
    input: start,
    snapped: { latitude: 40.9204, longitude: -73.1285 },
    distanceMeters: 8.2,
    name: 'Stony Brook Road',
  });
});

test('rejects too few or invalid ordered waypoints before calling the provider', async () => {
  let calls = 0;
  const adapter = createOsrmRoutingAdapter({
    fetchImplementation: async () => {
      calls += 1;
      return response(successfulBody());
    },
  });
  assert.equal((await adapter.route([start])).code, 'INSUFFICIENT_WAYPOINTS');
  assert.equal(
    (await adapter.route([start, { latitude: Number.POSITIVE_INFINITY, longitude: 0 }])).code,
    'INVALID_COORDINATES',
  );
  assert.equal(calls, 0);
});

test('keeps an explicit provider no-route result distinct from failures', async () => {
  const adapter = createOsrmRoutingAdapter({
    fetchImplementation: async () => response({ code: 'NoRoute', message: 'Impossible route' }),
  });
  const result = await adapter.route([start, destination]);
  assert.deepEqual(result, {
    status: 'FAILURE',
    code: 'NO_ROUTE',
    message: 'OSRM explicitly reported that no driving route exists.',
    retryable: false,
  });
});

test('distinguishes network and provider failures', async () => {
  const network = createOsrmRoutingAdapter({
    fetchImplementation: async () => {
      throw new Error('offline');
    },
  });
  assert.equal((await network.route([start, destination])).code, 'NETWORK_ERROR');

  const provider = createOsrmRoutingAdapter({
    fetchImplementation: async () => response({}, { ok: false, status: 503 }),
  });
  const providerResult = await provider.route([start, destination]);
  assert.equal(providerResult.code, 'PROVIDER_ERROR');
  assert.equal(providerResult.retryable, true);
});

test('rejects malformed successful responses instead of drawing fallback geometry', async () => {
  const cases = [
    {},
    { ...successfulBody(), routes: [{ distance: 1, duration: 2, geometry: 'polyline' }] },
    { ...successfulBody(), waypoints: [] },
    { ...successfulBody(), routes: [{ ...successfulBody().routes[0], duration: Number.NaN }] },
  ];
  for (const body of cases) {
    const adapter = createOsrmRoutingAdapter({ fetchImplementation: async () => response(body) });
    assert.equal((await adapter.route([start, destination])).code, 'MALFORMED_RESPONSE');
  }
});

test('reports invalid configuration without making a request', async () => {
  let calls = 0;
  const adapter = createOsrmRoutingAdapter({
    baseUrl: 'not a URL',
    fetchImplementation: async () => {
      calls += 1;
      return response(successfulBody());
    },
  });
  assert.equal((await adapter.route([start, destination])).code, 'CONFIGURATION_ERROR');
  assert.equal(calls, 0);
});

test('distinguishes timeout and caller cancellation', async () => {
  const abortingFetch = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  const timed = createOsrmRoutingAdapter({ timeoutMs: 5, fetchImplementation: abortingFetch });
  assert.equal((await timed.route([start, destination])).code, 'TIMEOUT');

  const controller = new AbortController();
  const cancelled = createOsrmRoutingAdapter({ timeoutMs: 1000, fetchImplementation: abortingFetch });
  const pending = cancelled.route([start, destination], { signal: controller.signal });
  controller.abort();
  assert.equal((await pending).code, 'CANCELLED');
});

test('latest-request guard prevents stale responses from becoming authoritative', async () => {
  const resolvers = [];
  const adapter = {
    route: () => new Promise((resolve) => resolvers.push(resolve)),
  };
  const latest = new LatestRouteRequest();
  const first = latest.run(adapter, [start, destination]);
  const second = latest.run(adapter, [destination, start]);

  resolvers[1]({ status: 'FAILURE', code: 'NO_ROUTE', message: 'new', retryable: false });
  assert.equal((await second).status, 'CURRENT');
  resolvers[0]({ status: 'SUCCESS', route: {} });
  assert.equal((await first).status, 'STALE');
});
