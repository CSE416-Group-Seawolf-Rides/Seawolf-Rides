import { getCampusDestinationMapLocation } from '../map/campusDestinations';
import type { RouteCoordinate } from '../routing/types';
import { queensTestDriverRoutingProfile } from './driverRecommendationFixtures';
import { localMinuteToEpochSeconds, NORMAL_MATCHING_TIME_ZONE } from './driverRecommendations';
import type { RiderDemoCandidate, RiderDemoScenario } from './riderDemoFixtures';
import type { PairEvaluationInput, RoutingAnchorAccuracy } from './types';

export const QUEENS_DRIVER_TEST_TIME_ZONE = NORMAL_MATCHING_TIME_ZONE;
export const QUEENS_DRIVER_TEST_PICKUP_SERVICE_SECONDS = 2 * 60;
export const queensDriverTestStart = { ...queensTestDriverRoutingProfile.driverStart };
export const queensDriverTestCampus = getCampusDestinationMapLocation('lot40');

export interface QueensDriverTestConfig {
  localDate: string;
  departureEarliestMinutes: number;
  departureLatestMinutes: number;
  preferredDepartureMinutes: number;
  arrivalEarliestMinutes: number;
  arrivalLatestMinutes: number;
  seatsRemaining: number;
  maxExtraDurationMinutes: number;
  maxExtraDurationPercent: number;
}

export const defaultQueensDriverTestConfig: QueensDriverTestConfig = {
  localDate: '2026-10-19',
  departureEarliestMinutes: 6 * 60 + 30,
  departureLatestMinutes: 7 * 60 + 15,
  preferredDepartureMinutes: 6 * 60 + 45,
  arrivalEarliestMinutes: 8 * 60,
  arrivalLatestMinutes: 9 * 60 + 30,
  seatsRemaining: 3,
  maxExtraDurationMinutes: 25,
  maxExtraDurationPercent: 30,
};

interface SyntheticRiderDefinition {
  id: string;
  name: string;
  pickupLabel: string;
  pickup: RouteCoordinate;
  pickupAccuracy: RoutingAnchorAccuracy;
  scenario: RiderDemoScenario;
  intendedOutcome: string;
  pickupWindowMinutes: { earliest: number; latest: number };
  arrivalWindowMinutes: { earliest: number; latest: number };
  accessWalkMinutes: number;
  egressWalkMinutes: number;
  skipLiveRouting?: boolean;
}

/**
 * Public station coordinates are from the MTA LIRR GTFS stops feed,
 * https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip, retrieved 2026-10-15.
 * They are synthetic meeting points, not user homes.
 */
const syntheticRiders: readonly SyntheticRiderDefinition[] = [
  {
    id: 'queens-rider-maya',
    name: 'Maya (synthetic rider)',
    pickupLabel: 'Mineola LIRR station',
    pickup: { latitude: 40.74034743, longitude: -73.64086293 },
    pickupAccuracy: 'SELECTED_POINT',
    scenario: 'FEASIBLE_LOW_DETOUR',
    intendedOutcome: 'A corridor pickup with a compatible morning schedule; live routing decides feasibility.',
    pickupWindowMinutes: { earliest: 6 * 60 + 55, latest: 7 * 60 + 30 },
    arrivalWindowMinutes: { earliest: 8 * 60, latest: 9 * 60 },
    accessWalkMinutes: 4,
    egressWalkMinutes: 4,
  },
  {
    id: 'queens-rider-eli',
    name: 'Eli (synthetic rider)',
    pickupLabel: 'Hicksville LIRR station',
    pickup: { latitude: 40.76717491, longitude: -73.52853322 },
    pickupAccuracy: 'SELECTED_POINT',
    scenario: 'FEASIBLE_HIGHER_DETOUR',
    intendedOutcome: 'A second corridor pickup with a wider ready window; live routing decides its rank.',
    pickupWindowMinutes: { earliest: 7 * 60 + 10, latest: 7 * 60 + 45 },
    arrivalWindowMinutes: { earliest: 8 * 60 + 10, latest: 9 * 60 + 10 },
    accessWalkMinutes: 5,
    egressWalkMinutes: 4,
  },
  {
    id: 'queens-rider-nina',
    name: 'Nina (synthetic rider)',
    pickupLabel: 'Stony Brook LIRR station',
    pickup: { latitude: 40.92032252, longitude: -73.12854943 },
    pickupAccuracy: 'SELECTED_POINT',
    scenario: 'SCHEDULE_CONFLICT',
    intendedOutcome: 'The location is plausible, but the rider is not ready until after this driver should arrive.',
    pickupWindowMinutes: { earliest: 8 * 60 + 45, latest: 8 * 60 + 55 },
    arrivalWindowMinutes: { earliest: 9 * 60, latest: 9 * 60 + 45 },
    accessWalkMinutes: 2,
    egressWalkMinutes: 5,
  },
  {
    id: 'queens-rider-rowan',
    name: 'Rowan (synthetic rider)',
    pickupLabel: 'Port Jefferson LIRR station',
    pickup: { latitude: 40.9345531, longitude: -73.05250164 },
    pickupAccuracy: 'SELECTED_POINT',
    scenario: 'DETOUR_LIMIT',
    intendedOutcome: 'An inconvenient pickup intended to exercise the stricter live detour limit.',
    pickupWindowMinutes: { earliest: 7 * 60 + 30, latest: 8 * 60 + 30 },
    arrivalWindowMinutes: { earliest: 8 * 60 + 20, latest: 9 * 60 + 30 },
    accessWalkMinutes: 4,
    egressWalkMinutes: 4,
  },
  {
    id: 'queens-rider-sam',
    name: 'Sam (synthetic rider)',
    pickupLabel: 'Ronkonkoma station area — exact pickup not confirmed',
    pickup: { latitude: 40.80808613, longitude: -73.10594023 },
    pickupAccuracy: 'APPROXIMATE_AREA',
    scenario: 'UNCONFIRMED_PICKUP',
    intendedOutcome: 'Routing must remain unknown until a concrete public pickup is confirmed.',
    pickupWindowMinutes: { earliest: 7 * 60 + 20, latest: 8 * 60 + 20 },
    arrivalWindowMinutes: { earliest: 8 * 60 + 20, latest: 9 * 60 + 30 },
    accessWalkMinutes: 6,
    egressWalkMinutes: 4,
    skipLiveRouting: true,
  },
] as const;

