import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDemo3x7Fixture,
  createDemo3x7TravelEstimate,
  demo3x7Coordinates,
} from '../src/matching/demo3x7Fixtures.ts';
import { evaluateGroupRoute } from '../src/matching/groupRouteEvaluator.ts';
import {
  FixtureDirectedTravelSource,
  SharedLiveDirectedTravelSource,
  batchToGroupTravelEstimates,
  countUniqueNonzeroCoordinatePairs,
  createScenarioLegRequests,
} from '../src/routing/directedTravelSource.ts';

const liveOwnership = (overrides = {}) => ({
  mode: 'LIVE', providerId: 'osrm', profile: 'driving', optionsKey: 'default',
  rootGeneration: 'generation-1', estimateVersion: 'v1', ...overrides,
});

test('expanded 3x7 requests deduplicate to 31 directed nonzero provider calls under the global limit', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'generation-1' });
  const requests = createScenarioLegRequests(fixture.state.driverOccurrences, fixture.state.riderIntents);
  assert.equal(requests.length, 57);
  assert.equal(countUniqueNonzeroCoordinatePairs(requests), 31);
  assert.ok(requests.every((request) => !request.from.pointId.includes('grace') && !request.to.pointId.includes('grace')));

  let calls = 0;
  let active = 0;
  let maximum = 0;
  const source = new SharedLiveDirectedTravelSource({
    rootGeneration: 'generation-1', concurrency: 3,
    adapter: { async route(coordinates) {
      calls += 1;
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return successRoute(coordinates, [60]);
    } },
  });
  const batch = await source.getLegs(requests, liveOwnership(), 'DISCOVERY');
  assert.equal(batch.status, 'COMPLETE');
  assert.equal(calls, 31);
  assert.equal(maximum, 3);
  assert.equal(source.diagnostics().uniqueLegWork, 31);
  assert.equal(source.diagnostics().maxConcurrentProviderRequests, 3);
  assert.equal(source.diagnostics().geometryRequests, 0);
});

test('cache keys preserve direction and ownership while purpose controls freshness', async () => {
  let now = 1_000_000;
  let calls = 0;
  const source = new SharedLiveDirectedTravelSource({
    rootGeneration: 'generation-1', nowMs: () => now,
    discoveryTtlMs: 300_000, acceptanceTtlMs: 30_000,
    adapter: { async route(coordinates) { calls += 1; return successRoute(coordinates, [calls]); } },
  });
  const a = endpoint('a', 40, -73);
  const b = endpoint('b', 41, -72);
  assert.equal((await source.getLeg({ from: a, to: b }, liveOwnership(), 'DISCOVERY')).source, 'PROVIDER');
  assert.equal((await source.getLeg({ from: a, to: b }, liveOwnership(), 'DISCOVERY')).source, 'CACHE');
  await source.getLeg({ from: b, to: a }, liveOwnership(), 'DISCOVERY');
  await source.getLeg({ from: a, to: b }, liveOwnership({ profile: 'cycling' }), 'DISCOVERY');
  await source.getLeg({ from: a, to: b }, liveOwnership({ optionsKey: 'avoid-ferries' }), 'DISCOVERY');
  await source.getLeg({ from: a, to: b }, liveOwnership({ estimateVersion: 'v2' }), 'DISCOVERY');
  assert.equal(calls, 5);
  now += 31_000;
  assert.equal((await source.getLeg({ from: a, to: b }, liveOwnership(), 'ACCEPTANCE')).source, 'PROVIDER');
  assert.equal(calls, 6);
});

