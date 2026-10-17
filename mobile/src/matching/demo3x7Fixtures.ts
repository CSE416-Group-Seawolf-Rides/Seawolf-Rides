import { getCampusDestinationMapLocation } from '../map/campusDestinations';
import type { StaticRouteEstimate } from './types';
import {
  DRIVER_OCCURRENCE_SCHEMA,
  DRIVER_OCCURRENCE_VERSION,
  RIDER_INTENT_SCHEMA,
  RIDER_INTENT_VERSION,
  type ConfirmedRoutePoint,
  type DriverOccurrenceV1,
  type MultiCarScenarioState,
  type RiderIntentV1,
} from '../rides/groupRideContracts';
import type { DriverOffer } from '../rides/rideModel';

export const DEMO3X7_NAMESPACE = 'demo3x7';
export const DEMO3X7_LOCAL_DATE = '2026-10-19';
export const DEMO3X7_TIME_ZONE = 'America/New_York';

export type Demo3x7NodeId = 'Q' | 'M' | 'H' | 'R' | 'S' | 'P' | 'C';
export type Demo3x7DriverKey = 'jordan' | 'morgan' | 'taylor';
export type Demo3x7RiderKey = 'ava' | 'ben' | 'chloe' | 'diego' | 'emi' | 'finn' | 'grace';

export const demo3x7Coordinates: Readonly<Record<Demo3x7NodeId, Readonly<{ latitude: number; longitude: number }>>> = {
  Q: { latitude: 40.69960817, longitude: -73.80852987 },
  M: { latitude: 40.74034743, longitude: -73.64086293 },
  H: { latitude: 40.76717491, longitude: -73.52853322 },
  R: { latitude: 40.80808613, longitude: -73.10594023 },
  S: { latitude: 40.92032252, longitude: -73.12854943 },
  P: { latitude: 40.93455310, longitude: -73.05250164 },
  C: { latitude: 40.9097068, longitude: -73.1269548 },
};

const matrixMinutes: Readonly<Record<Demo3x7NodeId, Readonly<Record<Demo3x7NodeId, number>>>> = {
  Q: { Q: 0, M: 10, H: 20, R: 30, S: 38, P: 55, C: 40 },
  M: { Q: 14, M: 0, H: 10, R: 20, S: 28, P: 45, C: 30 },
  H: { Q: 28, M: 14, H: 0, R: 10, S: 18, P: 35, C: 20 },
  R: { Q: 42, M: 28, H: 14, R: 0, S: 8, P: 25, C: 10 },
  S: { Q: 52, M: 38, H: 24, R: 10, S: 0, P: 22, C: 7 },
  P: { Q: 73, M: 59, H: 45, R: 31, S: 26, P: 0, C: 17 },
  C: { Q: 56, M: 42, H: 28, R: 14, S: 9, P: 15, C: 0 },
};

/** Synthetic directed estimate: distance is deliberately duration-minutes x 600 m. */
export function createDemo3x7TravelEstimate(
  from: Demo3x7NodeId,
  to: Demo3x7NodeId,
): StaticRouteEstimate {
  const minutes = matrixMinutes[from][to];
  return { status: 'AVAILABLE', durationSeconds: minutes * 60, distanceMeters: minutes * 600 };
}

export function createDemo3x7TravelMatrix(): Record<Demo3x7NodeId, Record<Demo3x7NodeId, StaticRouteEstimate>> {
  return Object.fromEntries((Object.keys(matrixMinutes) as Demo3x7NodeId[]).map((from) => [
    from,
    Object.fromEntries((Object.keys(matrixMinutes[from]) as Demo3x7NodeId[]).map((to) => [
      to,
      createDemo3x7TravelEstimate(from, to),
    ])) as Record<Demo3x7NodeId, StaticRouteEstimate>,
  ])) as Record<Demo3x7NodeId, Record<Demo3x7NodeId, StaticRouteEstimate>>;
}

export interface Demo3x7Fixture {
  state: MultiCarScenarioState;
  travelMatrix: Record<Demo3x7NodeId, Record<Demo3x7NodeId, StaticRouteEstimate>>;
  nodeByDriverOccurrenceId: Record<string, Demo3x7NodeId>;
  nodeByRiderIntentId: Partial<Record<string, Demo3x7NodeId>>;
}

let generationSequence = 0;

