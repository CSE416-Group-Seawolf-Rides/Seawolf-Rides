import {
  createWorkedExampleInput,
  missingStaticRoute,
  unreachableStaticRoute,
  workedExampleEpochSeconds,
  WORKED_EXAMPLE_TIME_ZONE,
  WORKED_EXAMPLE_TIME_ZONE_LABEL,
} from './fixtureTravel';
import type { PairEvaluationInput } from './types';

export type MatchingDemoScenarioId =
  | 'feasible'
  | 'detour-limit'
  | 'windows'
  | 'egress-walk'
  | 'no-seats'
  | 'approximate-location'
  | 'missing-route'
  | 'unreachable-route';

export interface MatchingDemoScenario {
  id: MatchingDemoScenarioId;
  title: string;
  description: string;
  timeZone: string;
  timeZoneLabel: string;
  input: PairEvaluationInput;
}

export function createMatchingDemoScenarios(): MatchingDemoScenario[] {
  const feasible = createWorkedExampleInput();

  const detourLimit = createWorkedExampleInput();
  detourLimit.driver.maxExtraDurationSeconds = 6 * 60;

  const windows = createWorkedExampleInput();
  windows.rider.egressWalkSeconds = 0;
  windows.rider.pickupWindow = {
    earliest: workedExampleEpochSeconds(8, 24),
    latest: workedExampleEpochSeconds(8, 25),
  };

  const egressWalk = createWorkedExampleInput();
  egressWalk.rider.destinationArrivalWindow.latest = workedExampleEpochSeconds(8, 40);

  const noSeats = createWorkedExampleInput();
  noSeats.driver.seatsRemaining = 0;

  const approximateLocation = createWorkedExampleInput();
  approximateLocation.anchors.riderPickup.accuracy = 'APPROXIMATE_AREA';

  const missingRoute = createWorkedExampleInput();
  missingRoute.travel.startToPickup = missingStaticRoute;

  const unreachableRoute = createWorkedExampleInput();
  unreachableRoute.travel.startToPickup = unreachableStaticRoute;

  const shared = {
    timeZone: WORKED_EXAMPLE_TIME_ZONE,
    timeZoneLabel: WORKED_EXAMPLE_TIME_ZONE_LABEL,
  };

  return [
    {
      ...shared,
      id: 'feasible',
      title: 'Feasible match',
      description: 'The matching research plan’s worked example.',
      input: feasible,
    },
    {
      ...shared,
      id: 'detour-limit',
      title: 'Driver detour exceeds the limit',
      description: 'The seven-minute detour is above the six-minute absolute cap.',
      input: detourLimit,
    },
    {
      ...shared,
      id: 'windows',
      title: 'Pickup and arrival windows cannot fit',
      description: 'A late pickup window conflicts with the campus arrival window.',
      input: windows,
    },
    {
      ...shared,
      id: 'egress-walk',
      title: 'Egress walk misses the deadline',
      description: 'The campus walk pushes destination arrival past the rider’s deadline.',
      input: egressWalk,
    },
    {
      ...shared,
      id: 'no-seats',
      title: 'No remaining passenger seats',
      description: 'The driver has no capacity for the rider’s one-seat request.',
      input: noSeats,
    },
    {
      ...shared,
      id: 'approximate-location',
      title: 'Approximate pickup location',
      description: 'An approximate area cannot support a precise schedule.',
      input: approximateLocation,
    },
    {
      ...shared,
      id: 'missing-route',
      title: 'Missing route estimate',
      description: 'The S → P travel estimate was not supplied.',
      input: missingRoute,
    },
    {
      ...shared,
      id: 'unreachable-route',
      title: 'Explicitly unreachable road route',
      description: 'The fixture explicitly says no S → P road route exists.',
      input: unreachableRoute,
    },
  ];
}
