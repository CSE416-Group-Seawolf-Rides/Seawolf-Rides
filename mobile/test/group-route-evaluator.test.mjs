import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDemo3x7Fixture,
  createDemo3x7TravelEstimate,
} from '../src/matching/demo3x7Fixtures.ts';
import {
  evaluateGroupRoute,
  GROUP_ROUTE_MAX_STOPS,
} from '../src/matching/groupRouteEvaluator.ts';

test('empty car returns its exact solo schedule without inventing pickup stops', () => {
  const fixture = createDemo3x7Fixture({ generationId: 'empty' });
  const jordan = driver(fixture, 'jordan');
  const result = evaluateGroupRoute({
    driver: jordan,
    acceptedMembers: [],
    travel: fixtureTravel(fixture, jordan),
  });
  assert.equal(result.status, 'FEASIBLE');
  assert.deepEqual(result.plan.selectedRequestOrder, []);
  assert.deepEqual(result.plan.pickups, []);
  assert.equal(clock(result.plan.chosenDeparture), '08:00:00');
  assert.equal(clock(result.plan.vehicleCampusArrival), '08:40:00');
  assert.equal(result.plan.metrics.elapsedDurationSeconds, 40 * 60);
  assert.equal(result.plan.metrics.totalAddedDriverDurationSeconds, 0);
});

test('Ava and Ben each fit Jordan alone but their full three-seat group has no feasible schedule', () => {
  const fixture = createDemo3x7Fixture({ generationId: 'ava-ben' });
  const jordan = driver(fixture, 'jordan');
  const travel = fixtureTravel(fixture, jordan);
  const ava = intent(fixture, 'ava');
  const ben = intent(fixture, 'ben');
  assert.equal(evaluateGroupRoute({ driver: jordan, acceptedMembers: [], candidate: candidate(ava), travel }).status, 'FEASIBLE');
  assert.equal(evaluateGroupRoute({ driver: jordan, acceptedMembers: [], candidate: candidate(ben), travel }).status, 'FEASIBLE');

  const together = evaluateGroupRoute({
    driver: jordan,
    acceptedMembers: [promise(ava)],
    candidate: candidate(ben),
    travel,
  });
  assert.equal(together.status, 'INFEASIBLE');
  assert.ok(together.reasonCodes.includes('NO_FEASIBLE_SCHEDULE'));
  assert.equal(together.diagnostics.permittedOrders, 2);
  assert.equal(together.diagnostics.evaluatedOrders, 2);
});

test('Jordan plus Ava and Chloe selects the complete feasible order and exact schedule', () => {
  const fixture = createDemo3x7Fixture({ generationId: 'jordan-ava-chloe' });
  const jordan = driver(fixture, 'jordan');
  const ava = intent(fixture, 'ava');
  const chloe = intent(fixture, 'chloe');
  const result = evaluateGroupRoute({
    driver: jordan,
    acceptedMembers: [promise(ava)],
    candidate: candidate(chloe),
    currentPlanElapsedDurationSeconds: 42 * 60,
    travel: fixtureTravel(fixture, jordan),
  });
  assert.equal(result.status, 'FEASIBLE');
  assert.deepEqual(result.plan.selectedRequestOrder, [requestId(ava), requestId(chloe)]);
  assert.equal(clock(result.plan.chosenDeparture), '08:00:00');
  assert.deepEqual(result.plan.pickups.map((pickup) => clock(pickup.serviceStart)), ['08:10:00', '08:40:00']);
  assert.deepEqual(result.plan.pickups.map((pickup) => clock(pickup.boardingComplete)), ['08:12:00', '08:42:00']);
  assert.equal(clock(result.plan.vehicleCampusArrival), '08:49:00');
  assert.deepEqual(result.plan.pickups.map((pickup) => clock(pickup.destinationArrival)), ['08:54:00', '08:54:00']);
  assert.equal(result.plan.metrics.roadDurationSeconds, 45 * 60);
  assert.equal(result.plan.metrics.serviceDurationSeconds, 4 * 60);
  assert.equal(result.plan.metrics.waitingDurationSeconds, 0);
  assert.equal(result.plan.metrics.elapsedDurationSeconds, 49 * 60);
  assert.equal(result.plan.metrics.totalAddedDriverDurationSeconds, 9 * 60);
  assert.equal(result.plan.metrics.incrementalAddedDriverDurationSeconds, 7 * 60);
});