export function createDemo3x7Fixture(options: { generationId?: string } = {}): Demo3x7Fixture {
  generationSequence += 1;
  const generationId = options.generationId
    ?? `${DEMO3X7_NAMESPACE}-generation-${Date.now()}-${generationSequence}`;
  const campus = confirmedPoint('tabler-campus', 'Tabler Center', 'C');
  const offers = createOffers();
  const driverOccurrences = createDriverOccurrences(generationId, campus);
  const riderIntents = createRiderIntents(generationId, campus);
  return {
    state: {
      namespace: DEMO3X7_NAMESPACE,
      generationId,
      offers,
      driverOccurrences,
      riderIntents,
      pendingRequests: [],
      acceptedMemberships: [],
      combinedPlans: [],
    },
    travelMatrix: createDemo3x7TravelMatrix(),
    nodeByDriverOccurrenceId: Object.fromEntries(driverOccurrences.map((item) => [
      item.id,
      ({ jordan: 'Q', morgan: 'M', taylor: 'R' } as const)[driverKeyFromId(item.id)],
    ])),
    nodeByRiderIntentId: Object.fromEntries(riderIntents.flatMap((item) => {
      const key = riderKeyFromId(item.id);
      const node = ({ ava: 'M', ben: 'H', chloe: 'S', diego: 'R', emi: 'H', finn: 'P', grace: null } as const)[key];
      return node ? [[item.id, node]] : [];
    })),
  };
}

function createOffers(): DriverOffer[] {
  return [
    offer('jordan', 'Jordan — Queens', 'Jamaica LIRR station', 3, 8 * 60),
    offer('morgan', 'Morgan', 'Mineola LIRR station', 3, 8 * 60 + 10),
    offer('taylor', 'Taylor', 'Ronkonkoma LIRR station', 2, 8 * 60 + 20),
  ];
}

function offer(key: Demo3x7DriverKey, name: string, start: string, seats: number, pickupTime: number): DriverOffer {
  return {
    id: `${DEMO3X7_NAMESPACE}-offer-${key}-2026-10-19`,
    participantId: `${DEMO3X7_NAMESPACE}-person-${key}`,
    driverName: name,
    startAreaLabel: start,
    campusLot: 'tabler',
    days: ['mon'],
    pickupTime,
    arriveBy: 9 * 60,
    leaveAt: null,
    seatsLeft: seats,
    vehicle: `${key === 'jordan' ? 'Jordan' : name}'s synthetic demo car`,
    pickupSpot: 'Driver-specific confirmed public origin',
  };
}

function createDriverOccurrences(
  generationId: string,
  campus: ConfirmedRoutePoint,
): DriverOccurrenceV1[] {
  return [
    driverOccurrence('jordan', 'Q', 3, 7 * 60 + 55, 8 * 60 + 5, 8 * 60, 15 * 60, generationId, campus),
    driverOccurrence('morgan', 'M', 3, 8 * 60, 8 * 60 + 20, 8 * 60 + 10, 15 * 60, generationId, campus),
    driverOccurrence('taylor', 'R', 2, 8 * 60 + 10, 8 * 60 + 30, 8 * 60 + 20, 10 * 60, generationId, campus),
  ];
}

function driverOccurrence(
  key: Demo3x7DriverKey,
  startNode: Demo3x7NodeId,
  capacity: number,
  departureEarliest: number,
  departureLatest: number,
  preferredDeparture: number,
  absoluteDetourSeconds: number,
  generationId: string,
  campus: ConfirmedRoutePoint,
): DriverOccurrenceV1 {
  return {
    schema: DRIVER_OCCURRENCE_SCHEMA,
    version: DRIVER_OCCURRENCE_VERSION,
    id: `${DEMO3X7_NAMESPACE}-occurrence-${key}-2026-10-19-to-campus`,
    offerId: `${DEMO3X7_NAMESPACE}-offer-${key}-2026-10-19`,
    driverParticipantId: `${DEMO3X7_NAMESPACE}-person-${key}`,
    scenarioNamespace: DEMO3X7_NAMESPACE,
    generationId,
    contractRevision: `${DEMO3X7_NAMESPACE}-driver-contract-v1-${key}`,
    occurrence: { localDate: DEMO3X7_LOCAL_DATE, direction: 'TO_CAMPUS', timeZone: DEMO3X7_TIME_ZONE },
    passengerCapacity: capacity,
    start: confirmedPoint(`${startNode.toLowerCase()}-driver-start`, driverStartLabel(startNode), startNode),
    campusDropoff: { ...clonePoint(campus), campusLot: 'tabler' },
    departureWindow: epochWindow(departureEarliest, departureLatest),
    preferredDeparture: epoch(preferredDeparture),
    campusArrivalWindow: epochWindow(8 * 60 + 30, 9 * 60),
    maxExtraDurationSeconds: absoluteDetourSeconds,
    maxExtraDurationRatio: 0.5,
  };
}

function createRiderIntents(generationId: string, campus: ConfirmedRoutePoint): RiderIntentV1[] {
  return [
    riderIntent('ava', 'M', 1, 8 * 60 + 10, 8 * 60 + 12, generationId, campus),
    riderIntent('ben', 'H', 2, 8 * 60 + 20, 8 * 60 + 21, generationId, campus),
    riderIntent('chloe', 'S', 1, 8 * 60, 8 * 60 + 55, generationId, campus),
    riderIntent('diego', 'R', 1, 8 * 60, 8 * 60 + 45, generationId, campus),
    riderIntent('emi', 'H', 1, 9 * 60 + 10, 9 * 60 + 20, generationId, campus),
    riderIntent('finn', 'P', 1, 8 * 60, 8 * 60 + 55, generationId, campus),
    riderIntent('grace', null, 1, 8 * 60, 8 * 60 + 55, generationId, campus),
  ];
}

