import type { CommuteSchedule } from '../commute/commuteModel';
import {
  rankDriversForRider,
  type DriverCandidate,
  type DriverRecommendation,
} from '../matching/rankDrivers';
import type { PairEvaluationInput, StaticRouteEstimate } from '../matching/types';
import { parseCommuteDocument, parseUserProfileDocument } from '../persistence/userDataModel';
import type { RoadRoute, RoutingAdapter, RoutingResult } from '../routing/types';
import {
  CAMPUS_POINTS,
  PUBLIC_POINTS,
  MATCHING_TIME_ZONE,
  PICKUP_SERVICE_SECONDS,
  localDateAt,
  localMinuteToEpoch,
  parseMatchingSetup,
  setupMatchesCommute,
  weekdayForDate,
  record,
  type MatchingSetup,
} from './settings';

export interface SavedParticipant {
  uid: string;
  eligible: boolean;
  setup: unknown;
  commute: unknown;
  profile: unknown;
}
export interface MatchingRepository {
  load(uid: string): Promise<SavedParticipant | null>;
  /** Ordered by UID; limit + 1 detects a bounded/truncated search. */
  findDrivers(campusLot: string, weekday: string, limit: number): Promise<SavedParticipant[]>;
}
export class MatchingError extends Error {
  readonly code: 'invalid-argument' | 'permission-denied' | 'failed-precondition' | 'aborted';
  constructor(code: MatchingError['code'], message: string) {
    super(message);
    this.code = code;
  }
}
export interface MatchCard {
  driverId: string;
  firstName: string;
  approximateArea: string;
  seatsAvailable: number;
  inputRevision: string;
  score: number;
  explanations: string[];
  plan: DriverRecommendation['evaluation']['plan'];
  metrics: DriverRecommendation['evaluation']['metrics'];
}
export interface MatchResponse {
  localDate: string;
  timeZone: string;
  evaluatedAt: number;
  riderRevision: string;
  recommendations: MatchCard[];
  unknownCount: number;
  incompatibleCount: number;
  unknownReasons: string[];
  incompatibleReasons: string[];
  candidateLimitReached: boolean;
}
interface Participant {
  setup: MatchingSetup;
  commute: CommuteSchedule;
  firstName: string;
}
function participant(saved: SavedParticipant | null): Participant | null {
  if (!saved?.eligible) return null;
  try {
    const setup = parseMatchingSetup(saved.setup, saved.uid);
    const commute = parseCommuteDocument(saved.commute, saved.uid);
    const profile = parseUserProfileDocument(saved.profile);
    if (!setup.active || !setup.optIn || !setupMatchesCommute(setup, commute, profile.role))
      return null;
    return { setup, commute, firstName: profile.firstName };
  } catch {
    return null;
  }
}
function estimate(result: RoutingResult, index?: number): StaticRouteEstimate {
  if (result.status === 'FAILURE')
    return { status: result.code === 'NO_ROUTE' ? 'UNREACHABLE' : 'MISSING' };
  const leg = index === undefined ? result.route : result.route.legs[index];
  if (
    !leg ||
    !Number.isFinite(leg.durationSeconds) ||
    !Number.isFinite(leg.distanceMeters) ||
    leg.durationSeconds < 0 ||
    leg.distanceMeters < 0
  )
    return { status: 'MISSING' };
  return {
    status: 'AVAILABLE',
    durationSeconds: Math.round(leg.durationSeconds),
    distanceMeters: Math.round(leg.distanceMeters),
  };
}
function anchored(
  route: RoadRoute,
  points: readonly { latitude: number; longitude: number }[],
): boolean {
  return (
    route.legs.length === points.length - 1 &&
    route.snappedWaypoints.length === points.length &&
    route.snappedWaypoints.every(
      (waypoint, index) =>
        waypoint.input.latitude === points[index].latitude &&
        waypoint.input.longitude === points[index].longitude &&
        Number.isFinite(waypoint.distanceMeters) &&
        waypoint.distanceMeters >= 0 &&
        waypoint.distanceMeters <= 75,
    )
  );
}
const missing: StaticRouteEstimate = { status: 'MISSING' };
function epochWindow(date: string, window: MatchingSetup['startWindow']) {
  return {
    earliest: localMinuteToEpoch(date, window.earliest),
    latest: localMinuteToEpoch(date, window.latest),
  };
}
async function boundedMap<T, R>(values: readonly T[], map: (value: T) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, values.length) }, async () => {
      while (next < values.length) {
        const index = next++;
        result[index] = await map(values[index]);
      }
    }),
  );
  return result;
}
export async function findMatches(
  uid: string,
  request: unknown,
  repository: MatchingRepository,
  routing: RoutingAdapter,
  now = Math.floor(Date.now() / 1000),
): Promise<MatchResponse> {
  if (
    !record(request) ||
    Object.keys(request).some((key) => !['localDate', 'revision', 'direction'].includes(key)) ||
    typeof request.localDate !== 'string' ||
    typeof request.revision !== 'string' ||
    request.direction !== 'TO_CAMPUS'
  ) {
    throw new MatchingError(
      'invalid-argument',
      'Supply a date, saved revision and TO_CAMPUS direction. Return trips are not supported.',
    );
  }
  const date = request.localDate;
  let weekday: ReturnType<typeof weekdayForDate>;
  try {
    weekday = weekdayForDate(date);
  } catch {
    throw new MatchingError('invalid-argument', 'Choose a valid date.');
  }
  const today = localDateAt(now);
  const horizon = (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000;
  if (horizon < 0 || horizon > 30)
    throw new MatchingError('invalid-argument', 'Search a date within the next 30 days.');
  const rider = participant(await repository.load(uid));
  if (!rider || rider.setup.mode !== 'rider')
    throw new MatchingError(
      'failed-precondition',
      'Save and enable your current rider matching setup.',
    );
  if (rider.setup.revision !== request.revision)
    throw new MatchingError('aborted', 'Your setup changed. Reload it and search again.');
  if (!rider.setup.weekdays.includes(weekday))
    throw new MatchingError('failed-precondition', 'This date is not an inbound riding day.');
  const pickup = PUBLIC_POINTS.find((point) => point.id === rider.setup.pointId)!;
  const campus = CAMPUS_POINTS.find((point) => point.id === rider.setup.campusLot)!;
  let pickupWindow: ReturnType<typeof epochWindow>;
  let arrivalWindow: ReturnType<typeof epochWindow>;
  try {
    pickupWindow = epochWindow(date, rider.setup.startWindow);
    arrivalWindow = epochWindow(date, rider.setup.arrivalWindow);
  } catch {
    throw new MatchingError(
      'failed-precondition',
      'A local time is ambiguous or unavailable. Change the windows and save again.',
    );
  }
  if (pickupWindow.latest <= now)
    throw new MatchingError('failed-precondition', 'The pickup window has already ended.');
  const riderInput: PairEvaluationInput['rider'] = {
    userId: uid,
    occurrence: { localDate: date, direction: 'TO_CAMPUS' },
    pickupWindow: { ...pickupWindow, earliest: Math.max(pickupWindow.earliest, now) },
    destinationArrivalWindow: arrivalWindow,
    seatsRequested: rider.setup.seatsRequested,
    accessWalkSeconds: rider.setup.accessWalkSeconds,
    egressWalkSeconds: rider.setup.egressWalkSeconds,
    maxAccessWalkSeconds: rider.setup.maxAccessWalkSeconds,
    maxEgressWalkSeconds: rider.setup.maxEgressWalkSeconds,
    maxExtraInVehicleSeconds: rider.setup.maxExtraRideSeconds,
  };
  const limit = 30;
  const found = await repository.findDrivers(rider.setup.campusLot, weekday, limit + 1);
  const drivers = found.slice(0, limit).flatMap((saved) => {
    const parsed = participant(saved);
    return parsed &&
      saved.uid !== uid &&
      parsed.setup.mode === 'driver' &&
      parsed.setup.weekdays.includes(weekday) &&
      parsed.setup.campusLot === rider.setup.campusLot &&
      (parsed.commute.seats ?? 0) >= riderInput.seatsRequested
      ? [parsed]
      : [];
  });
  const evaluations = await boundedMap(drivers, async (driver) => {
    const start = PUBLIC_POINTS.find((point) => point.id === driver.setup.pointId)!;
    let departure: ReturnType<typeof epochWindow>;
    let arrival: ReturnType<typeof epochWindow>;
    try {
      departure = epochWindow(date, driver.setup.startWindow);
      arrival = epochWindow(date, driver.setup.arrivalWindow);
    } catch {
      return null;
    }
    if (departure.latest <= now) return null;
    const baselinePoints = [start.coordinate, campus.coordinate];
    const sharedPoints = [start.coordinate, pickup.coordinate, campus.coordinate];
    const safelyRoute = async (points: typeof baselinePoints): Promise<RoutingResult> => {
      try {
        return await routing.route(points);
      } catch {
        return {
          status: 'FAILURE',
          code: 'PROVIDER_ERROR',
          message: 'Estimates unavailable',
          retryable: true,
        };
      }
    };
    const [baseline, shared] = await Promise.all([
      safelyRoute(baselinePoints),
      safelyRoute(sharedPoints),
    ]);
    const baselineValid = baseline.status !== 'SUCCESS' || anchored(baseline.route, baselinePoints);
    const sharedValid = shared.status !== 'SUCCESS' || anchored(shared.route, sharedPoints);
    const input: DriverCandidate = {
      driver: {
        userId: driver.setup.ownerId,
        occurrence: riderInput.occurrence,
        departureWindow: { ...departure, earliest: Math.max(departure.earliest, now) },
        campusArrivalWindow: arrival,
        preferredDeparture: Math.max(departure.earliest, now),
        seatsRemaining: driver.commute.seats!,
        maxExtraDurationSeconds: driver.setup.maxDetourSeconds,
      },
      anchors: {
        driverStart: { coordinate: start.coordinate, accuracy: 'SELECTED_POINT' },
        riderPickup: { coordinate: pickup.coordinate, accuracy: 'SELECTED_POINT' },
        campusDropoff: { coordinate: campus.coordinate, accuracy: 'SELECTED_POINT' },
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
        startToCampus: baselineValid ? estimate(baseline) : missing,
        startToPickup: sharedValid ? estimate(shared, 0) : missing,
        pickupToCampus: sharedValid ? estimate(shared, 1) : missing,
      },
    };
    return { driver, input };
  });
  const inputs = evaluations.filter((item) => item !== null);
  const result = rankDriversForRider(
    riderInput,
    inputs.map((item) => item.input),
  );
  // Recheck persisted settings, commute and account eligibility after network work.
  const freshRider = participant(await repository.load(uid));
  if (!freshRider || JSON.stringify(freshRider.setup) !== JSON.stringify(rider.setup)) {
    throw new MatchingError('aborted', 'Your commute or setup changed. Reload and search again.');
  }
  let staleDrivers = 0;
  const cards = await boundedMap(
    result.recommendations,
    async (item): Promise<MatchCard | null> => {
      const original = inputs.find(
        (candidate) => candidate.driver.setup.ownerId === item.driverId,
      )!.driver;
      const fresh = participant(await repository.load(item.driverId));
      if (!fresh || JSON.stringify(fresh.setup) !== JSON.stringify(original.setup)) {
        staleDrivers++;
        return null;
      }
      return {
        driverId: item.driverId,
        firstName: fresh.firstName,
        approximateArea: fresh.commute.startArea.label,
        seatsAvailable: fresh.commute.seats!,
        inputRevision: fresh.setup.revision,
        score: item.score,
        explanations: item.explanations,
        plan: item.evaluation.plan,
        metrics: item.evaluation.metrics,
      };
    },
  );
  return {
    localDate: date,
    timeZone: MATCHING_TIME_ZONE,
    evaluatedAt: now,
    riderRevision: rider.setup.revision,
    recommendations: cards.filter((item) => item !== null),
    unknownCount:
      result.evaluations.filter((item) => item.evaluation.status === 'UNKNOWN').length +
      evaluations.filter((item) => item === null).length +
      staleDrivers,
    incompatibleCount: result.evaluations.filter((item) => item.evaluation.status === 'INFEASIBLE')
      .length,
    unknownReasons: [
      ...new Set(
        result.evaluations.flatMap((item) =>
          item.evaluation.status === 'UNKNOWN' ? item.evaluation.reasonCodes : [],
        ),
      ),
    ],
    incompatibleReasons: [
      ...new Set(
        result.evaluations.flatMap((item) =>
          item.evaluation.status === 'INFEASIBLE' ? item.evaluation.reasonCodes : [],
        ),
      ),
    ],
    candidateLimitReached: found.length > limit,
  };
}