test('Morgan plus Ben and Chloe fills three seats and reaches campus at 08:49 with total +9', () => {
  const fixture = createDemo3x7Fixture({ generationId: 'morgan-ben-chloe' });
  const morgan = driver(fixture, 'morgan');
  const ben = intent(fixture, 'ben');
  const chloe = intent(fixture, 'chloe');
  const result = evaluateGroupRoute({
    driver: morgan,
    acceptedMembers: [promise(ben)],
    candidate: candidate(chloe),
    travel: fixtureTravel(fixture, morgan),
  });
  assert.equal(result.status, 'FEASIBLE');
  assert.deepEqual(result.plan.selectedRequestOrder, [requestId(ben), requestId(chloe)]);
  assert.equal(clock(result.plan.chosenDeparture), '08:10:00');
  assert.deepEqual(result.plan.pickups.map((pickup) => clock(pickup.serviceStart)), ['08:20:00', '08:40:00']);
  assert.equal(clock(result.plan.vehicleCampusArrival), '08:49:00');
  assert.equal(result.plan.metrics.elapsedDurationSeconds, 39 * 60);
  assert.equal(result.plan.metrics.totalAddedDriverDurationSeconds, 9 * 60);
});

test('Taylor plus co-located Diego applies one service stop and totals +2 minutes', () => {
  const fixture = createDemo3x7Fixture({ generationId: 'taylor-diego' });
  const taylor = driver(fixture, 'taylor');
  const diego = intent(fixture, 'diego');
  const result = evaluateGroupRoute({
    driver: taylor,
    acceptedMembers: [],
    candidate: candidate(diego),
    travel: fixtureTravel(fixture, taylor),
  });
  assert.equal(result.status, 'FEASIBLE');
  assert.equal(clock(result.plan.chosenDeparture), '08:20:00');
  assert.equal(clock(result.plan.pickups[0].physicalArrival), '08:20:00');
  assert.equal(clock(result.plan.pickups[0].boardingComplete), '08:22:00');
  assert.equal(clock(result.plan.vehicleCampusArrival), '08:32:00');
  assert.equal(clock(result.plan.pickups[0].destinationArrival), '08:37:00');
  assert.equal(result.plan.metrics.totalAddedDriverDurationSeconds, 2 * 60);
});

test('a shorter conflicting road order loses to a longer fully feasible order', () => {
  const scenario = customScenario({
    departureWindow: [0, 0], preferredDeparture: 0, campusWindow: [0, 60], solo: 30,
    riders: [
      rider('a', [20, 30]),
      rider('b', [10, 10]),
    ],
    durations: {
      'start>a': 5, 'a>b': 5, 'b>campus': 20,
      'start>b': 10, 'b>a': 15, 'a>campus': 10,
    },
  });
  const result = evaluateGroupRoute(scenario.input);
  assert.equal(result.status, 'FEASIBLE');
  assert.deepEqual(result.plan.selectedRequestOrder, ['request-b', 'request-a']);
  assert.equal(result.plan.metrics.roadDurationSeconds, 35);
  assert.equal(result.plan.metrics.elapsedDurationSeconds, 35);
});

test('waiting can be placed before boarding to preserve an earlier rider ride limit', () => {
  const scenario = customScenario({
    departureWindow: [0, 0], preferredDeparture: 0, campusWindow: [0, 20], solo: 0,
    maxExtraDurationSeconds: 20,
    riders: [
      rider('a', [0, 10], { maxExtraInVehicleSeconds: 0 }),
      rider('b', [10, 10]),
    ],
    durations: {
      'start>a': 0, 'a>b': 0, 'b>campus': 0,
      'start>b': 20, 'b>a': 0, 'a>campus': 0,
    },
    fixedOrder: ['request-a', 'request-b'],
  });
  const result = evaluateGroupRoute(scenario.input);
  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.plan.pickups[0].physicalArrival, 0);
  assert.equal(result.plan.pickups[0].serviceStart, 10);
  assert.equal(result.plan.pickups[0].plannedWaitingSeconds, 10);
  assert.equal(result.plan.pickups[0].inVehicleDurationSeconds, 0);
  assert.equal(result.plan.metrics.waitingDurationSeconds, 10);
});