test('shared in-flight work survives one subscriber cancellation and aborts when all subscribers leave', async () => {
  const first = deferred();
  const observedSignals = [];
  let calls = 0;
  const source = new SharedLiveDirectedTravelSource({
    rootGeneration: 'generation-1',
    adapter: { route(coordinates, options) {
      calls += 1;
      observedSignals.push(options.signal);
      return first.promise.then(() => successRoute(coordinates, [90]));
    } },
  });
  const request = { from: endpoint('a', 40, -73), to: endpoint('b', 41, -72) };
  const left = new AbortController();
  const right = new AbortController();
  const one = source.getLeg(request, liveOwnership(), 'DISCOVERY', left.signal);
  const two = source.getLeg(request, liveOwnership(), 'DISCOVERY', right.signal);
  left.abort();
  assert.equal((await one).code, 'CANCELLED');
  assert.equal(observedSignals[0].aborted, false);
  first.resolve();
  assert.equal((await two).status, 'AVAILABLE');
  assert.equal(calls, 1);

  const second = deferred();
  const source2 = new SharedLiveDirectedTravelSource({
    rootGeneration: 'generation-1',
    adapter: { route(_coordinates, options) { observedSignals.push(options.signal); return second.promise; } },
  });
  const c1 = new AbortController();
  const c2 = new AbortController();
  const p1 = source2.getLeg(request, liveOwnership(), 'DISCOVERY', c1.signal);
  const p2 = source2.getLeg(request, liveOwnership(), 'DISCOVERY', c2.signal);
  await until(() => observedSignals.length === 2);
  c1.abort(); c2.abort();
  assert.deepEqual((await Promise.all([p1, p2])).map((item) => item.code), ['CANCELLED', 'CANCELLED']);
  assert.equal(observedSignals.at(-1).aborted, true);
  second.resolve({ status: 'FAILURE', code: 'CANCELLED', message: 'cancelled', retryable: true });
});

test('late success and late error from an old root are stale and cannot populate a new cache', async () => {
  for (const reject of [false, true]) {
    const pending = deferred();
    let calls = 0;
    const source = new SharedLiveDirectedTravelSource({
      rootGeneration: 'generation-1',
      adapter: { route(coordinates) {
        calls += 1;
        if (calls === 1) return pending.promise;
        return Promise.resolve(successRoute(coordinates, [120]));
      } },
    });
    const request = { from: endpoint('a', 40, -73), to: endpoint('b', 41, -72) };
    const old = source.getLeg(request, liveOwnership(), 'DISCOVERY');
    await until(() => calls === 1);
    source.beginRootGeneration('generation-2');
    if (reject) pending.reject(new Error('late failure'));
    else pending.resolve(successRoute([request.from.coordinate, request.to.coordinate], [60]));
    const oldResult = await old;
    assert.equal(oldResult.status, 'UNKNOWN');
    assert.equal(oldResult.code, 'STALE');
    const fresh = await source.getLeg(request, liveOwnership({ rootGeneration: 'generation-2' }), 'DISCOVERY');
    assert.equal(fresh.status, 'AVAILABLE');
    assert.equal(fresh.estimate.durationSeconds, 120);
    assert.equal(calls, 2);
  }
});

test('transient and malformed failures retry while no-route is cached', async () => {
  let calls = 0;
  const source = new SharedLiveDirectedTravelSource({
    rootGeneration: 'generation-1',
    adapter: { async route(coordinates) {
      calls += 1;
      if (calls === 1) return { status: 'FAILURE', code: 'NETWORK_ERROR', message: 'offline', retryable: true };
      if (calls === 2) return successRoute(coordinates, [60], { legCount: 0 });
      if (calls === 4) return { status: 'FAILURE', code: 'NO_ROUTE', message: 'none', retryable: false };
      return successRoute(coordinates, [60]);
    } },
  });
  const one = { from: endpoint('a', 40, -73), to: endpoint('b', 41, -72) };
  assert.equal((await source.getLeg(one, liveOwnership(), 'DISCOVERY')).code, 'NETWORK_ERROR');
  assert.equal((await source.getLeg(one, liveOwnership(), 'DISCOVERY')).code, 'MALFORMED_RESULT');
  assert.equal((await source.getLeg(one, liveOwnership(), 'DISCOVERY')).status, 'AVAILABLE');
  const two = { from: endpoint('b', 41, -72), to: endpoint('c', 42, -71) };
  assert.equal((await source.getLeg(two, liveOwnership(), 'DISCOVERY')).status, 'UNREACHABLE');
  assert.equal((await source.getLeg(two, liveOwnership(), 'DISCOVERY')).source, 'CACHE');
  assert.equal(calls, 4);
});

