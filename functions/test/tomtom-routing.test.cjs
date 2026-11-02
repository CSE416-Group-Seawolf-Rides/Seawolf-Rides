const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createTomtomRouting,
  parseTomtomRoute,
} = require('../lib/functions/src/tomtomRouting');
const {
  withDemoRouting,
  REQUEST_GAP_MS,
} = require('../lib/functions/src/demoRouting');
const points = [
  { latitude: 40.9, longitude: -73.1 },
  { latitude: 40.91, longitude: -73.12 },
];
const now = 1792324800,
  departure = now + 86400;
const key = 'fake_backend_only_key';
const body = (seconds = 900, at = departure) => ({
  routes: [
    {
      summary: {
        travelTimeInSeconds: seconds,
        lengthInMeters: 5000,
        historicTrafficTravelTimeInSeconds: seconds,
        departureTime: new Date(at * 1000).toISOString(),
        arrivalTime: new Date((at + seconds) * 1000).toISOString(),
      },
      legs: [
        {
          summary: {
            travelTimeInSeconds: seconds,
            lengthInMeters: 5000,
            trafficDelayInSeconds: 50,
          },
          points: structuredClone(points),
        },
      ],
    },
  ],
});
test('traffic requests use exact dated UTC departure, correct coordinate order and traffic; keys stay out of results', async () => {
  let called;
  const adapter = createTomtomRouting({
    apiKey: key,
    timeoutMs: 100,
    now: () => now,
    fetchImplementation: async (url) => {
      called = new URL(url);
      return Response.json(body());
    },
  });
  const result = await adapter.route(points, {
    departureEpochSeconds: departure,
  });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(called.hostname, 'api.tomtom.com');
  assert.match(called.pathname, /40.9,-73.1:40.91,-73.12/);
  assert.equal(
    called.searchParams.get('departAt'),
    new Date(departure * 1000).toISOString(),
  );
  assert.equal(called.searchParams.get('traffic'), 'true');
  assert.equal(called.searchParams.get('computeBestOrder'), 'false');
  assert.equal(result.route.durationSeconds, 900);
  assert.equal(result.route.estimate.model, 'TRAFFIC_FORECAST');
  assert.equal(result.route.estimate.departureEpochSeconds, departure);
  assert.equal(result.route.snappedWaypoints[0].distanceMeters, 0);
  assert.equal(JSON.stringify(result).includes(key), false);
});
test('traffic keys cannot be sent to arbitrary configured hosts', async () => {
  let calls = 0;
  for (const baseUrl of [
    'https://example.com',
    'http://api.tomtom.com',
    'https://api.tomtom.com@evil.example',
    'https://api.tomtom.com/?key=secret',
    'http://127.0.0.1:5109',
  ]) {
    const r = await createTomtomRouting({
      baseUrl,
      apiKey: key,
      timeoutMs: 100,
      now: () => now,
      fetchImplementation: async () => {
        calls++;
        return Response.json(body());
      },
    }).route(points, { departureEpochSeconds: departure });
    assert.equal(r.status, 'FAILURE');
  }
  assert.equal(calls, 0);
});
test('bad input, missing/past/nonfinite departure and missing key never issue a provider request', async () => {
  let calls = 0;
  const config = {
    apiKey: key,
    timeoutMs: 100,
    now: () => now,
    fetchImplementation: async () => {
      calls++;
      return Response.json(body());
    },
  };
  for (const date of [undefined, NaN, Infinity, now - 1, now + 32 * 86400])
    assert.equal(
      (
        await createTomtomRouting(config).route(points, {
          departureEpochSeconds: date,
        })
      ).status,
      'FAILURE',
    );
  assert.equal(
    (
      await createTomtomRouting({ ...config, apiKey: '' }).route(points, {
        departureEpochSeconds: departure,
      })
    ).status,
    'FAILURE',
  );
  assert.equal(
    (
      await createTomtomRouting(config).route(
        [{ latitude: NaN, longitude: 0 }, points[1]],
        { departureEpochSeconds: departure },
      )
    ).status,
    'FAILURE',
  );
  assert.equal(calls, 0);
});
test('malformed/nonfinite estimates, wrong dated context and unconfirmed snaps fail closed', () => {
  for (const mutate of [
    (b) => (b.routes[0].summary.travelTimeInSeconds = Infinity),
    (b) => (b.routes[0].legs[0].summary.travelTimeInSeconds = -1),
    (b) => (b.routes[0].legs[0].summary.trafficDelayInSeconds = NaN),
    (b) => (b.routes[0].legs[0].points[0] = { latitude: 42, longitude: -73.1 }),
    (b) => (b.routes[0].legs = []),
    (b) => (b.routes[0].summary.travelTimeInSeconds += 300),
    (b) =>
      (b.routes[0].summary.departureTime = new Date(now * 1000).toISOString()),
    (b) => delete b.routes[0].summary.historicTrafficTravelTimeInSeconds,
  ]) {
    const b = body();
    mutate(b);
    assert.equal(parseTomtomRoute(b, points, departure, now).status, 'FAILURE');
  }
});
test('auth/quota/provider/network failures never expose credentials or fabricate a static fallback', async () => {
  for (const status of [400, 401, 403, 429, 503]) {
    const adapter = createTomtomRouting({
      apiKey: key,
      timeoutMs: 100,
      now: () => now,
      fetchImplementation: async () =>
        new Response(JSON.stringify({ secret: key }), { status }),
    });
    const result = await adapter.route(points, {
      departureEpochSeconds: departure,
    });
    assert.equal(result.status, 'FAILURE');
    assert.equal(result.code, 'PROVIDER_ERROR');
    assert.equal(JSON.stringify(result).includes(key), false);
  }
  const adapter = createTomtomRouting({
    apiKey: key,
    timeoutMs: 100,
    now: () => now,
    fetchImplementation: async () => {
      throw new Error('https://api.tomtom.com?key=' + key);
    },
  });
  assert.equal(
    JSON.stringify(
      await adapter.route(points, { departureEpochSeconds: departure }),
    ).includes(key),
    false,
  );
});
test('traffic provider timeouts and cancellation finish with typed failures', async () => {
  const adapter = createTomtomRouting({
    apiKey: key,
    timeoutMs: 5,
    now: () => now,
    fetchImplementation: async (_url, options) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () =>
          reject(new Error('aborted')),
        ),
      ),
  });
  assert.equal(
    (await adapter.route(points, { departureEpochSeconds: departure })).code,
    'TIMEOUT',
  );
  const cancel = new AbortController();
  cancel.abort();
  assert.equal(
    (
      await adapter.route(points, {
        departureEpochSeconds: departure,
        signal: cancel.signal,
      })
    ).code,
    'CANCELLED',
  );
});
test('date-aware cache isolates departures, shares same-date searches and enforces uncached-request quota', async () => {
  let time = 0,
    count = 0,
    calls = 0;
  const cache = new Map();
  const store = {
    acquire: async () => true,
    release: async () => {},
    cached: async (k) => cache.get(k) ?? null,
    cache: async (k, v) => {
      cache.set(k, v);
    },
    reserveProviderRequest: async () => ++count <= 2,
  };
  const upstream = {
    timeDependent: true,
    route: async (_points, options) => {
      calls++;
      return {
        status: 'SUCCESS',
        route: { departure: options.departureEpochSeconds },
      };
    },
  };
  const clock = {
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
  };
  await withDemoRouting(
    store,
    upstream,
    'a',
    async (r) => {
      assert.equal(r.timeDependent, true);
      await r.route(points, { departureEpochSeconds: departure });
      await r.route(points, { departureEpochSeconds: departure });
      await r.route(points, { departureEpochSeconds: departure + 86400 });
      assert.equal(
        (
          await r.route(points, {
            departureEpochSeconds: departure + 2 * 86400,
          })
        ).status,
        'FAILURE',
      );
    },
    clock,
  );
  assert.equal(calls, 2);
  assert.equal(count, 3);
  assert.ok(time >= REQUEST_GAP_MS);
});
test('traffic configuration fails before accessing cloud resources or sending requests', async () => {
  const {
    withMatchingRouting,
  } = require('../lib/functions/src/matchingRuntime');
  const before = process.env.ROUTING_PROVIDER;
  process.env.ROUTING_PROVIDER = 'tomtom';
  try {
    await assert.rejects(
      withMatchingRouting(async () => {}, true),
      { code: 'failed-precondition' },
    );
  } finally {
    if (before === undefined) delete process.env.ROUTING_PROVIDER;
    else process.env.ROUTING_PROVIDER = before;
  }
});