test('egress deadlines, cumulative total detour, and earlier-passenger ride limits are enforced', () => {
  const egress = customScenario({
    departureWindow: [0, 0], preferredDeparture: 0, campusWindow: [10, 20], solo: 10,
    riders: [rider('a', [0, 0], { egressWalkSeconds: 5, destinationWindow: [0, 14] })],
    durations: { 'start>a': 0, 'a>campus': 10 },
  });
  const egressResult = evaluateGroupRoute(egress.input);
  assert.equal(egressResult.status, 'INFEASIBLE');
  assert.ok(egressResult.reasonCodes.includes('DESTINATION_WINDOW'));

  const detour = customScenario({
    departureWindow: [0, 0], preferredDeparture: 0, campusWindow: [0, 30], solo: 5,
    maxExtraDurationSeconds: 3,
    riders: [rider('a', [0, 10]), rider('b', [0, 20])],
    durations: { 'start>a': 4, 'a>b': 5, 'b>campus': 5, 'start>b': 5, 'b>a': 5, 'a>campus': 4 },
  });
  const detourResult = evaluateGroupRoute(detour.input);
  assert.equal(detourResult.status, 'INFEASIBLE');
  assert.ok(detourResult.reasonCodes.includes('DRIVER_DETOUR_LIMIT'));

  const ride = customScenario({
    departureWindow: [0, 0], preferredDeparture: 0, campusWindow: [0, 30], solo: 5,
    riders: [rider('a', [0, 10], { maxExtraInVehicleSeconds: 1 }), rider('b', [0, 20])],
    durations: { 'start>a': 1, 'a>b': 5, 'b>campus': 5, 'a>campus': 5, 'start>b': 20, 'b>a': 5 },
    fixedOrder: ['request-a', 'request-b'],
  });
  const rideResult = evaluateGroupRoute(ride.input);
  assert.equal(rideResult.status, 'INFEASIBLE');
  assert.ok(rideResult.reasonCodes.includes('RIDER_RIDE_LIMIT'));
});

test('the stricter ratio cap, walking limits, occurrence, and campus promises are enforced', () => {
  const fixture = createDemo3x7Fixture({ generationId: 'hard-constraints' });
  const taylor = driver(fixture, 'taylor');
  const chloe = intent(fixture, 'chloe');
  const ratioResult = evaluateGroupRoute({
    driver: taylor, acceptedMembers: [], candidate: candidate(chloe), travel: fixtureTravel(fixture, taylor),
  });
  assert.equal(ratioResult.status, 'INFEASIBLE');
  assert.ok(ratioResult.reasonCodes.includes('DRIVER_DETOUR_LIMIT'));

  const ava = promise(intent(fixture, 'ava'));
  const walking = evaluateGroupRoute({
    driver: { ...driver(fixture, 'jordan'), passengerCapacity: 3 },
    acceptedMembers: [{ ...ava, accessWalkSeconds: ava.maxAccessWalkSeconds + 1 }],
    travel: fixtureTravel(fixture, driver(fixture, 'jordan')),
  });
  assert.equal(walking.status, 'INFEASIBLE');
  assert.ok(walking.reasonCodes.includes('WALK_LIMIT'));

  const occurrence = evaluateGroupRoute({
    driver: driver(fixture, 'jordan'),
    acceptedMembers: [{ ...ava, occurrence: { ...ava.occurrence, localDate: '2026-10-20' } }],
    travel: fixtureTravel(fixture, driver(fixture, 'jordan')),
  });
  assert.equal(occurrence.status, 'INFEASIBLE');
  assert.ok(occurrence.reasonCodes.includes('OCCURRENCE_MISMATCH'));

  const campus = evaluateGroupRoute({
    driver: driver(fixture, 'jordan'),
    acceptedMembers: [{ ...ava, acceptedCampusDropoff: { ...ava.acceptedCampusDropoff, campusLot: 'lot40' } }],
    travel: fixtureTravel(fixture, driver(fixture, 'jordan')),
  });
  assert.equal(campus.status, 'INFEASIBLE');
  assert.ok(campus.reasonCodes.includes('CAMPUS_MISMATCH'));
});

