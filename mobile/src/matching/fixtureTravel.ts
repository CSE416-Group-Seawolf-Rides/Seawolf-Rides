import type { PairTravelEstimates, StaticRouteEstimate } from './types';

export function availableStaticRoute(
  durationSeconds: number,
  distanceMeters: number,
): StaticRouteEstimate {
  return { status: 'AVAILABLE', durationSeconds, distanceMeters };
}

export const missingStaticRoute: StaticRouteEstimate = { status: 'MISSING' };
export const unreachableStaticRoute: StaticRouteEstimate = { status: 'UNREACHABLE' };

/** Deterministic travel data for the worked example in the matching plan. */
export const workedExampleTravelEstimates: PairTravelEstimates = {
  startToPickup: availableStaticRoute(10 * 60, 6_000),
  pickupToCampus: availableStaticRoute(25 * 60, 18_000),
  startToCampus: availableStaticRoute(30 * 60, 21_000),
};
