import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDemo3x7Fixture,
  createDemo3x7TravelEstimate,
  demo3x7Coordinates,
} from '../src/matching/demo3x7Fixtures.ts';
import {
  GroupAcceptanceService,
  MultiCarScenarioStore,
  acceptGroupRequest,
  cancelGroupMembership,
  createPendingGroupProposal,
} from '../src/rides/groupAcceptance.ts';
import { getDriverCapacity } from '../src/rides/groupRideContracts.ts';
import {
  FRIDAY_DRIVER_TEST_PREFIX,
  buildFridayDriverTest,
  createFridayGroupStoreData,
} from '../src/rides/fridayDriverTest.ts';
import { FixtureDirectedTravelSource } from '../src/routing/directedTravelSource.ts';

test('two asynchronous requests racing for one seat commit exactly one membership and plan', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'accept-last-seat' });
  const morgan = driver(fixture, 'morgan');
  morgan.passengerCapacity = 1;
  const setup = scenarioStore(fixture, [[morgan, rider(fixture, 'ava')], [morgan, rider(fixture, 'diego')]]);
  const gated = gatedSource(fixture, 2);
  const first = accept(setup.store, setup.requestIds[0], gated.source, fixture);
  const second = accept(setup.store, setup.requestIds[1], gated.source, fixture);
  await until(() => gated.calls() === 2);
  gated.release();
  const results = await Promise.all([first, second]);
  assert.deepEqual(results.map((item) => item.code).sort(), ['ACCEPTED', 'NO_REMAINING_CAPACITY']);
  const state = setup.store.snapshot().scenario;
  assert.equal(state.acceptedMemberships.length, 1);
  assert.equal(state.combinedPlans.length, 1);
  assert.equal(state.combinedPlans[0].memberRequestIds.length, 1);
});

test('the same rider racing across two cars can commit to only one occurrence', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'accept-cross-car' });
  const setup = scenarioStore(fixture, [
    [driver(fixture, 'jordan'), rider(fixture, 'ava')],
    [driver(fixture, 'morgan'), rider(fixture, 'ava')],
  ]);
  const gated = gatedSource(fixture, 2);
  const resultsPromise = Promise.all(setup.requestIds.map((requestId) => accept(setup.store, requestId, gated.source, fixture)));
  await until(() => gated.calls() === 2);
  gated.release();
  const results = await resultsPromise;
  assert.deepEqual(results.map((item) => item.code).sort(), ['ACCEPTED', 'DUPLICATE_COMMITMENT']);
  assert.equal(setup.store.snapshot().scenario.acceptedMemberships.length, 1);
});

test('pending requests consume no seats and another car remains independent', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'accept-independent-capacity' });
  const jordan = driver(fixture, 'jordan');
  const morgan = driver(fixture, 'morgan');
  const setup = scenarioStore(fixture, [
    [jordan, rider(fixture, 'ben')], [morgan, rider(fixture, 'ben')],
  ]);
  assert.equal(getDriverCapacity(setup.store.snapshot().scenario, jordan.id).remainingSeats, 3);
  assert.equal(getDriverCapacity(setup.store.snapshot().scenario, morgan.id).remainingSeats, 3);
  const accepted = await accept(setup.store, setup.requestIds[0], fixtureSource(fixture), fixture);
  assert.equal(accepted.code, 'ACCEPTED');
  const state = setup.store.snapshot().scenario;
  assert.equal(getDriverCapacity(state, jordan.id).remainingSeats, 1);
  assert.equal(getDriverCapacity(state, morgan.id).remainingSeats, 3);
  assert.equal(accepted.plan.riderPromises.length, 1);
  assert.equal(accepted.plan.pickups.length, 1);
  assert.equal(accepted.plan.riderPromises[0].requestedSeats, 2);
});