test('one-second feasible departure intervals and equality boundaries are retained exactly', () => {
  const scenario = customScenario({
    departureWindow: [0, 10], preferredDeparture: 10, campusWindow: [0, 20], solo: 10,
    maxExtraDurationSeconds: 0,
    riders: [rider('a', [6, 7])],
    durations: { 'start>a': 5, 'a>campus': 5 },
  });
  const result = evaluateGroupRoute(scenario.input);
  assert.equal(result.status, 'FEASIBLE');
  assert.deepEqual(result.plan.feasibleDepartureWindow, { earliest: 1, latest: 2 });
  assert.equal(result.plan.chosenDeparture, 2);
  assert.equal(result.plan.vehicleCampusArrival, 12);
  assert.equal(result.plan.metrics.totalAddedDriverDurationSeconds, 0);
});

test('fixed orders and precedence are respected and contradictory precedence is infeasible', () => {
  const base = customScenario({
    departureWindow: [0, 0], preferredDeparture: 0, campusWindow: [0, 30], solo: 5,
    riders: [rider('a', [0, 20]), rider('b', [0, 20])],
    durations: { 'start>a': 1, 'a>b': 1, 'b>campus': 1, 'start>b': 2, 'b>a': 2, 'a>campus': 2 },
    fixedOrder: ['request-b', 'request-a'],
  });
  const fixed = evaluateGroupRoute(base.input);
  assert.equal(fixed.status, 'FEASIBLE');
  assert.deepEqual(fixed.plan.selectedRequestOrder, ['request-b', 'request-a']);
  assert.equal(fixed.diagnostics.permittedOrders, 1);

  const conflict = evaluateGroupRoute({
    ...base.input,
    restrictions: { precedence: [
      { beforeRequestId: 'request-a', afterRequestId: 'request-b' },
      { beforeRequestId: 'request-b', afterRequestId: 'request-a' },
    ] },
  });
  assert.equal(conflict.status, 'INFEASIBLE');
  assert.ok(conflict.reasonCodes.includes('ORDER_RESTRICTION_CONFLICT'));
});

test('missing estimates remain UNKNOWN, unreachable required legs are INFEASIBLE, and direction stays directed', () => {
  const scenario = customScenario({
    departureWindow: [0, 0], preferredDeparture: 0, campusWindow: [0, 20], solo: 3,
    riders: [rider('a', [0, 10])], durations: { 'start>a': 2, 'a>campus': 3 },
  });
  const missing = evaluateGroupRoute({
    ...scenario.input,
    travel: { ...scenario.input.travel, legs: scenario.input.travel.legs.filter((leg) => leg.fromPointId !== 'start') },
  });
  assert.equal(missing.status, 'UNKNOWN');
  assert.ok(missing.reasonCodes.includes('MISSING_TRAVEL_ESTIMATE'));

  const unreachable = evaluateGroupRoute({
    ...scenario.input,
    travel: { ...scenario.input.travel, legs: scenario.input.travel.legs.map((leg) => (
      leg.fromPointId === 'start' && leg.toPointId === 'a'
        ? { ...leg, estimate: { status: 'UNREACHABLE' } }
        : leg
    )) },
  });
  assert.equal(unreachable.status, 'INFEASIBLE');
  assert.ok(unreachable.reasonCodes.includes('NO_ROAD_ROUTE'));

  const directed = customScenario({
    departureWindow: [0, 0], preferredDeparture: 0, campusWindow: [0, 20], solo: 3,
    riders: [rider('a', [0, 10]), rider('b', [0, 10])],
    durations: { 'start>a': 1, 'a>b': 1, 'b>campus': 1, 'start>b': 9, 'b>a': 9, 'a>campus': 1 },
  });
  const directedResult = evaluateGroupRoute(directed.input);
  assert.equal(directedResult.status, 'FEASIBLE');
  assert.deepEqual(directedResult.plan.selectedRequestOrder, ['request-a', 'request-b']);
});

