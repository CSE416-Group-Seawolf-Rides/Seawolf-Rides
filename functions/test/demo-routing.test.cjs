const assert = require('node:assert/strict');
const test = require('node:test');
const {
  withDemoRouting,
  DemoBusyError,
  REQUEST_GAP_MS,
  ROUTING_BUDGET_MS,
  MAX_PROVIDER_REQUESTS,
} = require('../lib/functions/src/demoRouting');
const points = (n) => [
  { latitude: n, longitude: 0 },
  { latitude: 1, longitude: 1 },
];
const success = { status: 'SUCCESS', route: { geometry: [] } };
function environment() {
  let now = 0;
  const timer = {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  };
  const state = { owner: null, available: 0, cache: new Map() };
  const store = {
    acquire: async (owner) => {
      if (state.owner || now < state.available) return false;
      state.owner = owner;
      return true;
    },
    release: async (owner) => {
      if (state.owner === owner) {
        state.owner = null;
        state.available = now + REQUEST_GAP_MS;
      }
    },
    cached: async (key) => state.cache.get(key) ?? null,
    cache: async (key, value) => {
      state.cache.set(key, value);
    },
  };
  return {
    timer,
    state,
    store,
    advance: (ms) => {
      now += ms;
    },
  };
}
test('concurrent candidate route calls serialize with a full gap after each completion', async () => {
  const e = environment();
  const starts = [];
  let active = 0;
  let peak = 0;
  const upstream = {
    route: async () => {
      starts.push(e.timer.now());
      active++;
      peak = Math.max(peak, active);
      e.advance(10);
      await Promise.resolve();
      active--;
      return success;
    },
  };
  await withDemoRouting(
    e.store,
    upstream,
    'a',
    (routing) => Promise.all([0, 1, 2, 3].map((n) => routing.route(points(n)))),
    e.timer,
  );
  assert.equal(peak, 1);
  assert.equal(starts.length, 4);
  for (let i = 1; i < starts.length; i++)
    assert.ok(starts[i] - starts[i - 1] >= REQUEST_GAP_MS + 10);
  assert.equal(e.state.owner, null);
});
test('independent invocations share admission; busy work fails fast and cooldown crosses owners', async () => {
  const e = environment();
  let finish;
  let began;
  const started = new Promise((resolve) => {
    began = resolve;
  });
  const upstream = {
    route: async () => {
      began();
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  const first = withDemoRouting(e.store, upstream, 'first', (r) => r.route(points(0)), e.timer);
  await started;
  await assert.rejects(
    withDemoRouting(e.store, upstream, 'preview', (r) => r.route(points(1)), e.timer),
    DemoBusyError,
  );
  finish(success);
  await first;
  await assert.rejects(
    withDemoRouting(e.store, upstream, 'second', async () => {}, e.timer),
    DemoBusyError,
  );
  e.advance(REQUEST_GAP_MS);
  assert.equal(
    await withDemoRouting(e.store, upstream, 'second', async () => 'admitted', e.timer),
    'admitted',
  );
});
test('cache hits coalesce duplicate candidate requests and carry to preview invocations', async () => {
  const e = environment();
  let calls = 0;
  const upstream = {
    route: async () => {
      calls++;
      return success;
    },
  };
  await withDemoRouting(
    e.store,
    upstream,
    'search',
    (r) => Promise.all([r.route(points(0)), r.route(points(0))]),
    e.timer,
  );
  e.advance(REQUEST_GAP_MS);
  await withDemoRouting(e.store, upstream, 'preview', (r) => r.route(points(0)), e.timer);
  assert.equal(calls, 1);
});
test('failed callbacks drain queued work before releasing the shared owner', async () => {
  const e = environment();
  let completed = 0;
  const upstream = {
    route: async () => {
      assert.equal(e.state.owner, 'a');
      completed++;
      return success;
    },
  };
  await assert.rejects(
    withDemoRouting(
      e.store,
      upstream,
      'a',
      async (r) => {
        void r.route(points(0));
        void r.route(points(1));
        throw new Error('caller failed');
      },
      e.timer,
    ),
    /caller failed/,
  );
  assert.equal(completed, 2);
  assert.equal(e.state.owner, null);
});
test('request count and time budgets stop outbound work instead of waiting until function timeout', async () => {
  const e = environment();
  let calls = 0;
  const upstream = {
    route: async () => {
      calls++;
      return success;
    },
  };
  const results = await withDemoRouting(
    e.store,
    upstream,
    'a',
    (r) => Promise.all(Array.from({ length: 20 }, (_, n) => r.route(points(n)))),
    e.timer,
  );
  assert.equal(calls, MAX_PROVIDER_REQUESTS);
  assert.ok(results.slice(MAX_PROVIDER_REQUESTS).every((r) => r.code === 'TIMEOUT'));
  e.advance(REQUEST_GAP_MS);
  await withDemoRouting(
    e.store,
    upstream,
    'b',
    async (r) => {
      e.advance(ROUTING_BUDGET_MS);
      assert.equal((await r.route(points(30))).code, 'TIMEOUT');
    },
    e.timer,
  );
  assert.equal(calls, MAX_PROVIDER_REQUESTS);
});
test('network failures still impose a gap before the next provider request', async () => {
  const e = environment();
  const starts = [];
  const upstream = {
    route: async () => {
      starts.push(e.timer.now());
      return { status: 'FAILURE', code: 'TIMEOUT', retryable: true, message: 'test' };
    },
  };
  await withDemoRouting(
    e.store,
    upstream,
    'a',
    (r) => Promise.all([r.route(points(0)), r.route(points(1))]),
    e.timer,
  );
  assert.ok(starts[1] - starts[0] >= REQUEST_GAP_MS);
});

test('thrown upstream and cache errors release ownership after queued work drains', async () => {
  for (const failing of ['upstream', 'cache']) {
    const e = environment();
    const upstream = {
      route: async () => {
        if (failing === 'upstream') throw new Error('upstream threw');
        return success;
      },
    };
    if (failing === 'cache')
      e.store.cache = async () => {
        throw new Error('cache threw');
      };
    await assert.rejects(
      withDemoRouting(e.store, upstream, 'owner', (r) => r.route(points(0)), e.timer),
      /threw/,
    );
    assert.equal(e.state.owner, null);
    e.advance(REQUEST_GAP_MS);
    assert.equal(
      await withDemoRouting(e.store, upstream, 'next', async () => 'usable', e.timer),
      'usable',
    );
  }
});
