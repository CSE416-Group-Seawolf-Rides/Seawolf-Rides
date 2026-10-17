import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDemo3x7Fixture,
  createDemo3x7TravelEstimate,
  demo3x7Coordinates,
} from '../src/matching/demo3x7Fixtures.ts';
import {
  buildGroupRecommendations,
  GroupRecommendationCoordinator,
} from '../src/matching/groupRecommendations.ts';
import { FixtureDirectedTravelSource, SharedLiveDirectedTravelSource } from '../src/routing/directedTravelSource.ts';

test('initial 3x7 table is computed as 9 feasible, 9 infeasible, and 3 unknown independent suggestions', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'recommendations-initial' });
  const { source, observedRequests } = fixtureSource(fixture);
  const before = structuredClone(fixture.state);
  const result = await buildGroupRecommendations({
    state: fixture.state, source, routingOwnership: ownership(fixture),
  });
  assert.equal(result.status, 'COMPLETE');
  assert.deepEqual(result.summary, { feasible: 9, infeasible: 9, unknown: 3, excluded: 0 });
  assert.equal(result.recommendations.length, 21);
  assert.equal(new Set(result.recommendations.map((item) => item.riderIntentId)).size, 7);
  assert.equal(fixture.state.pendingRequests.length, 0);
  assert.equal(fixture.state.acceptedMemberships.length, 0);
  assert.equal(fixture.state.combinedPlans.length, 0);
  assert.deepEqual(fixture.state, before);

  assert.equal(observedRequests.length, 57);
  assert.ok(observedRequests.every((request) => !request.from.pointId.includes('grace') && !request.to.pointId.includes('grace')));
  assert.deepEqual(source.diagnostics(), {
    uniqueLegWork: 31, directedLegProviderRequests: 0, cacheHits: 22, zeroLegs: 4,
    geometryRequests: 0, activeProviderRequests: 0, maxConcurrentProviderRequests: 0,
    ordersEvaluated: 18, evaluationTimeMs: source.diagnostics().evaluationTimeMs,
    providerTimeMs: 0, staleResponses: 0,
    statusCounts: { available: 57, unreachable: 0, unknown: 0, cancelled: 0, stale: 0 },
  });
  assert.ok(result.recommendations.every((item) => item.routing.mode === 'FIXTURE'
    && item.ownership.rootGeneration === fixture.state.generationId
    && item.ownership.inputRevision === result.inputRevision
    && item.ownership.membershipRevision === result.membershipRevision));
  assert.match(edge(result, 'jordan', 'grace').explanation, /exact confirmed pickup/i);
  assert.match(edge(result, 'jordan', 'finn').explanation, /total detour/i);
  assert.match(edge(result, 'jordan', 'emi').explanation, /not ready for pickup until after/i);
});

test('initial deterministic ranks use incremental cost, walking, interval width, then stable rider identity', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'recommendations-ranks' });
  const result = await runFixture(fixture);
  assert.equal(result.status, 'COMPLETE');
  assert.deepEqual(feasibleRanks(result, 'jordan'), [['diego', 1], ['ava', 2], ['ben', 3], ['chloe', 4]]);
  assert.deepEqual(feasibleRanks(result, 'morgan'), [['diego', 1], ['ava', 2], ['ben', 3], ['chloe', 4]]);
  assert.deepEqual(feasibleRanks(result, 'taylor'), [['diego', 1]]);

  const ben = rider(fixture, 'ben');
  ben.pickupWindow.latest += 60;
  const tied = await runFixture(fixture);
  assert.equal(tied.status, 'COMPLETE');
  const jordanAva = edge(tied, 'jordan', 'ava');
  const jordanBen = edge(tied, 'jordan', 'ben');
  assert.equal(jordanAva.status, 'FEASIBLE');
  assert.equal(jordanBen.status, 'FEASIBLE');
  assert.equal(jordanAva.metrics.incrementalAddedDriverDurationSeconds, jordanBen.metrics.incrementalAddedDriverDurationSeconds);
  assert.equal(jordanAva.metrics.riderWalkingSeconds, jordanBen.metrics.riderWalkingSeconds);
  assert.equal(jordanAva.metrics.feasibleDepartureIntervalSeconds, jordanBen.metrics.feasibleDepartureIntervalSeconds);
  assert.ok(jordanAva.riderParticipantId.localeCompare(jordanBen.riderParticipantId) < 0);
  assert.ok(jordanAva.rank < jordanBen.rank);
});

