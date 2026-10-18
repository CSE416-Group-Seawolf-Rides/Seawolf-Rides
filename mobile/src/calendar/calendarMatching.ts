import { evaluatePair } from '../matching/evaluatePair';
import type { PairEvaluation, StaticRouteEstimate } from '../matching/types';
import type {
  CommuteSchedule,
  DaySchedule,
  PrivacyArea,
} from '../commute/commuteModel';
import type { RoutingAdapter, RoutingResult } from '../routing/types';
import {
  CAMPUS_POINTS,
  localMinuteToEpoch,
  PICKUP_SERVICE_SECONDS,
} from '../mvp/settings';
import {
  ARRIVAL_FLEX_MINUTES,
  preferredArrivalWindow,
} from '../commute/arrivalPolicy';

export interface CalendarParticipant {
  uid: string;
  name: string;
  revision: string;
  commute: CommuteSchedule;
  day: DaySchedule;
}
export interface CalendarMatch {
  driverId: string;
  riderId: string;
  driverRevision: string;
  riderRevision: string;
  name: string;
  role: 'driver' | 'rider';
  area: PrivacyArea;
  plan: Extract<PairEvaluation, { status: 'FEASIBLE' }>['plan'];
  addedDrivingSeconds: number;
  /** Absolute difference between this proposed arrival and the searching user's target. */
  arrivalDifferenceSeconds: number;
  metrics: Extract<PairEvaluation, { status: 'FEASIBLE' }>['metrics'];
}
export interface CalendarSearchResult {
  policyVersion: 2;
  searchRevision: string;
  totalCandidatePlans: number;
  checkedCandidatePlans: number;
  nextCursor: string | null;
  matches: CalendarMatch[];
  incomplete: boolean;
  unknownCount: number;
  incompatibleCount: number;
}
export function arrivalTargetsOverlap(
  a: number | null,
  b: number | null,
): boolean {
  return (
    a !== null &&
    b !== null &&
    Number.isInteger(a) &&
    Number.isInteger(b) &&
    a >= 0 &&
    b >= 0 &&
    a < 1440 &&
    b < 1440 &&
    Math.abs(a - b) <= ARRIVAL_FLEX_MINUTES
  );
}
export function compareCalendarMatches(
  a: CalendarMatch,
  b: CalendarMatch,
): number {
  return (
    a.arrivalDifferenceSeconds - b.arrivalDifferenceSeconds ||
    a.addedDrivingSeconds - b.addedDrivingSeconds ||
    (a.driverId < b.driverId ? -1 : a.driverId > b.driverId ? 1 : 0) ||
    (a.riderId < b.riderId ? -1 : a.riderId > b.riderId ? 1 : 0)
  );
}
export function mergeCalendarPages(
  previous: CalendarSearchResult,
  next: CalendarSearchResult,
): CalendarSearchResult {
  if (previous.searchRevision !== next.searchRevision)
    throw new Error('The candidate list changed. Search again.');
  const matches = new Map(
    previous.matches.map((m) => [`${m.driverId}:${m.riderId}`, m]),
  );
  next.matches.forEach((m) => matches.set(`${m.driverId}:${m.riderId}`, m));
  return {
    ...next,
    matches: [...matches.values()].sort(compareCalendarMatches),
    unknownCount: previous.unknownCount + next.unknownCount,
    incompatibleCount: previous.incompatibleCount + next.incompatibleCount,
  };
}
function routeEstimate(
  result: RoutingResult,
  index?: number,
): StaticRouteEstimate {
  if (result.status === 'FAILURE')
    return { status: result.code === 'NO_ROUTE' ? 'UNREACHABLE' : 'MISSING' };
  const route = index === undefined ? result.route : result.route.legs[index];
  return route
    ? {
        status: 'AVAILABLE',
        durationSeconds: Math.round(route.durationSeconds),
        distanceMeters: Math.round(route.distanceMeters),
      }
    : { status: 'MISSING' };
}
/** Proposed timing only: no claim that participants are ready before they agree.
 * The saved driver departure is fixed, while the rider can be picked up from
 * their saved ready-from time. Both preferred arrivals allow ±30 minutes, subject
 * to the same date and any saved return time. No user detour/walking
 * preferences are invented.
 */
