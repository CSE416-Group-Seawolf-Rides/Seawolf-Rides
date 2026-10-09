import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluatePair } from '../src/matching/evaluatePair.ts';
import {
  availableStaticRoute,
  missingStaticRoute,
  unreachableStaticRoute,
  workedExampleTravelEstimates,
} from '../src/matching/fixtureTravel.ts';

const at = (localTime) => Date.parse(`2026-10-12T${localTime}:00-04:00`) / 1000;

function baseInput() {
  return {
    driver: {
      userId: 'driver-1',
      occurrence: { localDate: '2026-10-12', direction: 'TO_CAMPUS' },
      departureWindow: { earliest: at('08:00'), latest: at('08:15') },
      campusArrivalWindow: { earliest: at('08:35'), latest: at('08:50') },
      preferredDeparture: at('08:03'),
      seatsRemaining: 2,
      maxExtraDurationSeconds: 10 * 60,
      maxExtraDurationRatio: 0.3,
    },
    rider: {
      userId: 'rider-1',
      occurrence: { localDate: '2026-10-12', direction: 'TO_CAMPUS' },
      pickupWindow: { earliest: at('08:12'), latest: at('08:25') },
      destinationArrivalWindow: { earliest: at('08:30'), latest: at('08:45') },
      seatsRequested: 1,
      accessWalkSeconds: 4 * 60,
      egressWalkSeconds: 5 * 60,
      maxAccessWalkSeconds: 8 * 60,
      maxEgressWalkSeconds: 8 * 60,
      maxExtraInVehicleSeconds: 5 * 60,
    },
    anchors: {
      driverStart: {
        coordinate: { latitude: 40.8687, longitude: -73.0773 },
        accuracy: 'SELECTED_POINT',
      },
      riderPickup: {
        coordinate: { latitude: 40.879, longitude: -73.09 },
        accuracy: 'SELECTED_POINT',
      },
      campusDropoff: {
        coordinate: { latitude: 40.9097, longitude: -73.127 },
        accuracy: 'SELECTED_POINT',
      },
    },
    facts: {
      driverSkipped: false,
      riderSkipped: false,
      driverRoleConflict: false,
      riderRoleConflict: false,
      driverCommitmentConflict: false,
      riderCommitmentConflict: false,
    },
    pickupServiceSeconds: 2 * 60,
    travel: structuredClone(workedExampleTravelEstimates),
  };
}

test('evaluates the matching-plan worked example with an exact schedule', () => {
  const result = evaluatePair(baseInput());

  assert.equal(result.status, 'FEASIBLE');
  assert.deepEqual(result.plan.feasibleDepartureWindow, {
    earliest: at('08:02'),
    latest: at('08:03'),
  });
  assert.equal(result.plan.departure, at('08:03'));
  assert.equal(result.plan.pickup, at('08:13'));
  assert.equal(result.plan.boardingComplete, at('08:15'));
  assert.equal(result.plan.vehicleCampusArrival, at('08:40'));
  assert.equal(result.plan.riderDestinationArrival, at('08:45'));
  assert.equal(result.metrics.soloDurationSeconds, 30 * 60);
  assert.equal(result.metrics.sharedDurationSeconds, 37 * 60);
  assert.equal(result.metrics.driverExtraDurationSeconds, 7 * 60);
  assert.equal(result.metrics.activeDriverDetourLimitSeconds, 9 * 60);
  assert.equal(result.metrics.riderInVehicleSeconds, 25 * 60);
  assert.equal(result.metrics.riderExtraInVehicleSeconds, 0);
});

test('rejects incompatible windows even when the clock times are close', () => {
  const input = baseInput();
  input.rider.destinationArrivalWindow = {
    earliest: at('08:30'),
    latest: at('08:39'),
  };

  assert.deepEqual(evaluatePair(input), {
    status: 'INFEASIBLE',
    reasonCodes: ['NO_FEASIBLE_DEPARTURE'],
  });
});

test('includes egress walking in arrival feasibility without adding access walking twice', () => {
  const withoutWalk = baseInput();
  withoutWalk.rider.egressWalkSeconds = 0;
  withoutWalk.rider.destinationArrivalWindow.latest = at('08:40');
  assert.equal(evaluatePair(withoutWalk).status, 'FEASIBLE');

  const withWalk = structuredClone(withoutWalk);
  withWalk.rider.egressWalkSeconds = 5 * 60;
  assert.deepEqual(evaluatePair(withWalk), {
    status: 'INFEASIBLE',
    reasonCodes: ['NO_FEASIBLE_DEPARTURE'],
  });

  const longAccessWalk = baseInput();
  longAccessWalk.rider.accessWalkSeconds = longAccessWalk.rider.maxAccessWalkSeconds;
  assert.equal(evaluatePair(longAccessWalk).status, 'FEASIBLE');
});