test('live recommendation orchestration shares the Stage 3 global request budget and concurrency bound', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'recommendations-live-shared' });
  const nodes = new Map(Object.entries(demo3x7Coordinates).map(([node, coordinate]) => [coordinateKey(coordinate), node]));
  let calls = 0;
  let active = 0;
  let maximum = 0;
  const source = new SharedLiveDirectedTravelSource({
    rootGeneration: fixture.state.generationId,
    concurrency: 3,
    adapter: { async route(coordinates) {
      calls += 1;
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      const estimate = createDemo3x7TravelEstimate(
        nodes.get(coordinateKey(coordinates[0])),
        nodes.get(coordinateKey(coordinates[1])),
      );
      return roadRoute(coordinates, estimate.durationSeconds, estimate.distanceMeters);
    } },
  });
  const result = await buildGroupRecommendations({
    state: fixture.state,
    source,
    routingOwnership: { ...ownership(fixture), mode: 'LIVE', providerId: 'osrm' },
  });
  assert.equal(result.status, 'COMPLETE');
  assert.deepEqual(result.summary, { feasible: 9, infeasible: 9, unknown: 3, excluded: 0 });
  assert.equal(calls, 31);
  assert.equal(maximum, 3);
  assert.equal(source.diagnostics().uniqueLegWork, 31);
  assert.equal(source.diagnostics().geometryRequests, 0);
});

test('occupied-car recommendations preserve Ava and use fresh comparable group costs', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'recommendations-occupied' });
  const initial = await runFixture(fixture);
  assert.equal(initial.status, 'COMPLETE');
  acceptSuggestedPlan(fixture.state, edge(initial, 'jordan', 'ava').plan);
  const before = structuredClone(fixture.state);

  const result = await runFixture(fixture);
  assert.equal(result.status, 'COMPLETE');
  const jordanBen = edge(result, 'jordan', 'ben');
  assert.equal(jordanBen.status, 'INFEASIBLE');
  assert.ok(jordanBen.reasonCodes.includes('NO_FEASIBLE_SCHEDULE'));
  assert.equal(jordanBen.rank, null);

  const morganBen = edge(result, 'morgan', 'ben');
  assert.equal(morganBen.status, 'FEASIBLE');
  assert.equal(morganBen.requestedSeats, 2);
  assert.equal(morganBen.plan.riderPromises.length, 1);
  assert.equal(morganBen.plan.riderPromises[0].requestedSeats, 2);

  const jordanChloe = edge(result, 'jordan', 'chloe');
  assert.equal(jordanChloe.status, 'FEASIBLE');
  assert.equal(jordanChloe.metrics.totalAddedDriverDurationSeconds, 9 * 60);
  assert.equal(jordanChloe.metrics.incrementalAddedDriverDurationSeconds, 7 * 60);
  assert.equal(jordanChloe.plan.riderPromises.length, 2);
  assert.ok(jordanChloe.plan.riderPromises.some((promise) => promise.riderParticipantId.includes('-ava')));

  assert.equal(edge(result, 'jordan', 'ava').status, 'EXCLUDED');
  assert.equal(edge(result, 'morgan', 'ava').status, 'EXCLUDED');
  assert.equal(edge(result, 'morgan', 'ava').reasonCodes[0], 'RIDER_COMMITTED_TO_ANOTHER_CAR');
  assert.deepEqual(fixture.state, before);
  assert.notEqual(initial.membershipRevision, result.membershipRevision);
  assert.equal(initial.inputRevision, result.inputRevision);
});