test('individually feasible Jordan requests are rejected when their complete group cannot fit', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'accept-group-failure' });
  const jordan = driver(fixture, 'jordan');
  const setup = scenarioStore(fixture, [[jordan, rider(fixture, 'ava')], [jordan, rider(fixture, 'ben')]]);
  assert.equal((await accept(setup.store, setup.requestIds[0], fixtureSource(fixture), fixture)).code, 'ACCEPTED');
  const before = setup.store.snapshot();
  const rejected = await accept(setup.store, setup.requestIds[1], fixtureSource(fixture), fixture);
  assert.equal(rejected.code, 'GROUP_INFEASIBLE');
  assert.ok(rejected.evaluation.reasonCodes.includes('NO_FEASIBLE_SCHEDULE'));
  const after = setup.store.snapshot();
  assert.deepEqual(after.scenario.acceptedMemberships, before.scenario.acceptedMemberships);
  assert.deepEqual(after.scenario.combinedPlans, before.scenario.combinedPlans);
  assert.equal(after.scenario.pendingRequests.length, 1);
});

test('cancellation, expiry, input edits, and generation reloads during routing never commit stale work', async () => {
  const cases = [
    {
      name: 'cancelled', expected: 'CANCELLED',
      change: ({ controller }) => controller.abort(),
    },
    {
      name: 'expired', expected: 'PROPOSAL_EXPIRED',
      change: ({ clock }) => { clock.value = 10_000; },
    },
    {
      name: 'input', expected: 'RIDER_INTENT_CHANGED',
      change: ({ store }) => {
        const data = dataFromSnapshot(store.snapshot());
        data.scenario.riderIntents[0].intentRevision += ':edited';
        store.replace(data);
      },
    },
    {
      name: 'generation', expected: 'GENERATION_CHANGED',
      change: ({ store }) => {
        const data = dataFromSnapshot(store.snapshot());
        data.scenario.generationId = 'reloaded-generation';
        data.scenario.driverOccurrences.forEach((item) => { item.generationId = 'reloaded-generation'; });
        data.scenario.riderIntents.forEach((item) => { item.generationId = 'reloaded-generation'; });
        store.replace(data);
      },
    },
  ];
  for (const selected of cases) {
    const fixture = createDemo3x7Fixture({ generationId: `accept-${selected.name}` });
    const setup = scenarioStore(fixture, [[driver(fixture, 'jordan'), rider(fixture, 'ava')]], { expiresAt: 100 });
    const gated = gatedSource(fixture, 1);
    const controller = new AbortController();
    const clock = { value: 50 };
    const pending = acceptGroupRequest({
      store: setup.store, requestId: setup.requestIds[0], source: gated.source,
      routingOwnership: ownership(fixture), nowEpochSeconds: () => clock.value,
      signal: controller.signal, maxRetries: 1,
    });
    await until(() => gated.calls() === 1);
    selected.change({ store: setup.store, controller, clock });
    gated.release();
    const result = await pending;
    assert.equal(result.code, selected.expected, selected.name);
    assert.equal(setup.store.snapshot().scenario.acceptedMemberships.length, 0, selected.name);
  }
});

test('duplicate taps share one acceptance operation', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'accept-duplicate-tap' });
  const setup = scenarioStore(fixture, [[driver(fixture, 'jordan'), rider(fixture, 'ava')]]);
  const gated = gatedSource(fixture, 1);
  const service = new GroupAcceptanceService();
  const options = {
    store: setup.store, requestId: setup.requestIds[0], source: gated.source,
    routingOwnership: ownership(fixture), nowEpochSeconds: () => 50,
  };
  const first = service.accept(options);
  const second = service.accept(options);
  assert.equal(first, second);
  await until(() => gated.calls() === 1);
  gated.release();
  assert.equal((await first).code, 'ACCEPTED');
  assert.equal(setup.store.snapshot().scenario.acceptedMemberships.length, 1);
});