test('Grace, malformed runtime data, invalid fixed orders, and search bounds return UNKNOWN', () => {
  const fixture = createDemo3x7Fixture({ generationId: 'unknowns' });
  const jordan = driver(fixture, 'jordan');
  const grace = intent(fixture, 'grace');
  const graceResult = evaluateGroupRoute({
    driver: jordan,
    acceptedMembers: [],
    candidate: candidate(grace),
    travel: fixtureTravel(fixture, jordan),
  });
  assert.equal(graceResult.status, 'UNKNOWN');
  assert.ok(graceResult.reasonCodes.includes('LOCATION_UNCONFIRMED'));

  const malformed = evaluateGroupRoute({
    driver: { ...jordan, passengerCapacity: Number.NaN },
    acceptedMembers: [],
    travel: fixtureTravel(fixture, jordan),
  });
  assert.equal(malformed.status, 'UNKNOWN');
  assert.ok(malformed.reasonCodes.includes('MALFORMED_INPUT'));

  const malformedCollection = evaluateGroupRoute({
    driver: jordan, acceptedMembers: null, travel: fixtureTravel(fixture, jordan),
  });
  assert.equal(malformedCollection.status, 'UNKNOWN');
  assert.ok(malformedCollection.reasonCodes.includes('MALFORMED_INPUT'));

  const ava = promise(intent(fixture, 'ava'));
  const invalidOrder = evaluateGroupRoute({
    driver: jordan, acceptedMembers: [ava], travel: fixtureTravel(fixture, jordan),
    restrictions: { fixedRequestOrder: ['not-a-member'] },
  });
  assert.equal(invalidOrder.status, 'UNKNOWN');
  assert.ok(invalidOrder.reasonCodes.includes('MALFORMED_INPUT'));

  const tooMany = evaluateGroupRoute({
    driver: { ...jordan, passengerCapacity: 10 },
    acceptedMembers: Array.from({ length: GROUP_ROUTE_MAX_STOPS + 1 }, (_, index) => (
      { ...ava, requestId: `request-${index}`, riderIntentId: `intent-${index}`, riderParticipantId: `person-${index}` }
    )),
    travel: fixtureTravel(fixture, jordan),
  });
  assert.equal(tooMany.status, 'UNKNOWN');
  assert.ok(tooMany.reasonCodes.includes('SEARCH_LIMIT'));

  const maxOrders = evaluateGroupRoute({
    driver: jordan,
    acceptedMembers: [ava, promise(intent(fixture, 'chloe'))],
    travel: fixtureTravel(fixture, jordan),
    maxOrders: 1,
  });
  assert.equal(maxOrders.status, 'UNKNOWN');
  assert.ok(maxOrders.reasonCodes.includes('SEARCH_LIMIT'));

  const zeroBaselineRatio = customScenario({
    departureWindow: [0, 0], preferredDeparture: 0, campusWindow: [0, 10], solo: 0,
    riders: [], durations: {},
  }).input;
  const zeroResult = evaluateGroupRoute({
    ...zeroBaselineRatio,
    driver: { ...zeroBaselineRatio.driver, maxExtraDurationRatio: 0.5 },
  });
  assert.equal(zeroResult.status, 'UNKNOWN');
  assert.ok(zeroResult.reasonCodes.includes('ZERO_BASELINE_PERCENTAGE_LIMIT'));
});

test('a known feasible order remains FEASIBLE but not globally complete when another order lacks estimates', () => {
  const scenario = customScenario({
    departureWindow: [0, 0], preferredDeparture: 0, campusWindow: [0, 20], solo: 5,
    riders: [rider('a', [0, 10]), rider('b', [0, 10])],
    durations: { 'start>a': 1, 'a>b': 1, 'b>campus': 3, 'a>campus': 4, 'start>b': 1 },
  });
  const result = evaluateGroupRoute(scenario.input);
  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.plan.searchComplete, false);
  assert.equal(result.diagnostics.unresolvedOrders, 1);
  assert.deepEqual(result.plan.selectedRequestOrder, ['request-a', 'request-b']);
});