test('fixture source expands the same contract without network work and preserves missing data', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'fixture-generation' });
  const nodeByCoordinate = new Map(Object.entries(demo3x7Coordinates).map(([node, coordinate]) => [coordinateKey(coordinate), node]));
  const source = new FixtureDirectedTravelSource({
    rootGeneration: 'fixture-generation', providerId: 'demo3x7-matrix', evaluatedAtEpochSeconds: 10,
    resolve: (from, to) => {
      const fromNode = nodeByCoordinate.get(coordinateKey(from));
      const toNode = nodeByCoordinate.get(coordinateKey(to));
      return fromNode && toNode ? createDemo3x7TravelEstimate(fromNode, toNode) : undefined;
    },
  });
  const ownership = { ...liveOwnership(), mode: 'FIXTURE', providerId: 'demo3x7-matrix', rootGeneration: 'fixture-generation' };
  const requests = createScenarioLegRequests(fixture.state.driverOccurrences, fixture.state.riderIntents);
  const batch = await source.getLegs(requests, ownership, 'DISCOVERY');
  assert.equal(batch.status, 'COMPLETE');
  assert.equal(source.diagnostics().directedLegProviderRequests, 0);
  assert.equal(source.diagnostics().uniqueLegWork, 31);
  assert.equal(source.diagnostics().cacheHits, 22);
  assert.equal(source.diagnostics().zeroLegs, 4);
  const missing = await source.getLegs([{ from: endpoint('x', 0, 0), to: endpoint('y', 1, 1) }], ownership, 'DISCOVERY');
  assert.equal(missing.status, 'PARTIAL');
});

test('selected geometry is lazy, validated, and re-evaluated on numerical changes', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'generation-1' });
  const jordan = fixture.state.driverOccurrences.find((item) => item.id.includes('-jordan-'));
  const ava = fixture.state.riderIntents.find((item) => item.id.includes('-ava-'));
  const chloe = fixture.state.riderIntents.find((item) => item.id.includes('-chloe-'));
  const travel = fixtureTravel(fixture, jordan, 'LIVE');
  const evaluation = evaluateGroupRoute({ driver: jordan, acceptedMembers: [promise(ava)], candidate: candidate(chloe), travel });
  assert.equal(evaluation.status, 'FEASIBLE');

  let calls = 0;
  const exact = new SharedLiveDirectedTravelSource({
    rootGeneration: 'generation-1',
    adapter: { async route(coordinates) { calls += 1; return successRoute(coordinates, [600, 1680, 420]); } },
  });
  assert.equal(calls, 0);
  const validated = await exact.routeSelectedGeometry({ driver: jordan, plan: evaluation.plan, planningTravel: travel, ownership: liveOwnership() });
  assert.equal(validated.status, 'VALIDATED');
  assert.equal(validated.plan.routing.geometryValidity, 'VALID');
  assert.equal(validated.plan.routing.estimateRevision, validated.travel.revision);
  assert.equal(calls, 1);
  assert.equal(exact.diagnostics().geometryRequests, 1);

  const changed = new SharedLiveDirectedTravelSource({
    rootGeneration: 'generation-1', nowMs: (() => { let value = 1000; return () => value += 1; })(),
    adapter: { async route(coordinates) { return successRoute(coordinates, [600, 1680, 480]); } },
  });
  const revalidated = await changed.routeSelectedGeometry({ driver: jordan, plan: evaluation.plan, planningTravel: travel, ownership: liveOwnership() });
  assert.equal(revalidated.status, 'REVALIDATED');
  assert.equal(revalidated.plan.metrics.totalAddedDriverDurationSeconds, 10 * 60);
  assert.equal(changed.diagnostics().ordersEvaluated, 1);

  const stale = new SharedLiveDirectedTravelSource({
    rootGeneration: 'generation-1',
    adapter: { async route(coordinates) { return successRoute(coordinates, [600, 1680, 1800]); } },
  });
  assert.equal((await stale.routeSelectedGeometry({ driver: jordan, plan: evaluation.plan, planningTravel: travel, ownership: liveOwnership() })).status, 'STALE_PLAN');
});

