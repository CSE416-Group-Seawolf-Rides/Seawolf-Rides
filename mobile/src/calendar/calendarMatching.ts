import { evaluatePair } from '../matching/evaluatePair';
import type { PairEvaluation, StaticRouteEstimate } from '../matching/types';
import type { CommuteSchedule, DaySchedule, PrivacyArea } from '../commute/commuteModel';
import type { RoutingAdapter, RoutingResult } from '../routing/types';
import { CAMPUS_POINTS, localMinuteToEpoch, PICKUP_SERVICE_SECONDS } from '../mvp/settings';

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
  metrics: Extract<PairEvaluation, { status: 'FEASIBLE' }>['metrics'];
}
export interface CalendarSearchResult {
  matches: CalendarMatch[];
  incomplete: boolean;
  unknownCount: number;
  incompatibleCount: number;
}
function routeEstimate(result: RoutingResult, index?: number): StaticRouteEstimate {
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
 * Midnight is a date boundary, not a user availability assertion. Latest feasible
 * departure is preferred. No user detour/walking preferences are invented.
 */
export async function evaluateCalendarPair(
  driver: CalendarParticipant,
  rider: CalendarParticipant,
  date: string,
  routing: RoutingAdapter,
  now: number,
): Promise<PairEvaluation> {
  if (driver.uid === rider.uid) return { status: 'INFEASIBLE', reasonCodes: ['SELF_MATCH'] };
  if (
    !['drive', 'either'].includes(driver.day.mode) ||
    !['ride', 'either'].includes(rider.day.mode)
  )
    return { status: 'INFEASIBLE', reasonCodes: ['ROLE_CONFLICT'] };
  const d = driver.commute,
    r = rider.commute;
  if (!d.discoveryEnabled || !r.discoveryEnabled)
    return { status: 'INFEASIBLE', reasonCodes: ['SKIPPED_OCCURRENCE'] };
  if (!(d.seats ?? 0)) return { status: 'INFEASIBLE', reasonCodes: ['NO_SEAT'] };
  const campus = CAMPUS_POINTS.find((p) => p.id === d.campusLot);
  if (!d.startPoint || !r.startPoint || !campus || d.campusLot !== r.campusLot)
    return { status: 'UNKNOWN', reasonCodes: ['LOCATION_UNCONFIRMED'] };
  if (driver.day.arriveBy === null || rider.day.arriveBy === null)
    return { status: 'INFEASIBLE', reasonCodes: ['SKIPPED_OCCURRENCE'] };
  const earliest = Math.max(now + 1, localMinuteToEpoch(date, 0));
  const driverDeadline = localMinuteToEpoch(date, driver.day.arriveBy);
  const riderDeadline = localMinuteToEpoch(date, rider.day.arriveBy);
  if (earliest > Math.min(driverDeadline, riderDeadline))
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
      departureWindow: { earliest, latest: driverDeadline },
      campusArrivalWindow: { earliest, latest: driverDeadline },
      preferredDeparture: driverDeadline,
      seatsRemaining: d.seats ?? 0,
      maxExtraDurationSeconds: dateBound,
    },
    rider: {
      userId: rider.uid,
      occurrence: { localDate: date, direction: 'TO_CAMPUS' },
      pickupWindow: { earliest, latest: riderDeadline },
      destinationArrivalWindow: { earliest, latest: riderDeadline },
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
