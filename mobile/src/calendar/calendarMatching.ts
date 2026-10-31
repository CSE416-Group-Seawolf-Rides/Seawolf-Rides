import { evaluatePair } from '../matching/evaluatePair';
import type { PairEvaluation, StaticRouteEstimate } from '../matching/types';
import type { CommuteSchedule, Coordinates, DaySchedule, PrivacyArea } from '../commute/commuteModel';
import type { RoutingAdapter, RoutingResult } from '../routing/types';
import {
  CAMPUS_POINTS,
  localMinuteToEpoch,
  PICKUP_SERVICE_SECONDS,
} from '../mvp/settings';
import type { RidePrice } from '../payments/pricing';
import { ARRIVAL_BUFFER_SECONDS, ARRIVAL_FLEX_MINUTES, preferredArrivalWindow } from '../commute/arrivalPolicy';

export interface AcceptedStop {
  coordinate: Coordinates;
  name: string;
}
export interface CalendarParticipant {
  uid: string;
  name: string;
  revision: string;
  commute: CommuteSchedule;
  day: DaySchedule;
  seatsRemaining?: number;
  seatsCapacity?: number;
  acceptedStops?: AcceptedStop[];
}
export interface CalendarEta {
  model: 'STATIC_ROAD' | 'TRAFFIC_FORECAST';
  provider: 'OSRM' | 'TomTom';
  computedAtEpochSeconds: number;
  departureEpochSeconds: number;
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
  /** Absolute seconds from the searching user’s three-minute-early arrival target. */
  arrivalDifferenceSeconds: number;
  eta?: CalendarEta;
  dropoffLabel?: string;
  preferredDropoffLabel?: string;
  dropoffPreferenceMatch?: boolean;
  savedDriverDeparture?: number;
  metrics: Extract<PairEvaluation, { status: 'FEASIBLE' }>['metrics'];
  /** The rider's gas share for this trip, from the driver's car and this week's fuel price. */
  price?: RidePrice;
  seatsRemaining?: number;
  seatsCapacity?: number;
  acceptedRidersCount?: number;
}
export interface CalendarSearchResult {
  policyVersion: 3;
  searchRevision: string;
  totalCandidatePlans: number;
  checkedCandidatePlans: number;
  nextCursor: string | null;
  matches: CalendarMatch[];
  incomplete: boolean;
  unknownCount: number;
  incompatibleCount: number;
}
export function arrivalTargetsOverlap(a: number | null, b: number | null): boolean {
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
export function compareCalendarMatches(a: CalendarMatch, b: CalendarMatch): number {
  return (
    a.arrivalDifferenceSeconds - b.arrivalDifferenceSeconds ||
    Number(a.dropoffPreferenceMatch === false) - Number(b.dropoffPreferenceMatch === false) ||
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
  const matches = new Map(previous.matches.map((m) => [`${m.driverId}:${m.riderId}`, m]));
  next.matches.forEach((m) => matches.set(`${m.driverId}:${m.riderId}`, m));
  return {
    ...next,
    matches: [...matches.values()].sort(compareCalendarMatches),
    unknownCount: previous.unknownCount + next.unknownCount,
    incompatibleCount: previous.incompatibleCount + next.incompatibleCount,
  };
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
function routeLegsEstimate(result: RoutingResult, startLeg: number, endLeg: number): StaticRouteEstimate {
  if (result.status === 'FAILURE')
    return { status: result.code === 'NO_ROUTE' ? 'UNREACHABLE' : 'MISSING' };
  if (!result.route || !result.route.legs || result.route.legs.length === 0)
    return { status: 'MISSING' };
  const legs = result.route.legs.slice(startLeg, endLeg + 1);
  if (legs.length === 0) return { status: 'MISSING' };
  const durationSeconds = Math.round(legs.reduce((sum, leg) => sum + leg.durationSeconds, 0));
  const distanceMeters = Math.round(legs.reduce((sum, leg) => sum + leg.distanceMeters, 0));
  return { status: 'AVAILABLE', durationSeconds, distanceMeters };
}
/** A proposed trip uses the driver's concrete campus stop. Rider drop-off preference
 * affects ranking, not feasibility. Saved driver departure is a reference for review,
 * not a reservation; rider readiness remains a real bound. */
export async function evaluateCalendarPair(
  driver: CalendarParticipant,
  rider: CalendarParticipant,
  date: string,
  routing: RoutingAdapter,
  now: number,
): Promise<PairEvaluation & { eta?: CalendarEta }> {
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
  const availableSeats = driver.seatsRemaining !== undefined ? driver.seatsRemaining : (d.seats ?? 0);
  if (availableSeats <= 0) return { status: 'INFEASIBLE', reasonCodes: ['NO_SEAT'] };
  const campus = CAMPUS_POINTS.find((p) => p.id === d.campusLot);
  if (!d.startPoint || !r.startPoint || !campus)
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
  const savedDriverStart = localMinuteToEpoch(date, driver.day.startAt);
  let driverStart = savedDriverStart;
  const riderStart = Math.max(earliest, localMinuteToEpoch(date, rider.day.startAt));
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
  const arrivalEarliest = Math.max(driverArrival.earliest, riderArrival.earliest);
  const arrivalLatest = Math.min(driverDeadline, riderDeadline);
  if (arrivalEarliest > arrivalLatest || riderStart >= riderDeadline)
    return { status: 'INFEASIBLE', reasonCodes: ['NO_FEASIBLE_DEPARTURE'] };
  const desiredArrival = Math.max(arrivalEarliest, arrivalLatest - ARRIVAL_BUFFER_SECONDS);
  const safeRoute = async (
    points: Parameters<RoutingAdapter['route']>[0],
    options: { departureEpochSeconds?: number; arrivalEpochSeconds?: number } = { departureEpochSeconds: driverStart },
  ): Promise<RoutingResult> => {
    try {
      const result = await routing.route(points, options);
      if (
        result.status === 'SUCCESS' &&
        ((!Number.isFinite(result.route.durationSeconds) || result.route.durationSeconds < 0 ||
          !Number.isFinite(result.route.distanceMeters) || result.route.distanceMeters < 0) ||
          (routing.timeDependent &&
          (result.route.estimate?.model !== 'TRAFFIC_FORECAST' ||
            (options.departureEpochSeconds !== undefined && result.route.estimate.departureEpochSeconds !== options.departureEpochSeconds) ||
            (options.arrivalEpochSeconds !== undefined && (!Number.isSafeInteger(result.route.estimate.departureEpochSeconds) || Math.abs(result.route.estimate.departureEpochSeconds! + result.route.durationSeconds - options.arrivalEpochSeconds) > 1)) ||
            !Number.isSafeInteger(result.route.estimate.computedAtEpochSeconds))) ||
          result.route.legs.length !== points.length - 1 ||
          result.route.legs.some((leg) => !Number.isFinite(leg.durationSeconds) || leg.durationSeconds < 0 || !Number.isFinite(leg.distanceMeters) || leg.distanceMeters < 0) ||
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
  // One bounded arrival-based seed, followed by the three actual timed legs.
  // No iterative traffic probing; all four calls share the provider scheduler/budget.
  let seed: RoutingResult | undefined;
  if (routing.timeDependent) {
    seed = await safeRoute([d.startPoint, r.startPoint, campus.coordinate], {
      arrivalEpochSeconds: desiredArrival - PICKUP_SERVICE_SECONDS,
    });
    if (seed.status !== 'SUCCESS') return seed.code === 'NO_ROUTE'
      ? { status: 'INFEASIBLE', reasonCodes: ['NO_ROAD_ROUTE'] }
      : { status: 'UNKNOWN', reasonCodes: ['MISSING_TRAVEL_ESTIMATE'] };
    driverStart = Math.max(seed.route.estimate!.departureEpochSeconds!, riderStart - Math.round(seed.route.legs[0].durationSeconds));
    if (driverStart < earliest || driverStart >= arrivalLatest)
      return { status: 'INFEASIBLE', reasonCodes: ['NO_FEASIBLE_DEPARTURE'] };
  }
  const acceptedStops = driver.acceptedStops ?? [];
  const baseline = await safeRoute([d.startPoint, campus.coordinate]);
  let shared: RoutingResult;
  let pickupIndex = 0;
  if (!routing.timeDependent && acceptedStops.length > 0) {
    const routeOrderA = [d.startPoint, ...acceptedStops.map((s) => s.coordinate), r.startPoint, campus.coordinate];
    const routeOrderB = [d.startPoint, r.startPoint, ...acceptedStops.map((s) => s.coordinate), campus.coordinate];
    const [resA, resB] = await Promise.all([safeRoute(routeOrderA), safeRoute(routeOrderB)]);
    const validA = resA.status === 'SUCCESS';
    const validB = resB.status === 'SUCCESS';
    if (validA && validB) {
      if (resA.route.durationSeconds <= resB.route.durationSeconds) {
        shared = resA;
        pickupIndex = acceptedStops.length;
      } else {
        shared = resB;
        pickupIndex = 0;
      }
    } else if (validA) {
      shared = resA;
      pickupIndex = acceptedStops.length;
    } else {
      shared = resB;
      pickupIndex = 0;
    }
  } else {
    shared = await safeRoute(
      routing.timeDependent
        ? [d.startPoint, r.startPoint]
        : [d.startPoint, r.startPoint, campus.coordinate],
    );
  }
  // A traffic-dependent second leg must start AFTER driving to pickup and boarding.
  const pickupToCampus = routing.timeDependent
    ? shared.status === 'SUCCESS'
      ? await safeRoute(
          [r.startPoint, campus.coordinate],
          { departureEpochSeconds: driverStart + Math.round(shared.route.durationSeconds) + PICKUP_SERVICE_SECONDS },
        )
      : shared
    : shared;
  const totalServiceSeconds = (acceptedStops.length + 1) * PICKUP_SERVICE_SECONDS;
  if (!routing.timeDependent && shared.status === 'SUCCESS') {
    const duration = shared.route.legs.reduce((sum, leg) => sum + Math.round(leg.durationSeconds), totalServiceSeconds);
    if (Number.isSafeInteger(duration)) driverStart = desiredArrival - duration;
  }
  // A whole date is the finite domain bound, not an asserted user detour preference.
  const dateBound = 86400;
  const evaluation = evaluatePair({
    driver: {
      userId: driver.uid,
      occurrence: { localDate: date, direction: 'TO_CAMPUS' },
      departureWindow: routing.timeDependent
        ? { earliest: driverStart, latest: driverStart }
        : { earliest, latest: arrivalLatest },
      campusArrivalWindow: driverArrival,
      preferredDeparture: driverStart,
      seatsRemaining: availableSeats,
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
      startToPickup: routing.timeDependent
        ? routeEstimate(shared, 0)
        : (acceptedStops.length > 0 ? routeLegsEstimate(shared, 0, pickupIndex) : routeEstimate(shared, 0)),
      pickupToCampus: routing.timeDependent
        ? routeEstimate(pickupToCampus, 0)
        : (acceptedStops.length > 0 && shared.status === 'SUCCESS'
            ? routeLegsEstimate(shared, pickupIndex + 1, shared.route.legs.length - 1)
            : routeEstimate(pickupToCampus, 1)),
    },
  });
  if (evaluation.status !== 'FEASIBLE') return evaluation;
  const sources = [...(seed ? [seed] : []), baseline, shared, pickupToCampus];
  const traffic = sources.every(
    (result) =>
      result.status === 'SUCCESS' && result.route.estimate?.model === 'TRAFFIC_FORECAST',
  );
  if (routing.timeDependent && !traffic)
    return { status: 'UNKNOWN', reasonCodes: ['MISSING_TRAVEL_ESTIMATE'] };
  return {
    ...evaluation,
    eta: {
      model: traffic ? 'TRAFFIC_FORECAST' : 'STATIC_ROAD',
      provider: traffic ? 'TomTom' : 'OSRM',
      departureEpochSeconds: evaluation.plan.departure,
      computedAtEpochSeconds: Math.min(
        ...sources.map((result) =>
          result.status === 'SUCCESS'
            ? (result.route.estimate?.computedAtEpochSeconds ?? now)
            : now,
        ),
      ),
    },
  };
}