test('bounded generated cases agree with an independent exhaustive waiting oracle', () => {
  const random = lcg(0x5ea2026);
  for (let caseIndex = 0; caseIndex < 60; caseIndex += 1) {
    const count = caseIndex % 3 === 0 ? 1 : 2;
    const riders = Array.from({ length: count }, (_, index) => rider(
      String.fromCharCode(97 + index),
      orderedPair(rand(random, 0, 7), rand(random, 0, 9)),
      {
        serviceSeconds: rand(random, 0, 2),
        egressWalkSeconds: rand(random, 0, 2),
        destinationWindow: orderedPair(rand(random, 2, 10), rand(random, 6, 15)),
        maxExtraInVehicleSeconds: rand(random, 0, 5),
      },
    ));
    const points = ['start', ...riders.map((item) => item.key), 'campus'];
    const durations = coherentDurations(points, random);
    const scenario = customScenario({
      departureWindow: [0, 4], preferredDeparture: 2, campusWindow: [0, 15], solo: durations['start>campus'],
      maxExtraDurationSeconds: 20, riders, durations,
    });
    const expected = exhaustiveOracle(scenario.input);
    const actual = evaluateGroupRoute(scenario.input);
    assert.equal(actual.status === 'FEASIBLE', expected.feasible, `generated case ${caseIndex}`);
    if (actual.status === 'FEASIBLE') {
      assert.equal(actual.plan.metrics.elapsedDurationSeconds, expected.minimumElapsed, `generated case ${caseIndex} elapsed`);
      assertScheduleSatisfiesInput(actual.plan, scenario.input);
    }
  }
});

function fixtureTravel(fixture, selectedDriver) {
  const pointNodes = new Map([[selectedDriver.start.pointId, fixture.nodeByDriverOccurrenceId[selectedDriver.id]], [selectedDriver.campusDropoff.pointId, 'C']]);
  for (const riderIntent of fixture.state.riderIntents) {
    if (riderIntent.pickup.status === 'CONFIRMED') pointNodes.set(riderIntent.pickup.point.pointId, fixture.nodeByRiderIntentId[riderIntent.id]);
  }
  const legs = [];
  for (const [fromPointId, fromNode] of pointNodes) {
    for (const [toPointId, toNode] of pointNodes) {
      if (fromPointId !== toPointId) legs.push({ fromPointId, toPointId, estimate: createDemo3x7TravelEstimate(fromNode, toNode) });
    }
  }
  return {
    solo: createDemo3x7TravelEstimate(fixture.nodeByDriverOccurrenceId[selectedDriver.id], 'C'),
    legs, mode: 'FIXTURE', providerId: 'demo3x7-matrix', evaluatedAtEpochSeconds: 1,
    revision: `fixture-${selectedDriver.id}`,
  };
}

function driver(fixture, key) {
  return fixture.state.driverOccurrences.find((item) => item.id.includes(`-${key}-`));
}

function intent(fixture, key) {
  return fixture.state.riderIntents.find((item) => item.id.includes(`-${key}-`));
}

function requestId(riderIntent) {
  return `request-${riderIntent.id}`;
}

function candidate(riderIntent) {
  return { requestId: requestId(riderIntent), proposalId: `proposal-${riderIntent.id}`, proposalRevision: `proposal-revision-${riderIntent.id}`, intent: riderIntent };
}

function promise(riderIntent) {
  assert.equal(riderIntent.pickup.status, 'CONFIRMED');
  return {
    requestId: requestId(riderIntent), proposalId: `proposal-${riderIntent.id}`, proposalRevision: `proposal-revision-${riderIntent.id}`,
    riderIntentId: riderIntent.id, riderParticipantId: riderIntent.riderParticipantId, occurrence: { ...riderIntent.occurrence },
    requestedSeats: riderIntent.requestedSeats, pickup: { ...riderIntent.pickup.point, coordinate: { ...riderIntent.pickup.point.coordinate } },
    acceptedCampusDropoff: { ...riderIntent.acceptedCampusDropoff, coordinate: { ...riderIntent.acceptedCampusDropoff.coordinate } },
    pickupWindow: { ...riderIntent.pickupWindow }, destinationArrivalWindow: { ...riderIntent.destinationArrivalWindow },
    pickupServiceSeconds: riderIntent.pickupServiceSeconds, accessWalkSeconds: riderIntent.accessWalkSeconds,
    egressWalkSeconds: riderIntent.egressWalkSeconds, maxAccessWalkSeconds: riderIntent.maxAccessWalkSeconds,
    maxEgressWalkSeconds: riderIntent.maxEgressWalkSeconds, maxExtraInVehicleSeconds: riderIntent.maxExtraInVehicleSeconds,
  };
}