export async function evaluateCalendarPair(
  driver: CalendarParticipant,
  rider: CalendarParticipant,
  date: string,
  routing: RoutingAdapter,
  now: number,
): Promise<PairEvaluation> {
  if (driver.uid === rider.uid)
    return { status: 'INFEASIBLE', reasonCodes: ['SELF_MATCH'] };
  if (
    !['drive', 'either'].includes(driver.day.mode) ||
    !['ride', 'either'].includes(rider.day.mode)
  )
    return { status: 'INFEASIBLE', reasonCodes: ['ROLE_CONFLICT'] };
  const d = driver.commute,
    r = rider.commute;
  if (!d.discoveryEnabled || !r.discoveryEnabled)
    return { status: 'INFEASIBLE', reasonCodes: ['SKIPPED_OCCURRENCE'] };
  if (!(d.seats ?? 0))
    return { status: 'INFEASIBLE', reasonCodes: ['NO_SEAT'] };
  const campus = CAMPUS_POINTS.find((p) => p.id === d.campusLot);
  if (!d.startPoint || !r.startPoint || !campus || d.campusLot !== r.campusLot)
    return { status: 'UNKNOWN', reasonCodes: ['LOCATION_UNCONFIRMED'] };
  if (driver.day.arriveBy === null || rider.day.arriveBy === null)
    return { status: 'INFEASIBLE', reasonCodes: ['SKIPPED_OCCURRENCE'] };
  if (driver.day.startAt == null || rider.day.startAt == null)
    return { status: 'UNKNOWN', reasonCodes: ['MISSING_START_TIME'] };
  if (
    !Number.isFinite(now) ||
    ![
      driver.day.arriveBy,
      rider.day.arriveBy,
      driver.day.startAt,
      rider.day.startAt,
    ].every((v) => Number.isInteger(v) && v >= 0 && v < 1440)
  )
    return { status: 'UNKNOWN', reasonCodes: ['MALFORMED_WINDOW'] };
  if (!arrivalTargetsOverlap(driver.day.arriveBy, rider.day.arriveBy))
    return {
      status: 'INFEASIBLE',
      reasonCodes: ['ARRIVAL_PREFERENCE_MISMATCH'],
    };
  const earliest = Math.max(now + 1, localMinuteToEpoch(date, 0));
  const driverStart = localMinuteToEpoch(date, driver.day.startAt);
  const riderStart = Math.max(
    earliest,
    localMinuteToEpoch(date, rider.day.startAt),
  );
  const driverArrival = preferredArrivalWindow(
    date,
    { ...driver.day, arriveBy: driver.day.arriveBy },
    earliest,
  );
  const riderArrival = preferredArrivalWindow(
    date,
    { ...rider.day, arriveBy: rider.day.arriveBy },
    earliest,
  );
  const driverDeadline = driverArrival.latest;
  const riderDeadline = riderArrival.latest;
  if (
    driverStart < earliest ||
    driverStart >= driverDeadline ||
    riderStart >= riderDeadline
  )
    return { status: 'INFEASIBLE', reasonCodes: ['NO_FEASIBLE_DEPARTURE'] };
  const safeRoute = async (
    points: Parameters<RoutingAdapter['route']>[0],
  ): Promise<RoutingResult> => {
    try {
      const result = await routing.route(points);
      if (
        result.status === 'SUCCESS' &&
        (result.route.legs.length !== points.length - 1 ||
          result.route.snappedWaypoints.length !== points.length ||
          result.route.snappedWaypoints.some(
            (p, i) =>
              p.input.latitude !== points[i].latitude ||
              p.input.longitude !== points[i].longitude ||
              !Number.isFinite(p.distanceMeters) ||
              p.distanceMeters < 0 ||
              p.distanceMeters > 75,
          ))
      )
        return {
          status: 'FAILURE',
          code: 'PROVIDER_ERROR',
          message: 'Unconfirmed routing anchors',
          retryable: true,
        };
      return result;
    } catch {
      return {
        status: 'FAILURE',
        code: 'PROVIDER_ERROR',
        message: 'Routing unavailable',
        retryable: true,
      };
    }
  };
  const [baseline, shared] = await Promise.all([
    safeRoute([d.startPoint, campus.coordinate]),
    safeRoute([d.startPoint, r.startPoint, campus.coordinate]),
  ]);
  // A whole date is the finite domain bound, not an asserted user detour preference.
  const dateBound = 86400;
  return evaluatePair({
    driver: {
      userId: driver.uid,
      occurrence: { localDate: date, direction: 'TO_CAMPUS' },
      departureWindow: { earliest: driverStart, latest: driverStart },
      campusArrivalWindow: driverArrival,
      preferredDeparture: driverStart,
      seatsRemaining: d.seats ?? 0,
      maxExtraDurationSeconds: dateBound,
    },
    rider: {
      userId: rider.uid,
      occurrence: { localDate: date, direction: 'TO_CAMPUS' },
      pickupWindow: { earliest: riderStart, latest: riderDeadline },
      destinationArrivalWindow: riderArrival,
      seatsRequested: 1,
      accessWalkSeconds: 0,
      egressWalkSeconds: 0,
      maxAccessWalkSeconds: 0,
      maxEgressWalkSeconds: 0,
      maxExtraInVehicleSeconds: dateBound,
    },
    anchors: {
      driverStart: { coordinate: d.startPoint, accuracy: 'SELECTED_POINT' },
      riderPickup: { coordinate: r.startPoint, accuracy: 'SELECTED_POINT' },
      campusDropoff: {
        coordinate: campus.coordinate,
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
    pickupServiceSeconds: PICKUP_SERVICE_SECONDS,
    travel: {
      startToCampus: routeEstimate(baseline),
      startToPickup: routeEstimate(shared, 0),
      pickupToCampus: routeEstimate(shared, 1),
    },
  });
}