test('provider-confirmed coincident pickup points support zero driving time without fake movement', () => {
  const same = [points[0], points[0]];
  const b = body(0);
  b.routes[0].summary.lengthInMeters = 0;
  b.routes[0].legs[0].summary.lengthInMeters = 0;
  b.routes[0].legs[0].summary.trafficDelayInSeconds = 0;
  b.routes[0].legs[0].points = same;
  const result = parseTomtomRoute(b, same, departure, now);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.route.durationSeconds, 0);
  assert.equal(result.route.distanceMeters, 0);
});

test('arrival-based traffic suggestions send arriveAt alone and validate the returned departure and arrival', async () => {
  const arrival = departure + 3600;
  let query;
  const adapter = createTomtomRouting({
    apiKey: key,
    timeoutMs: 100,
    now: () => now,
    fetchImplementation: async (url) => {
      query = new URL(url).searchParams;
      return Response.json(body(2700, arrival - 2700));
    },
  });
  const result = await adapter.route(points, { arrivalEpochSeconds: arrival });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(query.get('arriveAt'), new Date(arrival * 1000).toISOString());
  assert.equal(query.has('departAt'), false);
  assert.equal(result.route.estimate.departureEpochSeconds, arrival - 2700);
  assert.equal(
    parseTomtomRoute(
      body(2700, arrival - 2701),
      points,
      undefined,
      now,
      arrival,
    ).status,
    'SUCCESS',
  );
  assert.equal(
    parseTomtomRoute(
      body(2700, arrival - 3000),
      points,
      undefined,
      now,
      arrival,
    ).status,
    'FAILURE',
  );
  assert.equal(
    parseTomtomRoute(body(2700, now - 1000), points, undefined, now, now + 1700)
      .status,
    'FAILURE',
  );
  for (const options of [
    { departureEpochSeconds: departure, arrivalEpochSeconds: arrival },
    { arrivalEpochSeconds: NaN },
    { arrivalEpochSeconds: Infinity },
    { arrivalEpochSeconds: now - 1 },
    { arrivalEpochSeconds: now + 32 * 86400 },
  ])
    assert.equal((await adapter.route(points, options)).status, 'FAILURE');
});