test('rejects walking durations that exceed their explicit limits', () => {
  const input = baseInput();
  input.rider.accessWalkSeconds = input.rider.maxAccessWalkSeconds + 1;

  assert.deepEqual(evaluatePair(input), {
    status: 'INFEASIBLE',
    reasonCodes: ['WALK_LIMIT'],
  });
});

test('pickup service time can make an otherwise feasible schedule fail', () => {
  const withoutService = baseInput();
  withoutService.pickupServiceSeconds = 0;
  withoutService.driver.departureWindow = {
    earliest: at('08:03'),
    latest: at('08:03'),
  };
  withoutService.driver.campusArrivalWindow = {
    earliest: at('08:30'),
    latest: at('08:39'),
  };
  withoutService.rider.destinationArrivalWindow.latest = at('08:50');
  assert.equal(evaluatePair(withoutService).status, 'FEASIBLE');

  const withService = structuredClone(withoutService);
  withService.pickupServiceSeconds = 2 * 60;
  assert.deepEqual(evaluatePair(withService), {
    status: 'INFEASIBLE',
    reasonCodes: ['NO_FEASIBLE_DEPARTURE'],
  });
});

test('enforces the stricter absolute or percentage driver detour limit', async (t) => {
  await t.test('absolute limit', () => {
    const input = baseInput();
    input.driver.maxExtraDurationSeconds = 6 * 60;
    delete input.driver.maxExtraDurationRatio;
    assert.deepEqual(evaluatePair(input), {
      status: 'INFEASIBLE',
      reasonCodes: ['DRIVER_DETOUR_LIMIT'],
    });
  });

  await t.test('percentage limit', () => {
    const input = baseInput();
    input.driver.maxExtraDurationRatio = 0.2;
    assert.deepEqual(evaluatePair(input), {
      status: 'INFEASIBLE',
      reasonCodes: ['DRIVER_DETOUR_LIMIT'],
    });
  });
});

test('rejects zero remaining seats and requests larger than remaining capacity', async (t) => {
  await t.test('zero remaining', () => {
    const input = baseInput();
    input.driver.seatsRemaining = 0;
    assert.deepEqual(evaluatePair(input), {
      status: 'INFEASIBLE',
      reasonCodes: ['NO_SEAT'],
    });
  });

  await t.test('multiple seats requested', () => {
    const input = baseInput();
    input.driver.seatsRemaining = 1;
    input.rider.seatsRequested = 2;
    assert.deepEqual(evaluatePair(input), {
      status: 'INFEASIBLE',
      reasonCodes: ['NO_SEAT'],
    });
  });
});

test('rejects self-matches, occurrence mismatches, skips, and conflicts', async (t) => {
  const cases = [
    ['self match', (input) => (input.rider.userId = input.driver.userId), 'SELF_MATCH'],
    [
      'occurrence mismatch',
      (input) => (input.rider.occurrence.localDate = '2026-10-13'),
      'OCCURRENCE_MISMATCH',
    ],
    ['driver skip', (input) => (input.facts.driverSkipped = true), 'SKIPPED_OCCURRENCE'],
    ['rider skip', (input) => (input.facts.riderSkipped = true), 'SKIPPED_OCCURRENCE'],
    ['role conflict', (input) => (input.facts.riderRoleConflict = true), 'ROLE_CONFLICT'],
    [
      'commitment conflict',
      (input) => (input.facts.driverCommitmentConflict = true),
      'COMMITMENT_CONFLICT',
    ],
  ];

  for (const [name, change, reason] of cases) {
    await t.test(name, () => {
      const input = baseInput();
      change(input);
      assert.deepEqual(evaluatePair(input), {
        status: 'INFEASIBLE',
        reasonCodes: [reason],
      });
    });
  }
});

test('returns unknown when any routing anchor is only approximate', () => {
  const input = baseInput();
  input.anchors.riderPickup.accuracy = 'APPROXIMATE_AREA';

  assert.deepEqual(evaluatePair(input), {
    status: 'UNKNOWN',
    reasonCodes: ['LOCATION_UNCONFIRMED'],
  });
});