test('late live geometry after reset cannot commit and live acceptance uses its revalidated plan', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'accept-live-geometry' });
  const setup = scenarioStore(fixture, [[driver(fixture, 'jordan'), rider(fixture, 'ava')]]);
  const base = fixtureSource(fixture);
  const gate = deferred();
  let geometryCalls = 0;
  const source = {
    getLegs: (requests, _owner, purpose, signal) => base.getLegs(requests, ownership(fixture), purpose, signal),
    recordEvaluation: (evaluation, elapsed) => base.recordEvaluation(evaluation, elapsed),
    async routeSelectedGeometry(options) {
      geometryCalls += 1;
      await gate.promise;
      return { status: 'VALIDATED', route: fakeRoadRoute(options), travel: options.planningTravel, plan: { ...options.plan, routing: { ...options.plan.routing, geometryValidity: 'VALID' } } };
    },
  };
  const pending = acceptGroupRequest({
    store: setup.store, requestId: setup.requestIds[0], source,
    routingOwnership: { ...ownership(fixture), mode: 'LIVE', providerId: 'osrm' },
    nowEpochSeconds: () => 50,
  });
  await until(() => geometryCalls === 1);
  const reloaded = dataFromSnapshot(setup.store.snapshot());
  reloaded.scenario.generationId = 'new-live-generation';
  setup.store.replace(reloaded);
  gate.resolve();
  const result = await pending;
  assert.equal(result.code, 'GENERATION_CHANGED');
  assert.equal(setup.store.snapshot().scenario.acceptedMemberships.length, 0);
});

test('live acceptance commits the geometry-stage revalidated plan', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'accept-live-revalidated' });
  const setup = scenarioStore(fixture, [[driver(fixture, 'jordan'), rider(fixture, 'ava')]]);
  const base = fixtureSource(fixture);
  const source = {
    getLegs: (requests, _owner, purpose, signal) => base.getLegs(requests, ownership(fixture), purpose, signal),
    recordEvaluation: (evaluation, elapsed) => base.recordEvaluation(evaluation, elapsed),
    async routeSelectedGeometry(options) {
      const plan = {
        ...options.plan,
        revision: `${options.plan.revision}:geometry`,
        metrics: { ...options.plan.metrics, roadDistanceMeters: options.plan.metrics.roadDistanceMeters + 1 },
        routing: { ...options.plan.routing, geometryValidity: 'VALID', estimateRevision: `${options.plan.routing.estimateRevision}:geometry` },
      };
      return { status: 'REVALIDATED', route: fakeRoadRoute(options), travel: options.planningTravel, plan, evaluation: { status: 'FEASIBLE', plan, diagnostics: { permittedOrders: 1, evaluatedOrders: 1, unresolvedOrders: 0, maxStops: 4, maxOrders: 24 } } };
    },
  };
  const result = await acceptGroupRequest({
    store: setup.store, requestId: setup.requestIds[0], source,
    routingOwnership: { ...ownership(fixture), mode: 'LIVE', providerId: 'osrm' },
    nowEpochSeconds: () => 50,
  });
  assert.equal(result.code, 'ACCEPTED');
  assert.equal(result.verification, 'LIVE_GEOMETRY');
  assert.match(result.plan.revision, /:geometry$/);
  assert.equal(setup.store.snapshot().scenario.combinedPlans[0].revision, result.plan.revision);
});

test('missing accepted promises return unknown instead of treating an occupied car as empty', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'accept-missing-promise' });
  const jordan = driver(fixture, 'jordan');
  const setup = scenarioStore(fixture, [[jordan, rider(fixture, 'ava')], [jordan, rider(fixture, 'chloe')]]);
  assert.equal((await accept(setup.store, setup.requestIds[0], fixtureSource(fixture), fixture)).code, 'ACCEPTED');
  const broken = dataFromSnapshot(setup.store.snapshot());
  broken.scenario.combinedPlans[0].riderPromises = [];
  setup.store.replace(broken);
  const before = setup.store.snapshot();
  const result = await accept(setup.store, setup.requestIds[1], fixtureSource(fixture), fixture);
  assert.equal(result.code, 'ACCEPTED_GROUP_INCOMPLETE');
  assert.deepEqual(setup.store.snapshot().scenario.acceptedMemberships, before.scenario.acceptedMemberships);
});

