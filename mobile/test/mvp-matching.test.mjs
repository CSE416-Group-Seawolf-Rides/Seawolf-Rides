import assert from 'node:assert/strict';
import test from 'node:test';
import { findMatches } from '../src/mvp/service.ts';
import {
  commuteKey,
  localMinuteToEpoch,
  parseMatchingSetup,
  setupMatchesCommute,
} from '../src/mvp/settings.ts';

const date = '2026-10-19';
const now = Date.parse('2026-10-18T16:00:00Z') / 1000;
function account(uid, mode = 'driver') {
  const commute = {
    schemaVersion: 1,
    ownerId: uid,
    startArea: {
      center: { latitude: 40.9, longitude: -73.1 },
      radiusMiles: 2,
      label: 'Stony Brook area',
    },
    campusLot: 'westSide',
    days: [{ day: 'mon', mode: 'either', arriveBy: 540, leaveAt: 1020 }],
    ...(mode === 'driver' ? { seats: 2 } : {}),
  };
  const setup = {
    schemaVersion: 1,
    ownerId: uid,
    revision: 'v1',
    commuteKey: commuteKey(commute),
    mode,
    active: true,
    optIn: true,
    campusLot: 'westSide',
    weekdays: ['mon'],
    pointId: 'stony-brook-station',
    startWindow: { earliest: mode === 'driver' ? 460 : 480, latest: 510 },
    arrivalWindow: { earliest: 480, latest: 540 },
    seatsRequested: 1,
    maxDetourSeconds: 600,
    maxExtraRideSeconds: 900,
    accessWalkSeconds: 0,
    egressWalkSeconds: 0,
    maxAccessWalkSeconds: 300,
    maxEgressWalkSeconds: 300,
  };
  return {
    uid,
    eligible: true,
    profile: { schemaVersion: 1, firstName: uid, role: 'both' },
    commute,
    setup,
  };
}
function environment(drivers = [account('driver')]) {
  const rider = account('rider', 'rider');
  const accounts = new Map([rider, ...drivers].map((item) => [item.uid, item]));
  return {
    rider,
    drivers,
    accounts,
    repository: {
      load: async (uid) => accounts.get(uid) ?? null,
      findDrivers: async () => drivers,
    },
    request: { localDate: date, revision: 'v1', direction: 'TO_CAMPUS' },
  };
}
function route(points) {
  const durationSeconds = points.length === 2 ? 1800 : 2100;
  return {
    status: 'SUCCESS',
    route: {
      geometry: [...points],
      durationSeconds,
      distanceMeters: 10000,
      provider: { id: 'osrm', name: 'test', baseUrl: 'test' },
      snappedWaypoints: points.map((point) => ({
        input: point,
        snapped: point,
        distanceMeters: 0,
        name: '',
      })),
      legs: (points.length === 2 ? [1800] : [600, 1500]).map((seconds) => ({
        durationSeconds: seconds,
        distanceMeters: 5000,
        summary: '',
        steps: [],
      })),
    },
  };
}
const routing = { route: async (points) => route(points) };
const search = (env, adapter = routing) =>
  findMatches('rider', env.request, env.repository, adapter, now);