test('distinguishes missing estimates from an explicitly unreachable route', () => {
  const missing = baseInput();
  missing.travel.startToPickup = missingStaticRoute;
  assert.deepEqual(evaluatePair(missing), {
    status: 'UNKNOWN',
    reasonCodes: ['MISSING_TRAVEL_ESTIMATE'],
  });

  const omitted = baseInput();
  delete omitted.travel.startToPickup;
  assert.deepEqual(evaluatePair(omitted), {
    status: 'UNKNOWN',
    reasonCodes: ['MISSING_TRAVEL_ESTIMATE'],
  });

  const unreachable = baseInput();
  unreachable.travel.startToPickup = unreachableStaticRoute;
  assert.deepEqual(evaluatePair(unreachable), {
    status: 'INFEASIBLE',
    reasonCodes: ['NO_ROAD_ROUTE'],
  });
});

test('returns structured unknown results for malformed inputs', async (t) => {
  const cases = [
    [
      'inverted window',
      (input) => (input.driver.departureWindow = { earliest: at('08:15'), latest: at('08:00') }),
      'MALFORMED_WINDOW',
    ],
    [
      'invalid coordinate',
      (input) => (input.anchors.driverStart.coordinate.latitude = 100),
      'MALFORMED_COORDINATE',
    ],
    ['negative seat request', (input) => (input.rider.seatsRequested = -1), 'MALFORMED_SEAT_COUNT'],
    ['negative walk', (input) => (input.rider.egressWalkSeconds = -1), 'MALFORMED_DURATION'],
    ['invalid ratio', (input) => (input.driver.maxExtraDurationRatio = Number.NaN), 'MALFORMED_LIMIT'],
    ['negative absolute limit', (input) => (input.driver.maxExtraDurationSeconds = -1), 'MALFORMED_LIMIT'],
    [
      'invalid route duration',
      (input) => (input.travel.startToPickup = availableStaticRoute(Number.NaN, 100)),
      'MALFORMED_TRAVEL_ESTIMATE',
    ],
  ];

  for (const [name, change, reason] of cases) {
    await t.test(name, () => {
      const input = baseInput();
      change(input);
      assert.deepEqual(evaluatePair(input), {
        status: 'UNKNOWN',
        reasonCodes: [reason],
      });
    });
  }
});

test('uses an explicit zero-baseline policy for percentage limits', () => {
  const withRatio = baseInput();
  withRatio.travel = {
    startToPickup: availableStaticRoute(0, 0),
    pickupToCampus: availableStaticRoute(0, 0),
    startToCampus: availableStaticRoute(0, 0),
  };
  withRatio.pickupServiceSeconds = 0;
  withRatio.driver.campusArrivalWindow = {
    earliest: at('08:00'),
    latest: at('08:15'),
  };
  withRatio.rider.pickupWindow = {
    earliest: at('08:00'),
    latest: at('08:15'),
  };
  withRatio.rider.destinationArrivalWindow = {
    earliest: at('08:05'),
    latest: at('08:20'),
  };
  assert.deepEqual(evaluatePair(withRatio), {
    status: 'UNKNOWN',
    reasonCodes: ['ZERO_BASELINE_PERCENTAGE_LIMIT'],
  });

  const absoluteOnly = structuredClone(withRatio);
  delete absoluteOnly.driver.maxExtraDurationRatio;
  assert.equal(evaluatePair(absoluteOnly).status, 'FEASIBLE');
});

test('accepts boundary equality and deterministically clamps the preferred departure', () => {
  const input = baseInput();
  input.rider.destinationArrivalWindow.latest = at('08:44');
  input.driver.preferredDeparture = at('08:15');

  const result = evaluatePair(input);
  assert.equal(result.status, 'FEASIBLE');
  assert.deepEqual(result.plan.feasibleDepartureWindow, {
    earliest: at('08:02'),
    latest: at('08:02'),
  });
  assert.equal(result.plan.departure, at('08:02'));
  assert.equal(result.plan.riderDestinationArrival, at('08:44'));
});

test('returns unknown for the unsupported return direction', () => {
  const input = baseInput();
  input.driver.occurrence.direction = 'FROM_CAMPUS';
  input.rider.occurrence.direction = 'FROM_CAMPUS';

  assert.deepEqual(evaluatePair(input), {
    status: 'UNKNOWN',
    reasonCodes: ['UNSUPPORTED_DIRECTION'],
  });
});