test('another car membership does not consume this car capacity and two-seat Ben remains one pickup', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'recommendations-capacity' });
  const initial = await runFixture(fixture);
  assert.equal(initial.status, 'COMPLETE');
  acceptSuggestedPlan(fixture.state, edge(initial, 'jordan', 'ava').plan);
  const result = await runFixture(fixture);
  assert.equal(result.status, 'COMPLETE');
  const morganBen = edge(result, 'morgan', 'ben');
  assert.equal(morganBen.status, 'FEASIBLE');
  assert.equal(morganBen.plan.memberParticipantIds.length, 1);
  assert.equal(morganBen.plan.pickups.length, 1);
  assert.equal(morganBen.plan.riderPromises[0].requestedSeats, 2);
});

test('missing provider estimates stay unknown and never receive a rank', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'recommendations-provider-failure' });
  const base = fixtureSource(fixture).source;
  const failedSource = {
    async getLegs(requests, routingOwnership, purpose, signal) {
      const batch = await base.getLegs(requests, routingOwnership, purpose, signal);
      const items = batch.items.map((item) => item.request.from.pointId.includes('m-ava-pickup')
        && item.request.to.pointId === 'tabler-campus'
        ? { request: item.request, result: { status: 'UNKNOWN', code: 'NETWORK_ERROR', retryable: true, message: 'offline' } }
        : item);
      return { ...batch, status: 'PARTIAL', items };
    },
    recordEvaluation: (evaluation, elapsedMs) => base.recordEvaluation(evaluation, elapsedMs),
  };
  const result = await buildGroupRecommendations({
    state: fixture.state, source: failedSource, routingOwnership: ownership(fixture),
  });
  assert.equal(result.status, 'COMPLETE');
  for (const driverKey of ['jordan', 'morgan', 'taylor']) {
    const ava = edge(result, driverKey, 'ava');
    assert.equal(ava.status, 'UNKNOWN');
    assert.equal(ava.rank, null);
    assert.ok(ava.reasonCodes.includes('MISSING_TRAVEL_ESTIMATE'));
  }
});

test('superseded late success and late failure cannot become the coordinator result', async () => {
  for (const failLate of [false, true]) {
    const fixture = createDemo3x7Fixture({ generationId: `recommendations-stale-${failLate}` });
    const base = fixtureSource(fixture).source;
    const gate = deferred();
    let calls = 0;
    const source = {
      async getLegs(requests, routingOwnership, purpose) {
        calls += 1;
        if (calls === 1) {
          await gate.promise;
          if (failLate) throw new Error('late provider failure');
        }
        return base.getLegs(requests, routingOwnership, purpose);
      },
      recordEvaluation: (evaluation, elapsedMs) => base.recordEvaluation(evaluation, elapsedMs),
    };
    const coordinator = new GroupRecommendationCoordinator();
    const old = coordinator.recommend({ state: fixture.state, source, routingOwnership: ownership(fixture) });
    await until(() => calls === 1);
    const current = coordinator.recommend({ state: fixture.state, source, routingOwnership: ownership(fixture) });
    assert.equal((await current).status, 'COMPLETE');
    gate.resolve();
    assert.equal((await old).status, 'STALE');
  }
});

test('relevant input and routing-context changes produce distinct ownership revisions', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'recommendations-ownership' });
  const initial = await runFixture(fixture);
  assert.equal(initial.status, 'COMPLETE');
  rider(fixture, 'chloe').pickupWindow.latest -= 1;
  const changedInput = await runFixture(fixture);
  assert.equal(changedInput.status, 'COMPLETE');
  assert.notEqual(changedInput.inputRevision, initial.inputRevision);

  const { source } = fixtureSource(fixture);
  const changedRouting = await buildGroupRecommendations({
    state: fixture.state,
    source,
    routingOwnership: { ...ownership(fixture), optionsKey: 'avoid-ferries' },
  });
  assert.equal(changedRouting.status, 'COMPLETE');
  assert.notEqual(changedRouting.estimateRevision, changedInput.estimateRevision);
  assert.ok(changedRouting.recommendations.every((item) => item.ownership.optionsKey === 'avoid-ferries'));
});

