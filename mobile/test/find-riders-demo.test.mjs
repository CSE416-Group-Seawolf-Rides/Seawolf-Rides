import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRiderDemoCaseCandidates,
  createRiderDemoCandidates,
  createRiderDemoFixtureAdapter,
  RIDER_DEMO_PICKUP_SERVICE_SECONDS,
  riderDemoDriver,
} from '../src/matching/riderDemoFixtures.ts';
import {
  evaluateRiderDemo,
  LatestRiderDemoEvaluation,
  rankRiderDemoCandidates,
  riderDemoReasonExplanations,
} from '../src/matching/riderDemoEvaluation.ts';
import {
  createRiderDemoPresentationState,
  riderDemoPresentationReducer,
} from '../src/matching/riderDemoPresentation.ts';

async function fixtureEvaluation() {
  const candidates = createRiderDemoCandidates();
  return evaluateRiderDemo({
    adapter: createRiderDemoFixtureAdapter(candidates),
    candidates,
    mode: 'FIXTURE',
  });
}

function byId(result, id) {
  return result.candidates.find((candidate) => candidate.candidate.id === id);
}

test('maps ordered route legs from seconds/meters into the evaluator and adds service once', async () => {
  const result = await fixtureEvaluation();
  const alex = byId(result, 'rider-alex');

  assert.equal(result.baselineRoute.durationSeconds, 30 * 60);
  assert.equal(result.baselineRoute.distanceMeters, 21_000);
  assert.equal(alex.route.legs[0].durationSeconds, 8 * 60);
  assert.equal(alex.route.legs[1].durationSeconds, 24 * 60);
  assert.equal(alex.evaluation.status, 'FEASIBLE');
  assert.equal(alex.evaluation.metrics.sharedDurationSeconds, 34 * 60);
  assert.equal(alex.evaluation.metrics.driverExtraDurationSeconds, 4 * 60);
  assert.equal(alex.evaluation.metrics.sharedDistanceMeters, 21_500);
  assert.equal(
    alex.evaluation.plan.boardingComplete - alex.evaluation.plan.pickup,
    RIDER_DEMO_PICKUP_SERVICE_SECONDS,
  );
  assert.equal(
    alex.evaluation.plan.vehicleCampusArrival - alex.evaluation.plan.departure,
    alex.route.legs[0].durationSeconds +
      RIDER_DEMO_PICKUP_SERVICE_SECONDS +
      alex.route.legs[1].durationSeconds,
  );
});

test('normalizes fractional provider SI units to the evaluator integer contract', async () => {
  const candidates = createRiderDemoCandidates();
  const fixture = createRiderDemoFixtureAdapter(candidates);
  const adapter = {
    route: async (coordinates, options) => {
      const result = await fixture.route(coordinates, options);
      if (result.status === 'SUCCESS') {
        result.route.durationSeconds += 0.49;
        result.route.distanceMeters += 0.49;
        for (const leg of result.route.legs) {
          leg.durationSeconds += 0.49;
          leg.distanceMeters += 0.49;
        }
      }
      return result;
    },
  };
  const result = await evaluateRiderDemo({ adapter, candidates, mode: 'LIVE_OSRM' });
  const alex = byId(result, 'rider-alex');

  assert.equal(alex.evaluation.status, 'FEASIBLE');
  assert.equal(alex.evaluation.metrics.soloDurationSeconds, 30 * 60);
  assert.equal(alex.evaluation.metrics.sharedDurationSeconds, 34 * 60);
  assert.equal(alex.evaluation.metrics.sharedDistanceMeters, 21_500);
});

test('fixture mode produces the six intended independent outcomes and explanations', async () => {
  const result = await fixtureEvaluation();

  assert.equal(result.candidates.length, 6);
  assert.deepEqual(
    result.candidates.map(({ candidate, evaluation }) => [candidate.id, evaluation.status]),
    [
      ['rider-alex', 'FEASIBLE'],
      ['rider-blair', 'FEASIBLE'],
      ['rider-casey', 'INFEASIBLE'],
      ['rider-drew', 'INFEASIBLE'],
      ['rider-erin', 'UNKNOWN'],
      ['rider-finn', 'UNKNOWN'],
    ],
  );
  assert.deepEqual(byId(result, 'rider-casey').evaluation.reasonCodes, ['NO_FEASIBLE_DEPARTURE']);
  assert.deepEqual(byId(result, 'rider-drew').evaluation.reasonCodes, ['DRIVER_DETOUR_LIMIT']);
  assert.deepEqual(byId(result, 'rider-erin').evaluation.reasonCodes, ['LOCATION_UNCONFIRMED']);
  assert.deepEqual(byId(result, 'rider-finn').evaluation.reasonCodes, ['MISSING_TRAVEL_ESTIMATE']);
  assert.match(riderDemoReasonExplanations.NO_FEASIBLE_DEPARTURE, /departure/i);
  assert.match(riderDemoReasonExplanations.LOCATION_UNCONFIRMED, /not confirmed/i);
});

