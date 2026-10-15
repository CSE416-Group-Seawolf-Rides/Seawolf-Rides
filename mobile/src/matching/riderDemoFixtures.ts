import type { PairEvaluationInput, StaticRouteEstimate } from './types';
import type {
  RoadRoute,
  RouteCoordinate,
  RouteLeg,
  RoutingAdapter,
  RoutingResult,
} from '../routing/types';

export const RIDER_DEMO_LOCAL_DATE = '2026-10-19';
export const RIDER_DEMO_TIME_ZONE = 'America/New_York';
export const RIDER_DEMO_TIME_ZONE_LABEL =
  'America/New_York (UTC−04:00 on October 19, 2026)';
export const RIDER_DEMO_PICKUP_SERVICE_SECONDS = 2 * 60;

export const riderDemoDriver = {
  id: 'demo-driver-map',
  name: 'Jordan (demo driver)',
  startLabel: 'Smith Haven Mall public pickup area',
  start: { latitude: 40.86318, longitude: -73.13077 },
  campusLabel: 'Stony Brook University Lot 40',
  campus: { latitude: 40.8958, longitude: -73.1248 },
  departureWindow: { earliest: at(8, 0), latest: at(8, 15) },
  campusArrivalWindow: { earliest: at(8, 35), latest: at(8, 55) },
  preferredDeparture: at(8, 5),
  seatsRemaining: 2,
  maxExtraDurationSeconds: 10 * 60,
  maxExtraDurationRatio: 0.3,
} as const;

export type RiderDemoScenario =
  | 'FEASIBLE_LOW_DETOUR'
  | 'FEASIBLE_HIGHER_DETOUR'
  | 'SCHEDULE_CONFLICT'
  | 'DETOUR_LIMIT'
  | 'UNCONFIRMED_PICKUP'
  | 'MISSING_ESTIMATE';

export interface RiderDemoCandidate {
  id: string;
  name: string;
  pickupLabel: string;
  pickup: RouteCoordinate;
  pickupAccuracy: 'SELECTED_POINT' | 'APPROXIMATE_AREA';
  scenario: RiderDemoScenario;
  intendedOutcome: string;
  skipLiveRouting: boolean;
  input: PairEvaluationInput;
}

export type RiderDemoCaseId = 'COMPARE_PICKUPS' | 'SCHEDULE_CHANGE';

export interface RiderDemoPresentationCase {
  id: RiderDemoCaseId;
  title: string;
  description: string;
  changedSchedule: string | null;
}

export const riderDemoPresentationCases: readonly RiderDemoPresentationCase[] = [
  {
    id: 'COMPARE_PICKUPS',
    title: 'Compare pickups',
    description: 'Compare six independent pickup alternatives for the same campus trip.',
    changedSchedule: null,
  },
  {
    id: 'SCHEDULE_CHANGE',
    title: 'Schedule changes the recommendation',
    description: 'Use the same people, points, travel estimates, and limits with one schedule change.',
    changedSchedule: "Alex's demo pickup window changes from 8:08–8:25 AM to 8:25–8:28 AM.",
  },
] as const;

const missing: StaticRouteEstimate = { status: 'MISSING' };

function at(hour: number, minute: number): number {
  const hours = String(hour).padStart(2, '0');
  const minutes = String(minute).padStart(2, '0');
  return Date.parse(`${RIDER_DEMO_LOCAL_DATE}T${hours}:${minutes}:00-04:00`) / 1000;
}

