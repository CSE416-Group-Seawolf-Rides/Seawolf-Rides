import type { CommuteSchedule } from '../commute/commuteModel';
import { getCampusDestinationMapLocation } from '../map/campusDestinations';
import { queensTestDriverRoutingProfile } from '../matching/driverRecommendationFixtures';
import {
  evaluateDriverRecommendations,
  type DriverRoutingProfile,
  type RiderRecommendationSetup,
} from '../matching/driverRecommendations';
import type { RoutingAdapter } from '../routing/types';
import {
  groupContractsFromDatedProposal,
  type MultiCarScenarioStoreData,
} from './groupAcceptance';
import { driverOccurrenceFromDatedProposal } from './groupRideContracts';
import type { DriverOccurrenceOverride, DriverOffer, IncomingRequest } from './rideModel';

export const FRIDAY_DRIVER_TEST_DATE = '2026-10-16';
export const FRIDAY_DRIVER_TEST_TIME_ZONE = 'America/New_York';
export const FRIDAY_DRIVER_TEST_PREFIX = 'friday-driver-test-';
export const FRIDAY_DRIVER_TEST_OCCURRENCE_ID = `${FRIDAY_DRIVER_TEST_PREFIX}2026-10-16-to-campus`;

const campus = getCampusDestinationMapLocation('tabler');

export const fridayDriverTestOffer: DriverOffer = {
  id: 'friday-current-demo-driver',
  driverName: 'Current demo driver',
  startAreaLabel: 'Jamaica, Queens — synthetic test origin',
  campusLot: 'tabler',
  days: ['fri'],
  pickupTime: 7 * 60,
  arriveBy: 10 * 60 + 30,
  leaveAt: null,
  seatsLeft: 3,
  vehicle: 'Current demo vehicle',
  pickupSpot: 'Each rider has a separate confirmed public pickup',
};

export const fridayDriverTestProfile: DriverRoutingProfile = {
  offerId: fridayDriverTestOffer.id,
  driverStart: { ...queensTestDriverRoutingProfile.driverStart },
  departureWindowMinutes: { earliest: 5 * 60 + 30, latest: 8 * 60 },
  campusArrivalWindowMinutes: { earliest: 7 * 60, latest: 10 * 60 + 30 },
  preferredDepartureMinutes: 6 * 60 + 15,
  maxExtraDurationSeconds: 90 * 60,
  maxExtraDurationRatio: 1,
  pickupServiceSeconds: 2 * 60,
  skippedDates: [],
  conflictDates: [],
};

interface FridayRiderFixture {
  id: 'ava' | 'ben' | 'chloe';
  name: string;
  area: string;
  seatsRequested: number;
  pickup: NonNullable<RiderRecommendationSetup['pickupPoint']>;
}

/**
 * Public station coordinates come from MTA LIRR GTFS stops.txt, retrieved
 * 2026-10-15 from https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip:
 * Mineola stop 132/MIN, Hicksville stop 92/HVL, Stony Brook stop 14/BK.
 */
export const fridayDriverTestRiders: readonly FridayRiderFixture[] = [
  {
    id: 'ava', name: 'Ava', area: 'Mineola station area', seatsRequested: 1,
    pickup: { id: 'mineola-lirr', label: 'Mineola LIRR station public pickup', coordinate: { latitude: 40.74034743, longitude: -73.64086293 } },
  },
  {
    id: 'ben', name: 'Ben', area: 'Hicksville station area', seatsRequested: 2,
    pickup: { id: 'hicksville-lirr', label: 'Hicksville LIRR station public pickup', coordinate: { latitude: 40.76717491, longitude: -73.52853322 } },
  },
  {
    id: 'chloe', name: 'Chloe', area: 'Stony Brook station area', seatsRequested: 1,
    pickup: { id: 'stony-brook-lirr', label: 'Stony Brook LIRR station public pickup', coordinate: { latitude: 40.92032252, longitude: -73.12854943 } },
  },
] as const;