test('real saved identities yield canonical timing/explanations without private input serialization', async () => {
  const result = await search(environment());
  assert.equal(result.recommendations.length, 1);
  const card = result.recommendations[0];
  assert.equal(card.driverId, 'driver');
  assert.equal(card.metrics.driverExtraDurationSeconds, 420);
  assert.equal(card.plan.boardingComplete - card.plan.pickup, 120);
  assert.ok(card.explanations.some((text) => text.includes('420')));
  assert.equal(card.inputRevision, 'v1');
  assert.equal(result.unknownCount, 0);
  assert.doesNotMatch(
    JSON.stringify(result),
    /coordinate|commuteKey|anchors|driverStart|routingEstimates/,
  );
});
test('equal feasible candidates use canonical stable driver identity ordering', async () => {
  const result = await search(environment([account('z-driver'), account('a-driver')]));
  assert.deepEqual(
    result.recommendations.map((item) => item.driverId),
    ['a-driver', 'z-driver'],
  );
});
test('invalid/nonfinite settings, windows, duplicate days and approximate point IDs cannot be saved', () => {
  const { setup } = account('driver');
  for (const override of [
    { maxDetourSeconds: Infinity },
    { maxExtraRideSeconds: NaN },
    { seatsRequested: 0 },
    { weekdays: ['mon', 'mon'] },
    { pointId: 'approximate-area' },
    { startWindow: { earliest: 600, latest: 500 } },
    { extra: true },
  ]) {
    assert.throws(() => parseMatchingSetup({ ...setup, ...override }, 'driver'));
  }
  assert.throws(() => parseMatchingSetup(setup, 'someone-else'));
});
test('changed commute or role requires reconfirmation without corrupting old commutes', () => {
  const { setup, commute } = account('driver');
  assert.equal(setupMatchesCommute(setup, commute, 'both'), true);
  assert.equal(setupMatchesCommute(setup, { ...commute, seats: 1 }, 'both'), false);
  assert.equal(setupMatchesCommute(setup, commute, 'rider'), false);
  assert.equal(setupMatchesCommute({ ...setup, arrivalWindow: { earliest: 480, latest: 541 } }, commute, 'both'), false);
});
test('DST gaps and repeated local times are rejected; normal dates convert exactly', () => {
  assert.equal(localMinuteToEpoch(date, 480), Date.parse('2026-10-19T12:00:00Z') / 1000);
  assert.throws(() => localMinuteToEpoch('2026-03-08', 150));
  assert.throws(() => localMinuteToEpoch('2026-11-01', 90));
  assert.throws(() => localMinuteToEpoch('2026-02-30', 480));
});
test('self, opted-out, inactive, unverified, wrong-date, wrong-campus, stale and full candidates are not recommendations', async () => {
  for (const change of [
    (a) => {
      a.uid = 'rider';
      a.setup.ownerId = 'rider';
      a.commute.ownerId = 'rider';
    },
    (a) => {
      a.setup.optIn = false;
    },
    (a) => {
      a.setup.active = false;
    },
    (a) => {
      a.eligible = false;
    },
    (a) => {
      a.setup.weekdays = ['tue'];
    },
    (a) => {
      a.setup.campusLot = 'tabler';
    },
    (a) => {
      a.commute.seats = 1;
    },
    (a) => {
      a.setup.seatsRequested = 7;
    },
  ]) {
    const a = account('driver');
    change(a);
    const env = environment([a]);
    if (a.uid === 'rider') env.accounts.set('rider', env.rider);
    assert.equal((await search(env)).recommendations.length, 0);
  }
  const env = environment();
  env.rider.setup.seatsRequested = 3;
  assert.equal((await search(env)).recommendations.length, 0);
});
test('detour and incompatible schedule constraints exclude evaluated pairs', async () => {
  const env = environment();
  env.drivers[0].setup.maxDetourSeconds = 60;
  let result = await search(env);
  assert.equal(result.incompatibleCount, 1);
  assert.equal(result.recommendations.length, 0);
  env.drivers[0].setup.maxDetourSeconds = 600;
  env.rider.setup.startWindow = { earliest: 600, latest: 620 };
  result = await search(env);
  assert.equal(result.incompatibleCount, 1);
  assert.equal(result.recommendations.length, 0);
});
test('proven no route is incompatible; timeout, invalid values, bad snaps and missing legs remain unknown', async () => {
  const unavailable = (code) => ({
    route: async () => ({ status: 'FAILURE', code, message: 'test', retryable: true }),
  });
  let result = await search(environment(), unavailable('NO_ROUTE'));
  assert.equal(result.incompatibleCount, 1);
  assert.equal(result.unknownCount, 0);
  result = await search(environment(), unavailable('TIMEOUT'));
  assert.equal(result.unknownCount, 1);
  assert.equal(result.incompatibleCount, 0);
  for (const mutate of [
    (r) => {
      r.route.legs[0].durationSeconds = Infinity;
    },
    (r) => {
      r.route.snappedWaypoints[0].distanceMeters = 1000;
    },
    (r) => {
      r.route.legs = [];
    },
    (r) => {
      r.route.snappedWaypoints[0].input = { latitude: 0, longitude: 0 };
    },
  ]) {
    result = await search(environment(), {
      route: async (points) => {
        const response = route(points);
        mutate(response);
        return response;
      },
    });
    assert.equal(result.unknownCount, 1);
    assert.equal(result.recommendations.length, 0);
  }
});
test('saved setup changing during routing cannot produce a stale recommendation', async () => {
  const env = environment();
  const result = await search(env, {
    route: async (points) => {
      env.drivers[0].setup = { ...env.drivers[0].setup, revision: 'v2', optIn: false };
      return route(points);
    },
  });
  assert.equal(result.recommendations.length, 0);
  assert.equal(result.unknownCount, 1);
});
test('rider commute edits during routing require reload', async () => {
  const env = environment();
  await assert.rejects(
    search(env, {
      route: async (points) => {
        env.rider.commute = { ...env.rider.commute, campusLot: 'tabler' };
        return route(points);
      },
    }),
    /changed/,
  );
});
test('missing setup, forged identity, stale revision, unsupported direction and out-of-horizon dates are rejected', async () => {
  for (const request of [
    { revision: 'old' },
    { direction: 'FROM_CAMPUS' },
    { riderId: 'other' },
    { localDate: '2026-12-01' },
    { localDate: '2026-02-30' },
  ]) {
    const env = environment();
    env.request = { ...env.request, ...request };
    await assert.rejects(search(env));
  }
  const env = environment();
  env.rider.setup = undefined;
  await assert.rejects(search(env), /setup/);
});
test('bounded candidate search reports truncation explicitly', async () => {
  const env = environment(
    Array.from({ length: 31 }, (_, i) => account(`driver-${String(i).padStart(2, '0')}`)),
  );
  const result = await search(env);
  assert.equal(result.recommendations.length, 30);
  assert.equal(result.candidateLimitReached, true);
});