function candidate(
  details: Omit<RiderDemoCandidate, 'input' | 'skipLiveRouting'> & {
    pickupWindow: { earliest: number; latest: number };
    arrivalWindow: { earliest: number; latest: number };
    accessWalkSeconds: number;
    egressWalkSeconds: number;
    skipLiveRouting?: boolean;
  },
): RiderDemoCandidate {
  return {
    id: details.id,
    name: details.name,
    pickupLabel: details.pickupLabel,
    pickup: { ...details.pickup },
    pickupAccuracy: details.pickupAccuracy,
    scenario: details.scenario,
    intendedOutcome: details.intendedOutcome,
    skipLiveRouting: details.skipLiveRouting ?? false,
    input: {
      driver: {
        userId: riderDemoDriver.id,
        occurrence: { localDate: RIDER_DEMO_LOCAL_DATE, direction: 'TO_CAMPUS' },
        departureWindow: { ...riderDemoDriver.departureWindow },
        campusArrivalWindow: { ...riderDemoDriver.campusArrivalWindow },
        preferredDeparture: riderDemoDriver.preferredDeparture,
        seatsRemaining: riderDemoDriver.seatsRemaining,
        maxExtraDurationSeconds: riderDemoDriver.maxExtraDurationSeconds,
        maxExtraDurationRatio: riderDemoDriver.maxExtraDurationRatio,
      },
      rider: {
        userId: details.id,
        occurrence: { localDate: RIDER_DEMO_LOCAL_DATE, direction: 'TO_CAMPUS' },
        pickupWindow: details.pickupWindow,
        destinationArrivalWindow: details.arrivalWindow,
        seatsRequested: 1,
        accessWalkSeconds: details.accessWalkSeconds,
        egressWalkSeconds: details.egressWalkSeconds,
        maxAccessWalkSeconds: 10 * 60,
        maxEgressWalkSeconds: 10 * 60,
        maxExtraInVehicleSeconds: 10 * 60,
      },
      anchors: {
        driverStart: { coordinate: { ...riderDemoDriver.start }, accuracy: 'SELECTED_POINT' },
        riderPickup: {
          coordinate: { ...details.pickup },
          accuracy: details.pickupAccuracy,
        },
        campusDropoff: {
          coordinate: { ...riderDemoDriver.campus },
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
      pickupServiceSeconds: RIDER_DEMO_PICKUP_SERVICE_SECONDS,
      travel: {
        startToPickup: missing,
        pickupToCampus: missing,
        startToCampus: missing,
      },
    },
  };
}

/** Fresh synthetic demo people at public meeting points around Stony Brook. */
function createBaseRiderDemoCandidates(): RiderDemoCandidate[] {
  return [
    candidate({
      id: 'rider-alex',
      name: 'Alex (demo rider)',
      pickupLabel: 'Lake Grove public library area',
      pickup: { latitude: 40.8567, longitude: -73.1164 },
      pickupAccuracy: 'SELECTED_POINT',
      scenario: 'FEASIBLE_LOW_DETOUR',
      intendedOutcome: 'Designed to be feasible with the smaller fixture detour.',
      pickupWindow: { earliest: at(8, 8), latest: at(8, 25) },
      arrivalWindow: { earliest: at(8, 35), latest: at(9, 0) },
      accessWalkSeconds: 3 * 60,
      egressWalkSeconds: 4 * 60,
    }),
    candidate({
      id: 'rider-blair',
      name: 'Blair (demo rider)',
      pickupLabel: 'Stony Brook LIRR public entrance',
      pickup: { latitude: 40.92047, longitude: -73.12844 },
      pickupAccuracy: 'SELECTED_POINT',
      scenario: 'FEASIBLE_HIGHER_DETOUR',
      intendedOutcome: 'Designed to be feasible with a larger fixture detour.',
      pickupWindow: { earliest: at(8, 12), latest: at(8, 30) },
      arrivalWindow: { earliest: at(8, 40), latest: at(9, 0) },
      accessWalkSeconds: 2 * 60,
      egressWalkSeconds: 5 * 60,
    }),
    candidate({
      id: 'rider-casey',
      name: 'Casey (demo rider)',
      pickupLabel: 'Nesconset public meeting point',
      pickup: { latitude: 40.8669, longitude: -73.1331 },
      pickupAccuracy: 'SELECTED_POINT',
      scenario: 'SCHEDULE_CONFLICT',
      intendedOutcome: 'Looks close, but its fixture pickup window is too late.',
      pickupWindow: { earliest: at(8, 30), latest: at(8, 33) },
      arrivalWindow: { earliest: at(8, 35), latest: at(8, 55) },
      accessWalkSeconds: 2 * 60,
      egressWalkSeconds: 4 * 60,
    }),
    candidate({
      id: 'rider-drew',
      name: 'Drew (demo rider)',
      pickupLabel: 'Port Jefferson Station public area',
      pickup: { latitude: 40.9253, longitude: -73.0476 },
      pickupAccuracy: 'SELECTED_POINT',
      scenario: 'DETOUR_LIMIT',
      intendedOutcome: 'Designed to exceed the driver detour cap in fixture mode.',
      pickupWindow: { earliest: at(8, 12), latest: at(8, 35) },
      arrivalWindow: { earliest: at(8, 40), latest: at(9, 10) },
      accessWalkSeconds: 4 * 60,
      egressWalkSeconds: 3 * 60,
    }),
    candidate({
      id: 'rider-erin',
      name: 'Erin (demo rider)',
      pickupLabel: 'Setauket approximate public area',
      pickup: { latitude: 40.9294, longitude: -73.1026 },
      pickupAccuracy: 'APPROXIMATE_AREA',
      scenario: 'UNCONFIRMED_PICKUP',
      intendedOutcome: 'Must remain UNKNOWN because the pickup is not confirmed.',
      pickupWindow: { earliest: at(8, 10), latest: at(8, 30) },
      arrivalWindow: { earliest: at(8, 40), latest: at(9, 5) },
      accessWalkSeconds: 5 * 60,
      egressWalkSeconds: 4 * 60,
      skipLiveRouting: true,
    }),
    candidate({
      id: 'rider-finn',
      name: 'Finn (demo rider)',
      pickupLabel: 'Centereach public meeting point',
      pickup: { latitude: 40.8584, longitude: -73.0996 },
      pickupAccuracy: 'SELECTED_POINT',
      scenario: 'MISSING_ESTIMATE',
      intendedOutcome: 'Must remain UNKNOWN because an estimate is deliberately omitted.',
      pickupWindow: { earliest: at(8, 10), latest: at(8, 28) },
      arrivalWindow: { earliest: at(8, 40), latest: at(9, 5) },
      accessWalkSeconds: 3 * 60,
      egressWalkSeconds: 5 * 60,
      skipLiveRouting: true,
    }),
  ];
}

export function createRiderDemoCaseCandidates(caseId: RiderDemoCaseId): RiderDemoCandidate[] {
  const candidates = createBaseRiderDemoCandidates();
  if (caseId === 'SCHEDULE_CHANGE') {
    const alex = candidates.find((candidate) => candidate.id === 'rider-alex');
    if (alex) {
      alex.input.rider.pickupWindow = { earliest: at(8, 25), latest: at(8, 28) };
    }
  }
  return candidates;
}

/** Backward-compatible Case 1 fixture factory used by lower-level tests. */
export function createRiderDemoCandidates(): RiderDemoCandidate[] {
  return createRiderDemoCaseCandidates('COMPARE_PICKUPS');
}

const fixtureMetrics: Record<
  Exclude<RiderDemoScenario, 'UNCONFIRMED_PICKUP' | 'MISSING_ESTIMATE'>,
  { firstSeconds: number; firstMeters: number; secondSeconds: number; secondMeters: number }
> = {
  FEASIBLE_LOW_DETOUR: {
    firstSeconds: 8 * 60,
    firstMeters: 5_000,
    secondSeconds: 24 * 60,
    secondMeters: 16_500,
  },
  FEASIBLE_HIGHER_DETOUR: {
    firstSeconds: 12 * 60,
    firstMeters: 8_000,
    secondSeconds: 23 * 60,
    secondMeters: 15_500,
  },
  SCHEDULE_CONFLICT: {
    firstSeconds: 9 * 60,
    firstMeters: 5_800,
    secondSeconds: 24 * 60,
    secondMeters: 16_000,
  },
  DETOUR_LIMIT: {
    firstSeconds: 20 * 60,
    firstMeters: 14_000,
    secondSeconds: 24 * 60,
    secondMeters: 17_000,
  },
};

function sameCoordinate(a: RouteCoordinate, b: RouteCoordinate): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

function fixtureLeg(
  start: RouteCoordinate,
  end: RouteCoordinate,
  durationSeconds: number,
  distanceMeters: number,
): RouteLeg {
  return {
    durationSeconds,
    distanceMeters,
    summary: 'Deterministic fixture road leg',
    steps: [
      {
        durationSeconds,
        distanceMeters,
        geometry: [{ ...start }, { ...end }],
        maneuver: {
          type: 'depart',
          modifier: null,
          location: { ...start },
          bearingBefore: null,
          bearingAfter: null,
          exit: null,
        },
        name: 'Fixture road',
        reference: '',
      },
    ],
  };
}

function fixtureRoute(coordinates: readonly RouteCoordinate[], legs: RouteLeg[]): RoadRoute {
  return {
    geometry: coordinates.map((coordinate) => ({ ...coordinate })),
    distanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
    durationSeconds: legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
    provider: { id: 'osrm', name: 'Fixture road data', baseUrl: 'fixture://rider-demo' },
    snappedWaypoints: coordinates.map((coordinate) => ({
      input: { ...coordinate },
      snapped: { ...coordinate },
      distanceMeters: 0,
      name: 'Fixture point',
    })),
    legs,
  };
}

export function createRiderDemoFixtureAdapter(
  candidates: readonly RiderDemoCandidate[],
): RoutingAdapter {
  return {
    async route(coordinates): Promise<RoutingResult> {
      if (
        coordinates.length === 2 &&
        sameCoordinate(coordinates[0], riderDemoDriver.start) &&
        sameCoordinate(coordinates[1], riderDemoDriver.campus)
      ) {
        const leg = fixtureLeg(
          coordinates[0],
          coordinates[1],
          30 * 60,
          21_000,
        );
        return { status: 'SUCCESS', route: fixtureRoute(coordinates, [leg]) };
      }

      const rider = candidates.find(
        (candidate) =>
          coordinates.length === 3 && sameCoordinate(coordinates[1], candidate.pickup),
      );
      if (!rider || rider.scenario === 'UNCONFIRMED_PICKUP' || rider.scenario === 'MISSING_ESTIMATE') {
        return {
          status: 'FAILURE',
          code: 'NO_ROUTE',
          message: 'No fixture route exists for this request.',
          retryable: false,
        };
      }
      const metrics = fixtureMetrics[rider.scenario];
      const legs = [
        fixtureLeg(coordinates[0], coordinates[1], metrics.firstSeconds, metrics.firstMeters),
        fixtureLeg(coordinates[1], coordinates[2], metrics.secondSeconds, metrics.secondMeters),
      ];
      return { status: 'SUCCESS', route: fixtureRoute(coordinates, legs) };
    },
  };
}