function customScenario(options) {
  const campus = point('campus');
  const driver = {
    schema: 'seawolf-rides/driver-occurrence', version: 1, id: 'occurrence', offerId: 'offer',
    driverParticipantId: 'driver', scenarioNamespace: 'test', generationId: 'generation', contractRevision: 'driver-revision',
    occurrence: { localDate: '2026-10-19', direction: 'TO_CAMPUS', timeZone: 'America/New_York' },
    passengerCapacity: 10, start: point('start'), campusDropoff: { ...campus, campusLot: 'tabler' },
    departureWindow: window(options.departureWindow), preferredDeparture: options.preferredDeparture,
    campusArrivalWindow: window(options.campusWindow), maxExtraDurationSeconds: options.maxExtraDurationSeconds ?? 100,
  };
  const acceptedMembers = options.riders.map((item) => customPromise(item, driver, campus));
  const points = ['start', ...options.riders.map((item) => item.key), 'campus'];
  const legs = [];
  for (const from of points) {
    for (const to of points) {
      if (from === to) continue;
      const duration = options.durations[`${from}>${to}`];
      if (duration !== undefined) legs.push({ fromPointId: from, toPointId: to, estimate: available(duration) });
    }
  }
  return {
    input: {
      driver, acceptedMembers,
      restrictions: options.fixedOrder ? { fixedRequestOrder: options.fixedOrder } : undefined,
      travel: { solo: available(options.solo), legs, mode: 'FIXTURE', providerId: 'test', evaluatedAtEpochSeconds: 1, revision: 'test-revision' },
    },
  };
}

function rider(key, pickupWindow, overrides = {}) {
  return {
    key, pickupWindow, serviceSeconds: overrides.serviceSeconds ?? 0,
    egressWalkSeconds: overrides.egressWalkSeconds ?? 0,
    destinationWindow: overrides.destinationWindow ?? [0, 100],
    maxExtraInVehicleSeconds: overrides.maxExtraInVehicleSeconds ?? 100,
  };
}

function customPromise(value, driver, campus) {
  return {
    requestId: `request-${value.key}`, proposalId: `proposal-${value.key}`, proposalRevision: `revision-${value.key}`,
    riderIntentId: `intent-${value.key}`, riderParticipantId: `person-${value.key}`, occurrence: { ...driver.occurrence },
    requestedSeats: 1, pickup: point(value.key), acceptedCampusDropoff: { ...campus, campusLot: 'tabler' },
    pickupWindow: window(value.pickupWindow), destinationArrivalWindow: window(value.destinationWindow),
    pickupServiceSeconds: value.serviceSeconds, accessWalkSeconds: 0, egressWalkSeconds: value.egressWalkSeconds,
    maxAccessWalkSeconds: 0, maxEgressWalkSeconds: value.egressWalkSeconds,
    maxExtraInVehicleSeconds: value.maxExtraInVehicleSeconds,
  };
}

function point(pointId) {
  const index = [...pointId].reduce((total, char) => total + char.charCodeAt(0), 0);
  return { pointId, label: pointId, coordinate: { latitude: 40 + index / 100000, longitude: -73 }, accuracy: 'SELECTED_POINT' };
}

function available(durationSeconds) {
  return { status: 'AVAILABLE', durationSeconds, distanceMeters: durationSeconds * 10 };
}

function window(pair) {
  return { earliest: pair[0], latest: pair[1] };
}

function clock(epochSeconds) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(epochSeconds * 1000));
}