test('geometry rejects reordered, far-snapped, mixed-mode, provider-mismatched, and cancelled responses', async () => {
  const { driver, plan, travel } = jordanPlan();
  let calls = 0;
  const modeSource = new SharedLiveDirectedTravelSource({ rootGeneration: 'generation-1', adapter: { async route() { calls += 1; throw new Error('not called'); } } });
  assert.equal((await modeSource.routeSelectedGeometry({ driver, plan, planningTravel: { ...travel, mode: 'FIXTURE' }, ownership: liveOwnership() })).code, 'MODE_MISMATCH');
  assert.equal(calls, 0);

  for (const mutate of [
    (route) => { route.snappedWaypoints[1].input = { latitude: 0, longitude: 0 }; },
    (route) => { route.snappedWaypoints[1].distanceMeters = 76; },
    (route) => { route.provider.id = 'different'; },
  ]) {
    const source = new SharedLiveDirectedTravelSource({
      rootGeneration: 'generation-1',
      adapter: { async route(coordinates) { const result = successRoute(coordinates, [600, 1680, 420]); mutate(result.route); return result; } },
    });
    const result = await source.routeSelectedGeometry({ driver, plan, planningTravel: travel, ownership: liveOwnership() });
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.code, 'MALFORMED_RESULT');
  }
  const controller = new AbortController(); controller.abort();
  assert.equal((await modeSource.routeSelectedGeometry({ driver, plan, planningTravel: travel, ownership: liveOwnership(), signal: controller.signal })).code, 'CANCELLED');
});

test('batch adapter produces typed evaluator estimates including zero, unreachable, and missing legs', () => {
  const a = endpoint('a', 40, -73); const b = endpoint('b', 41, -72); const c = endpoint('c', 42, -71);
  const ownership = liveOwnership();
  const batch = {
    status: 'PARTIAL', ownership,
    items: [
      { request: { from: a, to: b }, result: { status: 'AVAILABLE', estimate: { status: 'AVAILABLE', durationSeconds: 1, distanceMeters: 2 }, source: 'PROVIDER', evaluatedAtEpochSeconds: 3 } },
      { request: { from: b, to: c }, result: { status: 'UNREACHABLE', estimate: { status: 'UNREACHABLE' }, source: 'PROVIDER', evaluatedAtEpochSeconds: 4 } },
      { request: { from: c, to: a }, result: { status: 'UNKNOWN', code: 'NETWORK_ERROR', retryable: true, message: 'offline' } },
    ],
  };
  const travel = batchToGroupTravelEstimates({ batch, baseline: { from: a, to: b }, mode: 'LIVE', providerId: 'osrm', revision: 'r1' });
  assert.equal(travel.solo.status, 'AVAILABLE');
  assert.deepEqual(travel.legs.map((leg) => leg.estimate.status), ['AVAILABLE', 'UNREACHABLE', 'MISSING']);
  assert.equal(travel.evaluatedAtEpochSeconds, 4);
});