export interface FridayDriverTestSuccess {
  status: 'SUCCESS';
  generationId: string;
  occurrence: DriverOccurrenceOverride;
  requests: IncomingRequest[];
}

let fridayGenerationSequence = 0;

export interface FridayDriverTestFailure {
  status: 'FAILURE';
  message: string;
}

export async function buildFridayDriverTest(options: {
  adapter: RoutingAdapter;
  driverId: string;
  evaluatedAtEpochSeconds?: number;
  signal?: AbortSignal;
}): Promise<FridayDriverTestSuccess | FridayDriverTestFailure> {
  fridayGenerationSequence += 1;
  const generationId = `${FRIDAY_DRIVER_TEST_PREFIX}generation-${Date.now()}-${fridayGenerationSequence}`;
  const occurrence: DriverOccurrenceOverride = {
    id: FRIDAY_DRIVER_TEST_OCCURRENCE_ID,
    driverId: options.driverId,
    localDate: FRIDAY_DRIVER_TEST_DATE,
    direction: 'TO_CAMPUS',
    timeZone: FRIDAY_DRIVER_TEST_TIME_ZONE,
    campusLot: fridayDriverTestOffer.campusLot,
    passengerCapacity: fridayDriverTestOffer.seatsLeft,
    source: 'DEVELOPMENT_TEST',
  };
  const requests: IncomingRequest[] = [];

  for (const rider of fridayDriverTestRiders) {
    const result = await evaluateDriverRecommendations({
      adapter: options.adapter,
      commute: riderCommute(),
      localDate: FRIDAY_DRIVER_TEST_DATE,
      timeZone: FRIDAY_DRIVER_TEST_TIME_ZONE,
      riderId: `${FRIDAY_DRIVER_TEST_PREFIX}${rider.id}`,
      driverId: options.driverId,
      offers: [fridayDriverTestOffer],
      profiles: [fridayDriverTestProfile],
      setup: riderSetup(rider),
      riderSkipped: false,
      riderCommitmentConflict: false,
      signal: options.signal,
      evaluatedAtEpochSeconds: options.evaluatedAtEpochSeconds,
    });
    const recommendation = result.recommendations[0];
    if (!recommendation?.proposal || recommendation.evaluation?.status !== 'FEASIBLE') {
      const reason = recommendation?.routingMessage
        ?? (recommendation?.evaluation && recommendation.evaluation.status !== 'FEASIBLE'
          ? recommendation.evaluation.reasonCodes.join(', ')
          : recommendation?.excludedReason ?? 'No evaluated proposal was returned.');
      return { status: 'FAILURE', message: `${rider.name} could not be loaded: ${reason}` };
    }
    requests.push({
      id: `${FRIDAY_DRIVER_TEST_PREFIX}${rider.id}`,
      participantId: `${FRIDAY_DRIVER_TEST_PREFIX}${rider.id}`,
      riderName: rider.name,
      startAreaLabel: `${rider.area} · synthetic`,
      campusLot: fridayDriverTestOffer.campusLot,
      days: ['fri'],
      arriveBy: 10 * 60 + 30,
      leaveAt: null,
      addedMinutes: Math.round(recommendation.evaluation.metrics.driverExtraDurationSeconds / 60),
      pickupSpot: rider.pickup.label,
      confirmedPickup: {
        coordinate: { ...rider.pickup.coordinate },
        label: rider.pickup.label,
        fixtureSource: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip',
      },
      pickupWindow: { earliest: 6 * 60, latest: 9 * 60 + 15 },
      pickupServiceSeconds: fridayDriverTestProfile.pickupServiceSeconds,
      note: `Synthetic Friday driver test · requests ${rider.seatsRequested} seat${rider.seatsRequested === 1 ? '' : 's'}.`,
      status: 'pending',
      proposal: recommendation.proposal,
    });
  }
  return { status: 'SUCCESS', generationId, occurrence, requests };
}