function riderIntent(
  key: Demo3x7RiderKey,
  pickupNode: Demo3x7NodeId | null,
  seats: number,
  pickupEarliest: number,
  pickupLatest: number,
  generationId: string,
  campus: ConfirmedRoutePoint,
): RiderIntentV1 {
  const pickup = pickupNode
    ? { status: 'CONFIRMED' as const, point: confirmedPoint(`${pickupNode.toLowerCase()}-${key}-pickup`, riderPickupLabel(pickupNode), pickupNode) }
    : {
        status: 'UNCONFIRMED' as const,
        areaLabel: 'Ronkonkoma area — exact pickup unconfirmed',
        approximateCoordinate: { latitude: demo3x7Coordinates.R.latitude + 0.006, longitude: demo3x7Coordinates.R.longitude - 0.006 },
      };
  return {
    schema: RIDER_INTENT_SCHEMA,
    version: RIDER_INTENT_VERSION,
    id: `${DEMO3X7_NAMESPACE}-intent-${key}-2026-10-19`,
    riderParticipantId: `${DEMO3X7_NAMESPACE}-person-${key}`,
    scenarioNamespace: DEMO3X7_NAMESPACE,
    generationId,
    intentRevision: `${DEMO3X7_NAMESPACE}-rider-intent-v1-${key}`,
    occurrence: { localDate: DEMO3X7_LOCAL_DATE, direction: 'TO_CAMPUS', timeZone: DEMO3X7_TIME_ZONE },
    availability: 'AVAILABLE',
    requestedSeats: seats,
    pickup,
    acceptedCampusDropoff: { ...clonePoint(campus), campusLot: 'tabler' },
    pickupWindow: epochWindow(pickupEarliest, pickupLatest),
    destinationArrivalWindow: epochWindow(8 * 60 + 30, 9 * 60),
    pickupServiceSeconds: 120,
    accessWalkSeconds: 5 * 60,
    egressWalkSeconds: 5 * 60,
    maxAccessWalkSeconds: 10 * 60,
    maxEgressWalkSeconds: 10 * 60,
    maxExtraInVehicleSeconds: 15 * 60,
  };
}

function confirmedPoint(pointId: string, label: string, node: Demo3x7NodeId): ConfirmedRoutePoint {
  return { pointId, label, coordinate: { ...demo3x7Coordinates[node] }, accuracy: 'SELECTED_POINT' };
}

function clonePoint(point: ConfirmedRoutePoint): ConfirmedRoutePoint {
  return { ...point, coordinate: { ...point.coordinate } };
}

function epoch(minutes: number): number {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const minute = String(minutes % 60).padStart(2, '0');
  return Date.parse(`${DEMO3X7_LOCAL_DATE}T${hours}:${minute}:00-04:00`) / 1000;
}

function epochWindow(earliest: number, latest: number) {
  return { earliest: epoch(earliest), latest: epoch(latest) };
}

function driverKeyFromId(id: string): Demo3x7DriverKey {
  return (['jordan', 'morgan', 'taylor'] as const).find((key) => id.includes(`-${key}-`))!;
}

function riderKeyFromId(id: string): Demo3x7RiderKey {
  return (['ava', 'ben', 'chloe', 'diego', 'emi', 'finn', 'grace'] as const).find((key) => id.includes(`-${key}-`))!;
}

function driverStartLabel(node: Demo3x7NodeId): string {
  return ({ Q: 'Jamaica LIRR station', M: 'Mineola LIRR station', R: 'Ronkonkoma LIRR station' } as Partial<Record<Demo3x7NodeId, string>>)[node]!;
}

function riderPickupLabel(node: Demo3x7NodeId): string {
  return ({ M: 'Mineola LIRR station public pickup', H: 'Hicksville LIRR station public pickup', R: 'Ronkonkoma LIRR station public pickup', S: 'Stony Brook LIRR station public pickup', P: 'Port Jefferson LIRR station public pickup' } as Partial<Record<Demo3x7NodeId, string>>)[node]!;
}

// Assert the shared campus anchor still agrees with the canonical app destination.
const canonicalTabler = getCampusDestinationMapLocation('tabler').coordinate;
if (canonicalTabler.latitude !== demo3x7Coordinates.C.latitude || canonicalTabler.longitude !== demo3x7Coordinates.C.longitude) {
  throw new Error('The demo3x7 Tabler fixture must match the canonical campus destination.');
}