test('accepted membership survives proposal expiry and cancellation preserves remaining promises', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'accept-cancel-membership' });
  const jordan = driver(fixture, 'jordan');
  const setup = scenarioStore(fixture, [[jordan, rider(fixture, 'ava')], [jordan, rider(fixture, 'chloe')]], { expiresAt: 100 });
  assert.equal((await accept(setup.store, setup.requestIds[0], fixtureSource(fixture), fixture, 50)).code, 'ACCEPTED');
  assert.equal((await accept(setup.store, setup.requestIds[1], fixtureSource(fixture), fixture, 50)).code, 'ACCEPTED');
  const accepted = setup.store.snapshot();
  assert.equal(accepted.scenario.acceptedMemberships.length, 2);
  assert.equal(accepted.pendingProposals.length, 0);

  const cancelled = await cancelGroupMembership({
    store: setup.store, requestId: setup.requestIds[0], source: fixtureSource(fixture),
    routingOwnership: ownership(fixture),
  });
  assert.equal(cancelled.code, 'CANCELLED_MEMBERSHIP');
  const state = setup.store.snapshot().scenario;
  assert.equal(state.acceptedMemberships.length, 1);
  assert.equal(state.acceptedMemberships[0].riderParticipantId, rider(fixture, 'chloe').riderParticipantId);
  assert.equal(state.combinedPlans[0].riderPromises.length, 1);
  assert.equal(state.combinedPlans[0].riderPromises[0].riderParticipantId, rider(fixture, 'chloe').riderParticipantId);
  assert.equal(getDriverCapacity(state, jordan.id).remainingSeats, 2);
});

test('Friday dated proposals use the shared group acceptance path with combined fixture legs', async () => {
  const now = 1_700_000_000;
  const built = await buildFridayDriverTest({
    adapter: pairAdapter(), driverId: 'friday-driver', evaluatedAtEpochSeconds: now,
  });
  assert.equal(built.status, 'SUCCESS');
  const data = createFridayGroupStoreData(built);
  const store = new MultiCarScenarioStore(data);
  const fridayFixture = { ...createDemo3x7Fixture({ generationId: built.generationId }), state: data.scenario };
  assert.equal((await acceptGroupRequest({ store, requestId: `${FRIDAY_DRIVER_TEST_PREFIX}ava`, source: fixtureSource(fridayFixture), routingOwnership: fridayOwnership(built.generationId), nowEpochSeconds: () => now })).code, 'ACCEPTED');
  assert.equal((await acceptGroupRequest({ store, requestId: `${FRIDAY_DRIVER_TEST_PREFIX}ben`, source: fixtureSource(fridayFixture), routingOwnership: fridayOwnership(built.generationId), nowEpochSeconds: () => now })).code, 'ACCEPTED');
  const rejected = await acceptGroupRequest({ store, requestId: `${FRIDAY_DRIVER_TEST_PREFIX}chloe`, source: fixtureSource(fridayFixture), routingOwnership: fridayOwnership(built.generationId), nowEpochSeconds: () => now });
  assert.equal(rejected.code, 'NO_REMAINING_CAPACITY');
  assert.deepEqual(store.snapshot().scenario.acceptedMemberships.map((item) => item.requestedSeats), [1, 2]);
  assert.equal(store.snapshot().scenario.combinedPlans[0].riderPromises.length, 2);
});

test('Emi explanation keeps the provable readiness-versus-arrival failure', async () => {
  const fixture = createDemo3x7Fixture({ generationId: 'emi-explanation' });
  const setup = scenarioStore(fixture, [[driver(fixture, 'jordan'), rider(fixture, 'emi')]]);
  const result = await accept(setup.store, setup.requestIds[0], fixtureSource(fixture), fixture);
  assert.equal(result.code, 'GROUP_INFEASIBLE');
  assert.ok(result.evaluation.reasonCodes.includes('DESTINATION_WINDOW'));
  assert.match(result.message, /not ready for pickup until after/i);
});

function scenarioStore(fixture, pairs, options = {}) {
  const state = structuredClone(fixture.state);
  const pendingProposals = [];
  const requestIds = [];
  pairs.forEach(([selectedDriver, intent], index) => {
    const requestId = `pending-${index}-${selectedDriver.id}-${intent.id}`;
    const pending = createPendingGroupProposal({
      driver: selectedDriver, intent, requestId,
      proposalId: `proposal-${requestId}`, proposalRevision: `proposal-revision-${requestId}`,
      createdAtEpochSeconds: 1, expiresAtEpochSeconds: options.expiresAt ?? 10_000,
    });
    state.pendingRequests.push(pending.request);
    pendingProposals.push(pending.proposal);
    requestIds.push(requestId);
  });
  return {
    store: new MultiCarScenarioStore({ scenario: state, pendingProposals, skippedDriverOccurrenceIds: [], cancelledRequestIds: [] }),
    requestIds,
  };
}