test('both presentation cases use the shared evaluator and change the recommendation by schedule', async () => {
  const compareCandidates = createRiderDemoCaseCandidates('COMPARE_PICKUPS');
  const compare = await evaluateRiderDemo({
    adapter: createRiderDemoFixtureAdapter(compareCandidates),
    candidates: compareCandidates,
    mode: 'FIXTURE',
  });
  const changedCandidates = createRiderDemoCaseCandidates('SCHEDULE_CHANGE');
  const changed = await evaluateRiderDemo({
    adapter: createRiderDemoFixtureAdapter(changedCandidates),
    candidates: changedCandidates,
    mode: 'FIXTURE',
  });

  assert.equal(byId(compare, 'rider-alex').rank, 1);
  assert.equal(byId(compare, 'rider-blair').rank, 2);
  assert.equal(byId(compare, 'rider-alex').evaluation.plan.pickup, Date.parse('2026-10-19T08:13:00-04:00') / 1000);
  assert.equal(byId(compare, 'rider-alex').evaluation.plan.vehicleCampusArrival, Date.parse('2026-10-19T08:39:00-04:00') / 1000);

  assert.equal(byId(changed, 'rider-alex').evaluation.status, 'INFEASIBLE');
  assert.deepEqual(byId(changed, 'rider-alex').evaluation.reasonCodes, ['NO_FEASIBLE_DEPARTURE']);
  assert.equal(byId(changed, 'rider-alex').rank, null);
  assert.equal(byId(changed, 'rider-blair').rank, 1);

  assert.deepEqual(changedCandidates[0].pickup, compareCandidates[0].pickup);
  assert.deepEqual(changedCandidates[0].input.driver, compareCandidates[0].input.driver);
  assert.deepEqual(changedCandidates[0].input.travel, compareCandidates[0].input.travel);
  assert.notDeepEqual(
    changedCandidates[0].input.rider.pickupWindow,
    compareCandidates[0].input.rider.pickupWindow,
  );
});

test('changing cases clears loaded data and stale completion cannot repopulate it', async () => {
  const candidates = createRiderDemoCaseCandidates('COMPARE_PICKUPS');
  const result = await evaluateRiderDemo({
    adapter: createRiderDemoFixtureAdapter(candidates),
    candidates,
    mode: 'FIXTURE',
  });
  let state = createRiderDemoPresentationState();
  state = riderDemoPresentationReducer(state, { type: 'LOAD', candidates, token: 1 });
  state = riderDemoPresentationReducer(state, { type: 'BEGIN_EVALUATION', token: 2 });
  assert.strictEqual(
    riderDemoPresentationReducer(state, { type: 'BEGIN_EVALUATION', token: 3 }),
    state,
  );

  state = riderDemoPresentationReducer(state, {
    type: 'SELECT_CASE',
    caseId: 'SCHEDULE_CHANGE',
    token: 3,
  });
  assert.equal(state.candidates, null);
  assert.equal(state.result, null);
  assert.equal(state.selectedCandidateId, null);
  assert.equal(state.evaluating, false);

  const afterStaleCompletion = riderDemoPresentationReducer(state, {
    type: 'COMPLETE_EVALUATION',
    caseId: 'COMPARE_PICKUPS',
    result,
    token: 2,
  });
  assert.strictEqual(afterStaleCompletion, state);
});

test('ranking uses added duration, walking, interval width, then stable ID', () => {
  const fixtures = createRiderDemoCandidates();
  const makeFeasible = (candidate, extra, walking, width) => {
    const copy = structuredClone(candidate);
    copy.input.rider.accessWalkSeconds = walking;
    copy.input.rider.egressWalkSeconds = 0;
    return {
      candidate: copy,
      route: {},
      routingIssue: null,
      rank: null,
      rankingExplanation: null,
      evaluation: {
        status: 'FEASIBLE',
        metrics: { driverExtraDurationSeconds: extra },
        plan: { feasibleDepartureWindow: { earliest: 100, latest: 100 + width } },
      },
    };
  };
  const a = makeFeasible(fixtures[0], 60, 300, 60);
  const b = makeFeasible(fixtures[1], 120, 0, 600);
  const c = makeFeasible(fixtures[2], 60, 420, 600);
  const d = makeFeasible(fixtures[3], 60, 300, 120);
  const e = makeFeasible(fixtures[4], 60, 300, 60);
  a.candidate.id = 'a';
  e.candidate.id = 'e';

  const ranked = rankRiderDemoCandidates([b, e, d, c, a]);
  const order = [...ranked]
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => entry.candidate.id);
  assert.deepEqual(order, ['rider-drew', 'a', 'e', 'rider-casey', 'rider-blair']);
  assert.match(ranked.find((entry) => entry.candidate.id === 'e').rankingExplanation, /stable candidate ID/i);
});

test('INFEASIBLE and UNKNOWN alternatives never receive ranks', async () => {
  const result = await fixtureEvaluation();
  const ranked = result.candidates.filter((candidate) => candidate.rank !== null);
  assert.deepEqual(ranked.map((candidate) => candidate.candidate.id), ['rider-alex', 'rider-blair']);
  assert.ok(ranked.every((candidate) => candidate.evaluation.status === 'FEASIBLE'));
  assert.ok(
    result.candidates
      .filter((candidate) => candidate.evaluation.status !== 'FEASIBLE')
      .every((candidate) => candidate.rank === null && candidate.rankingExplanation === null),
  );
});