function validMinute(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < 24 * 60;
}

export function validateQueensDriverTestConfig(config: QueensDriverTestConfig): string[] {
  const issues: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.localDate)) issues.push('Enter a date as YYYY-MM-DD.');
  else {
    try { localMinuteToEpochSeconds(config.localDate, 0, QUEENS_DRIVER_TEST_TIME_ZONE); } catch { issues.push('Enter a valid calendar date.'); }
  }
  if (!validMinute(config.departureEarliestMinutes) || !validMinute(config.departureLatestMinutes) || config.departureEarliestMinutes > config.departureLatestMinutes) issues.push('Enter an ordered driver departure window.');
  if (!validMinute(config.preferredDepartureMinutes) || config.preferredDepartureMinutes < config.departureEarliestMinutes || config.preferredDepartureMinutes > config.departureLatestMinutes) issues.push('Preferred departure must be inside the departure window.');
  if (!validMinute(config.arrivalEarliestMinutes) || !validMinute(config.arrivalLatestMinutes) || config.arrivalEarliestMinutes > config.arrivalLatestMinutes) issues.push('Enter an ordered campus arrival window.');
  if (!Number.isInteger(config.seatsRemaining) || config.seatsRemaining < 1) issues.push('Passenger seats must be a positive whole number.');
  if (!Number.isInteger(config.maxExtraDurationMinutes) || config.maxExtraDurationMinutes < 0) issues.push('The absolute detour limit must be zero or more whole minutes.');
  if (!Number.isFinite(config.maxExtraDurationPercent) || config.maxExtraDurationPercent < 0) issues.push('The percentage detour limit must be zero or more.');
  return issues;
}

export function createQueensDriverTestRiders(config: QueensDriverTestConfig): RiderDemoCandidate[] {
  const issues = validateQueensDriverTestConfig(config);
  if (issues.length > 0) throw new Error(issues.join(' '));
  const at = (minutes: number) => localMinuteToEpochSeconds(config.localDate, minutes, QUEENS_DRIVER_TEST_TIME_ZONE);
  const driver = {
    userId: 'queens-test-driver',
    occurrence: { localDate: config.localDate, direction: 'TO_CAMPUS' as const },
    departureWindow: { earliest: at(config.departureEarliestMinutes), latest: at(config.departureLatestMinutes) },
    campusArrivalWindow: { earliest: at(config.arrivalEarliestMinutes), latest: at(config.arrivalLatestMinutes) },
    preferredDeparture: at(config.preferredDepartureMinutes),
    seatsRemaining: config.seatsRemaining,
    maxExtraDurationSeconds: config.maxExtraDurationMinutes * 60,
    maxExtraDurationRatio: config.maxExtraDurationPercent / 100,
  };

  return syntheticRiders.map((rider) => {
    const input: PairEvaluationInput = {
      driver: structuredClone(driver),
      rider: {
        userId: rider.id,
        occurrence: { localDate: config.localDate, direction: 'TO_CAMPUS' },
        pickupWindow: { earliest: at(rider.pickupWindowMinutes.earliest), latest: at(rider.pickupWindowMinutes.latest) },
        destinationArrivalWindow: { earliest: at(rider.arrivalWindowMinutes.earliest), latest: at(rider.arrivalWindowMinutes.latest) },
        seatsRequested: 1,
        accessWalkSeconds: rider.accessWalkMinutes * 60,
        egressWalkSeconds: rider.egressWalkMinutes * 60,
        maxAccessWalkSeconds: 10 * 60,
        maxEgressWalkSeconds: 10 * 60,
        maxExtraInVehicleSeconds: 15 * 60,
      },
      anchors: {
        driverStart: { coordinate: { ...queensDriverTestStart }, accuracy: 'SELECTED_POINT' },
        riderPickup: { coordinate: { ...rider.pickup }, accuracy: rider.pickupAccuracy },
        campusDropoff: { coordinate: { ...queensDriverTestCampus.coordinate }, accuracy: 'SELECTED_POINT' },
      },
      facts: {
        driverSkipped: false, riderSkipped: false, driverRoleConflict: false,
        riderRoleConflict: false, driverCommitmentConflict: false, riderCommitmentConflict: false,
      },
      pickupServiceSeconds: QUEENS_DRIVER_TEST_PICKUP_SERVICE_SECONDS,
      travel: { startToCampus: { status: 'MISSING' }, startToPickup: { status: 'MISSING' }, pickupToCampus: { status: 'MISSING' } },
    };
    return {
      id: rider.id,
      name: rider.name,
      pickupLabel: rider.pickupLabel,
      pickup: { ...rider.pickup },
      pickupAccuracy: rider.pickupAccuracy,
      scenario: rider.scenario,
      intendedOutcome: rider.intendedOutcome,
      skipLiveRouting: rider.skipLiveRouting ?? false,
      input,
    };
  });
}