function jordanPlan() {
  const fixture = createDemo3x7Fixture({ generationId: 'generation-1' });
  const driver = fixture.state.driverOccurrences.find((item) => item.id.includes('-jordan-'));
  const ava = fixture.state.riderIntents.find((item) => item.id.includes('-ava-'));
  const chloe = fixture.state.riderIntents.find((item) => item.id.includes('-chloe-'));
  const travel = fixtureTravel(fixture, driver, 'LIVE');
  const evaluation = evaluateGroupRoute({ driver, acceptedMembers: [promise(ava)], candidate: candidate(chloe), travel });
  assert.equal(evaluation.status, 'FEASIBLE');
  return { driver, plan: evaluation.plan, travel };
}

function fixtureTravel(fixture, selectedDriver, mode) {
  const pointNodes = new Map([[selectedDriver.start.pointId, fixture.nodeByDriverOccurrenceId[selectedDriver.id]], [selectedDriver.campusDropoff.pointId, 'C']]);
  for (const rider of fixture.state.riderIntents) if (rider.pickup.status === 'CONFIRMED') pointNodes.set(rider.pickup.point.pointId, fixture.nodeByRiderIntentId[rider.id]);
  const legs = [];
  for (const [fromPointId, fromNode] of pointNodes) for (const [toPointId, toNode] of pointNodes) {
    if (fromPointId !== toPointId) legs.push({ fromPointId, toPointId, estimate: createDemo3x7TravelEstimate(fromNode, toNode) });
  }
  return { solo: createDemo3x7TravelEstimate(fixture.nodeByDriverOccurrenceId[selectedDriver.id], 'C'), legs, mode, providerId: mode === 'LIVE' ? 'osrm' : 'demo3x7-matrix', evaluatedAtEpochSeconds: 1, revision: 'fixture-plan' };
}

function promise(intent) {
  assert.equal(intent.pickup.status, 'CONFIRMED');
  return {
    requestId: `request-${intent.id}`, proposalId: `proposal-${intent.id}`, proposalRevision: `proposal-revision-${intent.id}`,
    riderIntentId: intent.id, riderParticipantId: intent.riderParticipantId, occurrence: { ...intent.occurrence }, requestedSeats: intent.requestedSeats,
    pickup: structuredClone(intent.pickup.point), acceptedCampusDropoff: structuredClone(intent.acceptedCampusDropoff),
    pickupWindow: { ...intent.pickupWindow }, destinationArrivalWindow: { ...intent.destinationArrivalWindow },
    pickupServiceSeconds: intent.pickupServiceSeconds, accessWalkSeconds: intent.accessWalkSeconds, egressWalkSeconds: intent.egressWalkSeconds,
    maxAccessWalkSeconds: intent.maxAccessWalkSeconds, maxEgressWalkSeconds: intent.maxEgressWalkSeconds, maxExtraInVehicleSeconds: intent.maxExtraInVehicleSeconds,
  };
}

function candidate(intent) {
  return { requestId: `request-${intent.id}`, proposalId: `proposal-${intent.id}`, proposalRevision: `proposal-revision-${intent.id}`, intent };
}

function successRoute(coordinates, durations, options = {}) {
  const legCount = options.legCount ?? coordinates.length - 1;
  const legs = Array.from({ length: legCount }, (_, index) => ({ distanceMeters: durations[index] * 10, durationSeconds: durations[index], summary: '', steps: [] }));
  return { status: 'SUCCESS', route: {
    geometry: coordinates.map((coordinate) => ({ ...coordinate })),
    distanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0), durationSeconds: legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
    provider: { id: 'osrm', name: 'OSRM', baseUrl: 'https://router.project-osrm.org' },
    snappedWaypoints: coordinates.map((coordinate) => ({ input: { ...coordinate }, snapped: { ...coordinate }, distanceMeters: 0, name: '' })), legs,
  } };
}

function endpoint(pointId, latitude, longitude) { return { pointId, coordinate: { latitude, longitude } }; }
function coordinateKey(coordinate) { return `${coordinate.latitude},${coordinate.longitude}`; }
function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function until(predicate) { while (!predicate()) await new Promise((resolve) => setImmediate(resolve)); }
