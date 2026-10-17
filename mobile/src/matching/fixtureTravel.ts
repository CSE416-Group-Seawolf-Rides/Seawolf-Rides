import type { PairEvaluationInput, PairTravelEstimates, StaticRouteEstimate } from './types';

export const WORKED_EXAMPLE_LOCAL_DATE = '2026-10-12';
export const WORKED_EXAMPLE_TIME_ZONE = 'America/New_York';
export const WORKED_EXAMPLE_TIME_ZONE_LABEL =
  'America/New_York (UTC−04:00 on October 12, 2026)';

/** Converts a wall-clock time on the fixed demo date using its explicit EDT offset. */
export function workedExampleEpochSeconds(hour: number, minute: number): number {
  const hours = String(hour).padStart(2, '0');
  const minutes = String(minute).padStart(2, '0');
  return Date.parse(`${WORKED_EXAMPLE_LOCAL_DATE}T${hours}:${minutes}:00-04:00`) / 1000;
}

export function availableStaticRoute(
  durationSeconds: number,
  distanceMeters: number,
): StaticRouteEstimate {
  return { status: 'AVAILABLE', durationSeconds, distanceMeters };
}

export const missingStaticRoute: StaticRouteEstimate = { status: 'MISSING' };
export const unreachableStaticRoute: StaticRouteEstimate = { status: 'UNREACHABLE' };

/** Deterministic travel data for the worked example in the matching plan. */
export function createWorkedExampleTravelEstimates(): PairTravelEstimates {
  return {
    startToPickup: availableStaticRoute(10 * 60, 6_000),
    pickupToCampus: availableStaticRoute(25 * 60, 18_000),
    startToCampus: availableStaticRoute(30 * 60, 21_000),
  };
}

export const workedExampleTravelEstimates = createWorkedExampleTravelEstimates();

/** Returns a fresh input so callers can safely derive independent scenarios. */
export function createWorkedExampleInput(): PairEvaluationInput {
  return {
    driver: {
      userId: 'demo-driver',
      occurrence: { localDate: WORKED_EXAMPLE_LOCAL_DATE, direction: 'TO_CAMPUS' },
      departureWindow: {
        earliest: workedExampleEpochSeconds(8, 0),
        latest: workedExampleEpochSeconds(8, 15),
      },
      campusArrivalWindow: {
        earliest: workedExampleEpochSeconds(8, 35),
        latest: workedExampleEpochSeconds(8, 50),
      },
      preferredDeparture: workedExampleEpochSeconds(8, 3),
      seatsRemaining: 2,
      maxExtraDurationSeconds: 10 * 60,
      maxExtraDurationRatio: 0.3,
    },
    rider: {
      userId: 'demo-rider',
      occurrence: { localDate: WORKED_EXAMPLE_LOCAL_DATE, direction: 'TO_CAMPUS' },
      pickupWindow: {
        earliest: workedExampleEpochSeconds(8, 12),
        latest: workedExampleEpochSeconds(8, 25),
      },
      destinationArrivalWindow: {
        earliest: workedExampleEpochSeconds(8, 30),
        latest: workedExampleEpochSeconds(8, 45),
      },
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
    travel: createWorkedExampleTravelEstimates(),
  };
}