test('partial provider failures stay UNKNOWN while other alternatives finish', async () => {
  const candidates = createRiderDemoCandidates();
  const fixture = createRiderDemoFixtureAdapter(candidates);
  const adapter = {
    route: async (coordinates, options) => {
      if (
        coordinates.length === 3 &&
        coordinates[1].latitude === candidates[1].pickup.latitude &&
        coordinates[1].longitude === candidates[1].pickup.longitude
      ) {
        return {
          status: 'FAILURE',
          code: 'NETWORK_ERROR',
          message: 'synthetic network failure',
          retryable: true,
        };
      }
      if (
        coordinates.length === 3 &&
        coordinates[1].latitude === candidates[2].pickup.latitude &&
        coordinates[1].longitude === candidates[2].pickup.longitude
      ) {
        return {
          status: 'FAILURE',
          code: 'NO_ROUTE',
          message: 'synthetic explicit no-route result',
          retryable: false,
        };
      }
      return fixture.route(coordinates, options);
    },
  };
  const result = await evaluateRiderDemo({ adapter, candidates, mode: 'LIVE_OSRM' });

  assert.equal(byId(result, 'rider-alex').evaluation.status, 'FEASIBLE');
  assert.equal(byId(result, 'rider-blair').evaluation.status, 'UNKNOWN');
  assert.deepEqual(byId(result, 'rider-blair').evaluation.reasonCodes, ['MISSING_TRAVEL_ESTIMATE']);
  assert.equal(byId(result, 'rider-blair').routingIssue.code, 'NETWORK_ERROR');
  assert.equal(byId(result, 'rider-blair').routingIssue.retryable, true);
  assert.equal(byId(result, 'rider-casey').evaluation.status, 'INFEASIBLE');
  assert.deepEqual(byId(result, 'rider-casey').evaluation.reasonCodes, ['NO_ROAD_ROUTE']);
  assert.equal(byId(result, 'rider-casey').routingIssue.code, 'NO_ROUTE');
});

test('excessive pickup snapping becomes unconfirmed instead of drawing a route', async () => {
  const candidates = createRiderDemoCandidates();
  const fixture = createRiderDemoFixtureAdapter(candidates);
  const adapter = {
    route: async (coordinates, options) => {
      const result = await fixture.route(coordinates, options);
      if (result.status === 'SUCCESS' && coordinates.length === 3) {
        result.route.snappedWaypoints[1].distanceMeters = 120;
      }
      return result;
    },
  };
  const result = await evaluateRiderDemo({
    adapter,
    candidates,
    maxSnapMeters: 75,
    mode: 'LIVE_OSRM',
  });
  const alex = byId(result, 'rider-alex');
  assert.equal(alex.evaluation.status, 'UNKNOWN');
  assert.deepEqual(alex.evaluation.reasonCodes, ['LOCATION_UNCONFIRMED']);
  assert.equal(alex.routingIssue.kind, 'SNAP_EXCEEDED');
  assert.equal(alex.route, null);
});

test('superseded evaluations are stale even if an older response resolves last', async () => {
  const latest = new LatestRiderDemoEvaluation();
  const resolvers = [];
  const first = latest.run(() => new Promise((resolve) => resolvers.push(resolve)));
  const second = latest.run(() => new Promise((resolve) => resolvers.push(resolve)));
  const result = await fixtureEvaluation();

  resolvers[1](result);
  assert.equal((await second).status, 'CURRENT');
  resolvers[0](result);
  assert.equal((await first).status, 'STALE');
});

test('routing requests model riders only as independent alternatives', async () => {
  const candidates = createRiderDemoCandidates();
  const fixture = createRiderDemoFixtureAdapter(candidates);
  const requests = [];
  const adapter = {
    route: async (coordinates, options) => {
      requests.push(coordinates.map((coordinate) => ({ ...coordinate })));
      return fixture.route(coordinates, options);
    },
  };
  await evaluateRiderDemo({ adapter, candidates, mode: 'FIXTURE' });

  assert.equal(requests.filter((request) => request.length === 2).length, 1);
  assert.equal(requests.filter((request) => request.length === 3).length, 4);
  assert.ok(requests.every((request) => request.length <= 3));
  assert.ok(
    requests
      .filter((request) => request.length === 3)
      .every(
        (request) =>
          request[0].latitude === riderDemoDriver.start.latitude &&
          request[2].latitude === riderDemoDriver.campus.latitude,
      ),
  );
});

test('live candidate route work respects the configured concurrency bound', async () => {
  const candidates = createRiderDemoCandidates();
  const fixture = createRiderDemoFixtureAdapter(candidates);
  let active = 0;
  let maximumActive = 0;
  const adapter = {
    route: async (coordinates, options) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      const result = await fixture.route(coordinates, options);
      active -= 1;
      return result;
    },
  };

  await evaluateRiderDemo({ adapter, candidates, concurrency: 2, mode: 'LIVE_OSRM' });
  assert.equal(maximumActive, 2);
});