function exhaustiveOracle(input) {
  const leg = new Map(input.travel.legs.filter((item) => item.estimate.status === 'AVAILABLE').map((item) => [`${item.fromPointId}>${item.toPointId}`, item.estimate.durationSeconds]));
  let best = Number.POSITIVE_INFINITY;
  for (const order of permutations(input.acceptedMembers)) {
    for (let departure = input.driver.departureWindow.earliest; departure <= input.driver.departureWindow.latest; departure += 1) {
      visit(0, departure, []);
      function visit(index, previousBoarding, starts) {
        if (index === order.length) {
          const lastPoint = order.length === 0 ? input.driver.start.pointId : order[order.length - 1].pickup.pointId;
          const finalLeg = order.length === 0 ? input.travel.solo.durationSeconds : leg.get(`${lastPoint}>${input.driver.campusDropoff.pointId}`);
          if (finalLeg === undefined) return;
          const campus = previousBoarding + finalLeg;
          const elapsed = campus - departure;
          if (campus < input.driver.campusArrivalWindow.earliest || campus > input.driver.campusArrivalWindow.latest) return;
          if (elapsed > input.travel.solo.durationSeconds + input.driver.maxExtraDurationSeconds) return;
          for (let riderIndex = 0; riderIndex < order.length; riderIndex += 1) {
            const member = order[riderIndex];
            const destination = campus + member.egressWalkSeconds;
            if (destination < member.destinationArrivalWindow.earliest || destination > member.destinationArrivalWindow.latest) return;
            const direct = member.pickup.pointId === input.driver.campusDropoff.pointId ? 0 : leg.get(`${member.pickup.pointId}>${input.driver.campusDropoff.pointId}`);
            if (direct === undefined || campus - (starts[riderIndex] + member.pickupServiceSeconds) > direct + member.maxExtraInVehicleSeconds) return;
          }
          best = Math.min(best, elapsed);
          return;
        }
        const member = order[index];
        const previousPoint = index === 0 ? input.driver.start.pointId : order[index - 1].pickup.pointId;
        const travel = previousPoint === member.pickup.pointId ? 0 : leg.get(`${previousPoint}>${member.pickup.pointId}`);
        if (travel === undefined) return;
        const arrival = previousBoarding + travel;
        for (let serviceStart = Math.max(arrival, member.pickupWindow.earliest); serviceStart <= member.pickupWindow.latest; serviceStart += 1) {
          visit(index + 1, serviceStart + member.pickupServiceSeconds, [...starts, serviceStart]);
        }
      }
    }
  }
  return { feasible: Number.isFinite(best), minimumElapsed: best };
}

function assertScheduleSatisfiesInput(plan, input) {
  assert.ok(plan.chosenDeparture >= input.driver.departureWindow.earliest && plan.chosenDeparture <= input.driver.departureWindow.latest);
  assert.ok(plan.vehicleCampusArrival >= input.driver.campusArrivalWindow.earliest && plan.vehicleCampusArrival <= input.driver.campusArrivalWindow.latest);
  for (const pickup of plan.pickups) {
    const member = input.acceptedMembers.find((item) => item.requestId === pickup.requestId);
    assert.ok(pickup.serviceStart >= member.pickupWindow.earliest && pickup.serviceStart <= member.pickupWindow.latest);
    assert.ok(pickup.destinationArrival >= member.destinationArrivalWindow.earliest && pickup.destinationArrival <= member.destinationArrivalWindow.latest);
    assert.ok(pickup.extraInVehicleDurationSeconds <= member.maxExtraInVehicleSeconds);
  }
}

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [value, ...rest]));
}

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function rand(random, minimum, maximum) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function orderedPair(left, right) {
  return left <= right ? [left, right] : [right, left];
}

function coherentDurations(points, random) {
  const matrix = points.map((_, from) => points.map((__, to) => from === to ? 0 : rand(random, 1, 4)));
  for (let via = 0; via < points.length; via += 1) {
    for (let from = 0; from < points.length; from += 1) {
      for (let to = 0; to < points.length; to += 1) {
        matrix[from][to] = Math.min(matrix[from][to], matrix[from][via] + matrix[via][to]);
      }
    }
  }
  return Object.fromEntries(points.flatMap((from, fromIndex) => points.flatMap((to, toIndex) => (
    from === to ? [] : [[`${from}>${to}`, matrix[fromIndex][toIndex]]]
  ))));
}