function fixtureSource(fixture) {
  const nodes = new Map(Object.entries(demo3x7Coordinates).map(([node, coordinate]) => [coordinateKey(coordinate), node]));
  return new FixtureDirectedTravelSource({
    rootGeneration: fixture.state.generationId, providerId: 'demo3x7-matrix', evaluatedAtEpochSeconds: 50,
    resolve: (from, to) => {
      const fromNode = nodes.get(coordinateKey(from));
      const toNode = nodes.get(coordinateKey(to));
      return fromNode && toNode ? createDemo3x7TravelEstimate(fromNode, toNode) : undefined;
    },
  });
}

function gatedSource(fixture, waitForCalls) {
  const base = fixtureSource(fixture);
  const gate = deferred();
  let count = 0;
  return {
    source: {
      async getLegs(...args) {
        count += 1;
        if (count <= waitForCalls) await gate.promise;
        return base.getLegs(...args);
      },
      recordEvaluation: (evaluation, elapsed) => base.recordEvaluation(evaluation, elapsed),
    },
    calls: () => count,
    release: gate.resolve,
  };
}

function accept(store, requestId, source, fixture, now = 50) {
  return acceptGroupRequest({
    store, requestId, source, routingOwnership: ownership(fixture), nowEpochSeconds: () => now,
  });
}

function ownership(fixture) {
  return { mode: 'FIXTURE', providerId: 'demo3x7-matrix', profile: 'driving', optionsKey: 'default', rootGeneration: fixture.state.generationId, estimateVersion: 'v1' };
}

function fridayOwnership(generationId) {
  return { mode: 'FIXTURE', providerId: 'demo3x7-matrix', profile: 'driving', optionsKey: 'friday', rootGeneration: generationId, estimateVersion: 'v1' };
}

function pairAdapter() {
  const nodes = new Map(Object.entries(demo3x7Coordinates).map(([node, coordinate]) => [coordinateKey(coordinate), node]));
  return { async route(coordinates) {
    let durationSeconds = 0;
    let distanceMeters = 0;
    const legs = [];
    for (let index = 1; index < coordinates.length; index += 1) {
      const estimate = createDemo3x7TravelEstimate(nodes.get(coordinateKey(coordinates[index - 1])), nodes.get(coordinateKey(coordinates[index])));
      durationSeconds += estimate.durationSeconds;
      distanceMeters += estimate.distanceMeters;
      legs.push({ durationSeconds: estimate.durationSeconds, distanceMeters: estimate.distanceMeters, summary: '', steps: [] });
    }
    return { status: 'SUCCESS', route: {
      geometry: coordinates.map((item) => ({ ...item })), durationSeconds, distanceMeters,
      provider: { id: 'osrm', name: 'OSRM', baseUrl: 'fixture' }, legs,
      snappedWaypoints: coordinates.map((item) => ({ input: { ...item }, snapped: { ...item }, distanceMeters: 0, name: '' })),
    } };
  } };
}

function fakeRoadRoute(options) {
  const coordinates = [options.driver.start.coordinate, ...options.plan.selectedRequestOrder.map((id) => options.plan.riderPromises.find((item) => item.requestId === id).pickup.coordinate), options.driver.campusDropoff.coordinate];
  return pairAdapter().route(coordinates).then ? { geometry: [], distanceMeters: 0, durationSeconds: 0, provider: { id: 'osrm', name: 'OSRM', baseUrl: 'fixture' }, snappedWaypoints: [], legs: [] } : null;
}

function dataFromSnapshot(snapshot) {
  return { scenario: snapshot.scenario, pendingProposals: snapshot.pendingProposals, skippedDriverOccurrenceIds: snapshot.skippedDriverOccurrenceIds, cancelledRequestIds: snapshot.cancelledRequestIds };
}

function driver(fixture, key) { return fixture.state.driverOccurrences.find((item) => item.id.includes(`-${key}-`)); }
function rider(fixture, key) { return fixture.state.riderIntents.find((item) => item.id.includes(`-${key}-`)); }
function coordinateKey(coordinate) { return `${coordinate.latitude},${coordinate.longitude}`; }
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
async function until(predicate) { while (!predicate()) await new Promise((resolve) => setImmediate(resolve)); }