test('shared traffic cache distinguishes arrive-at plans from depart-at plans and other arrival times', async () => {
  let calls = 0;
  const cache = new Map();
  const store = {
    acquire: async () => true,
    release: async () => {},
    cached: async (key) => cache.get(key) ?? null,
    cache: async (key, result) => {
      cache.set(key, result);
    },
  };
  await withDemoRouting(
    store,
    {
      timeDependent: true,
      route: async () => {
        calls++;
        return { status: 'SUCCESS', route: {} };
      },
    },
    'arrival-cache',
    async (router) => {
      await router.route(points, { arrivalEpochSeconds: departure });
      await router.route(points, { arrivalEpochSeconds: departure });
      await router.route(points, { departureEpochSeconds: departure });
      await router.route(points, { arrivalEpochSeconds: departure + 3600 });
    },
    { now: () => 0, sleep: async () => {} },
  );
  assert.equal(calls, 3);
});

test('arrival seeds tolerate provider rounding up to one minute while keeping actual provider timing', () => {
  const arrival = departure + 3600;
  for (const delta of [-60, -2, 2, 60]) {
    const result = parseTomtomRoute(body(900, arrival - 900 + delta), points, undefined, now, arrival);
    assert.equal(result.status, 'SUCCESS', `provider arrival offset ${delta}s`);
    assert.equal(result.route.estimate.departureEpochSeconds, arrival - 900 + delta);
  }
  for (const delta of [-61, 61, 86400]) {
    assert.equal(parseTomtomRoute(body(900, arrival - 900 + delta), points, undefined, now, arrival).status, 'FAILURE');
  }
});