function fixtureSource(fixture) {
  const nodes = new Map(Object.entries(demo3x7Coordinates).map(([node, coordinate]) => [coordinateKey(coordinate), node]));
  const observedRequests = [];
  const source = new FixtureDirectedTravelSource({
    rootGeneration: fixture.state.generationId,
    providerId: 'demo3x7-matrix',
    evaluatedAtEpochSeconds: 1_800_000_000,
    resolve: (from, to) => createDemo3x7TravelEstimate(nodes.get(coordinateKey(from)), nodes.get(coordinateKey(to))),
  });
  const original = source.getLegs.bind(source);
  source.getLegs = (requests, ...rest) => {
    observedRequests.push(...requests);
    return original(requests, ...rest);
  };
  return { source, observedRequests };
}

function ownership(fixture) {
  return {
    mode: 'FIXTURE', providerId: 'demo3x7-matrix', profile: 'driving', optionsKey: 'default',
    rootGeneration: fixture.state.generationId, estimateVersion: 'demo3x7-v1',
  };
}

async function runFixture(fixture) {
  return buildGroupRecommendations({
    state: fixture.state,
    source: fixtureSource(fixture).source,
    routingOwnership: ownership(fixture),
  });
}

function acceptSuggestedPlan(state, plan) {
  assert.equal(plan.riderPromises.length, 1);
  const promise = plan.riderPromises[0];
  state.acceptedMemberships.push({
    requestId: promise.requestId,
    driverOccurrenceId: plan.driverOccurrenceId,
    riderIntentId: promise.riderIntentId,
    riderParticipantId: promise.riderParticipantId,
    proposalId: promise.proposalId,
    proposalRevision: promise.proposalRevision,
    requestedSeats: promise.requestedSeats,
    acceptedAtEpochSeconds: 1_800_000_001,
  });
  state.combinedPlans.push(structuredClone(plan));
}

function feasibleRanks(result, driverKey) {
  return result.recommendations
    .filter((item) => item.status === 'FEASIBLE' && item.driverOccurrenceId.includes(`-${driverKey}-`))
    .sort((left, right) => left.rank - right.rank)
    .map((item) => [riderKey(item.riderIntentId), item.rank]);
}

function edge(result, driverKey, selectedRider) {
  return result.recommendations.find((item) => item.driverOccurrenceId.includes(`-${driverKey}-`)
    && item.riderIntentId.includes(`-${selectedRider}-`));
}

function rider(fixture, key) {
  return fixture.state.riderIntents.find((item) => item.id.includes(`-${key}-`));
}

function riderKey(id) {
  return ['ava', 'ben', 'chloe', 'diego', 'emi', 'finn', 'grace'].find((key) => id.includes(`-${key}-`));
}

function coordinateKey(coordinate) { return `${coordinate.latitude},${coordinate.longitude}`; }
function roadRoute(coordinates, durationSeconds, distanceMeters) {
  return { status: 'SUCCESS', route: {
    geometry: coordinates.map((coordinate) => ({ ...coordinate })), durationSeconds, distanceMeters,
    provider: { id: 'osrm', name: 'OSRM', baseUrl: 'https://router.project-osrm.org' },
    snappedWaypoints: coordinates.map((coordinate) => ({
      input: { ...coordinate }, snapped: { ...coordinate }, distanceMeters: 0, name: '',
    })),
    legs: [{ durationSeconds, distanceMeters, summary: '', steps: [] }],
  } };
}
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
async function until(predicate) { while (!predicate()) await new Promise((resolve) => setImmediate(resolve)); }