export function createFridayGroupStoreData(loaded: FridayDriverTestSuccess): MultiCarScenarioStoreData {
  const firstProposal = loaded.requests[0]?.proposal;
  if (!firstProposal) throw new Error('Friday group acceptance requires dated proposals.');
  const namespace = 'friday-driver-test';
  const driver = driverOccurrenceFromDatedProposal(firstProposal, {
    driverOccurrenceId: loaded.occurrence.id,
    scenarioNamespace: namespace,
    generationId: loaded.generationId,
    driverContractRevision: `${FRIDAY_DRIVER_TEST_PREFIX}driver-contract-v1`,
    passengerCapacity: loaded.occurrence.passengerCapacity,
  });
  const riderIntents = [];
  const pendingRequests = [];
  const pendingProposals = [];
  for (const request of loaded.requests) {
    if (!request.proposal) throw new Error('Friday group acceptance cannot invent a legacy proposal.');
    const adapted = groupContractsFromDatedProposal({
      proposal: request.proposal,
      requestId: request.id,
      driver,
      scenarioNamespace: namespace,
      generationId: loaded.generationId,
    });
    if (!adapted) throw new Error('Friday proposals do not share one authoritative driver contract.');
    riderIntents.push(adapted.intent);
    pendingRequests.push(adapted.request);
    pendingProposals.push(adapted.pendingProposal);
  }
  return {
    scenario: {
      namespace,
      generationId: loaded.generationId,
      offers: [fridayDriverTestOffer],
      driverOccurrences: [driver],
      riderIntents,
      pendingRequests,
      acceptedMemberships: [],
      combinedPlans: [],
    },
    pendingProposals,
    skippedDriverOccurrenceIds: [],
    cancelledRequestIds: [],
  };
}

export function isFridayDriverTestRequest(request: Pick<IncomingRequest, 'id'>): boolean {
  return request.id.startsWith(FRIDAY_DRIVER_TEST_PREFIX);
}

export function applyFridayDriverTestLoad(
  incoming: readonly IncomingRequest[],
  occurrences: readonly DriverOccurrenceOverride[],
  loaded: FridayDriverTestSuccess,
): { incoming: IncomingRequest[]; occurrences: DriverOccurrenceOverride[] } {
  return {
    incoming: [...incoming.filter((request) => !isFridayDriverTestRequest(request)), ...loaded.requests],
    occurrences: [...occurrences.filter((occurrence) => occurrence.id !== FRIDAY_DRIVER_TEST_OCCURRENCE_ID), loaded.occurrence],
  };
}

export function resetFridayDriverTestState(
  incoming: readonly IncomingRequest[],
  occurrences: readonly DriverOccurrenceOverride[],
): { incoming: IncomingRequest[]; occurrences: DriverOccurrenceOverride[] } {
  return {
    incoming: incoming.filter((request) => !isFridayDriverTestRequest(request)),
    occurrences: occurrences.filter((occurrence) => occurrence.id !== FRIDAY_DRIVER_TEST_OCCURRENCE_ID),
  };
}

function riderCommute(): CommuteSchedule {
  return {
    startArea: { center: { latitude: 40.8, longitude: -73.5 }, radiusMiles: 2, label: 'Synthetic privacy area' },
    campusLot: fridayDriverTestOffer.campusLot,
    days: [{ day: 'fri', mode: 'ride', arriveBy: 10 * 60 + 30, leaveAt: null }],
  };
}

function riderSetup(rider: FridayRiderFixture): RiderRecommendationSetup {
  return {
    pickupPoint: rider.pickup,
    pickupWindowMinutes: { earliest: 6 * 60, latest: 9 * 60 + 15 },
    destinationArrivalWindowMinutes: { earliest: 7 * 60 + 30, latest: 10 * 60 + 30 },
    seatsRequested: rider.seatsRequested,
    accessWalkSeconds: 5 * 60,
    egressWalkSeconds: 5 * 60,
    maxAccessWalkSeconds: 20 * 60,
    maxEgressWalkSeconds: 20 * 60,
    maxExtraInVehicleSeconds: 90 * 60,
  };
}

export const fridayDriverTestCampus = {
  label: campus.title,
  coordinate: { ...campus.coordinate },
};
