import { getCampusDestinationMapLocation } from '../map/campusDestinations';
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
import { DEMO3X7_LOCAL_DATE, DEMO3X7_NAMESPACE, DEMO3X7_TIME_ZONE, type Demo3x7DriverKey, type Demo3x7RiderKey } from './demo3x7Fixtures';

export type Demo3x7LiveStationKey = 'J' | 'M' | 'T' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

/** MTA LIRR GTFS stops.txt station points, retrieved 2026-10-16. */
export const DEMO3X7_LIVE_STATIONS: Readonly<Record<Demo3x7LiveStationKey, Readonly<{
  mtaStopId: string;
  name: string;
  coordinate: Readonly<{ latitude: number; longitude: number }>;
}>>> = {
  J: { mtaStopId: '102', name: 'Jamaica LIRR', coordinate: { latitude: 40.69960817, longitude: -73.80852987 } },
  M: { mtaStopId: '132', name: 'Mineola LIRR', coordinate: { latitude: 40.74034743, longitude: -73.64086293 } },
  T: { mtaStopId: '179', name: 'Ronkonkoma LIRR', coordinate: { latitude: 40.80808613, longitude: -73.10594023 } },
  A: { mtaStopId: '84', name: 'Hempstead LIRR', coordinate: { latitude: 40.71329663, longitude: -73.62503239 } },
  B: { mtaStopId: '92', name: 'Hicksville LIRR', coordinate: { latitude: 40.76717491, longitude: -73.52853322 } },
  C: { mtaStopId: '91', name: 'Huntington LIRR', coordinate: { latitude: 40.85300971, longitude: -73.40952576 } },
  D: { mtaStopId: '44', name: 'Deer Park LIRR', coordinate: { latitude: 40.76948364, longitude: -73.29356494 } },
  E: { mtaStopId: '29', name: 'Brentwood LIRR', coordinate: { latitude: 40.78083474, longitude: -73.24361074 } },
  F: { mtaStopId: '14', name: 'Stony Brook LIRR', coordinate: { latitude: 40.92032252, longitude: -73.12854943 } },
  G: { mtaStopId: '202', name: 'Smithtown LIRR', coordinate: { latitude: 40.85654755, longitude: -73.19803235 } },
};

const driverStations: Record<Demo3x7DriverKey, Demo3x7LiveStationKey> = { jordan: 'J', morgan: 'M', taylor: 'T' };
const riderStations: Record<Demo3x7RiderKey, Demo3x7LiveStationKey> = { ava: 'A', ben: 'B', chloe: 'C', diego: 'D', emi: 'E', finn: 'F', grace: 'G' };

let liveGenerationSequence = 0;

/** Predefined live-routing inputs. No routes, durations, rankings, or outcomes are stored here. */
export function createDemo3x7LiveScenario(options: { generationId?: string; localDate?: string } = {}): MultiCarScenarioState {
  liveGenerationSequence += 1;
  const localDate = options.localDate ?? DEMO3X7_LOCAL_DATE;
  const generationId = options.generationId ?? `${DEMO3X7_NAMESPACE}-live-generation-${Date.now()}-${liveGenerationSequence}`;
  const campusLocation = getCampusDestinationMapLocation('tabler');
  const campus: ConfirmedRoutePoint & { campusLot: 'tabler' } = {
    pointId: 'tabler-campus', label: campusLocation.title, coordinate: { ...campusLocation.coordinate },
    accuracy: 'SELECTED_POINT', campusLot: 'tabler',
  };
  const offers = createOffers(localDate);
  return {
    namespace: DEMO3X7_NAMESPACE,
    generationId,
    offers,
    driverOccurrences: createDrivers(generationId, localDate, campus),
    riderIntents: createRiders(generationId, localDate, campus),
    pendingRequests: [], acceptedMemberships: [], combinedPlans: [],
  };
}

function createOffers(localDate: string): DriverOffer[] {
  return [
    offer('jordan', 'Jordan — Queens', 3, 7 * 60 + 45, localDate),
    offer('morgan', 'Morgan', 3, 8 * 60, localDate),
    offer('taylor', 'Taylor', 2, 8 * 60 + 15, localDate),
  ];
}

function offer(key: Demo3x7DriverKey, name: string, seats: number, pickupTime: number, localDate: string): DriverOffer {
  const station = DEMO3X7_LIVE_STATIONS[driverStations[key]];
  return {
    id: `${DEMO3X7_NAMESPACE}-offer-${key}-${localDate}`, participantId: `${DEMO3X7_NAMESPACE}-person-${key}`,
    driverName: name, startAreaLabel: `${station.name} station`, campusLot: 'tabler', days: ['mon'],
    pickupTime, arriveBy: 9 * 60 + 30, leaveAt: null, seatsLeft: seats,
    vehicle: `${key === 'jordan' ? 'Jordan' : name}'s synthetic demo car`, pickupSpot: 'Confirmed public LIRR station point',
  };
}

function createDrivers(generationId: string, localDate: string, campus: ConfirmedRoutePoint & { campusLot: 'tabler' }): DriverOccurrenceV1[] {
  return [
    driver('jordan', 3, 7 * 60 + 15, 8 * 60 + 15, 7 * 60 + 45, generationId, localDate, campus),
    driver('morgan', 3, 7 * 60 + 30, 8 * 60 + 30, 8 * 60, generationId, localDate, campus),
    driver('taylor', 2, 7 * 60 + 45, 8 * 60 + 45, 8 * 60 + 15, generationId, localDate, campus),
  ];
}

function driver(key: Demo3x7DriverKey, capacity: number, earliest: number, latest: number, preferred: number,
  generationId: string, localDate: string, campus: ConfirmedRoutePoint & { campusLot: 'tabler' }): DriverOccurrenceV1 {
  const station = DEMO3X7_LIVE_STATIONS[driverStations[key]];
  return {
    schema: DRIVER_OCCURRENCE_SCHEMA, version: DRIVER_OCCURRENCE_VERSION,
    id: `${DEMO3X7_NAMESPACE}-occurrence-${key}-${localDate}-to-campus`, offerId: `${DEMO3X7_NAMESPACE}-offer-${key}-${localDate}`,
    driverParticipantId: `${DEMO3X7_NAMESPACE}-person-${key}`, scenarioNamespace: DEMO3X7_NAMESPACE,
    generationId, contractRevision: `${DEMO3X7_NAMESPACE}-live-driver-contract-v1-${key}`,
    occurrence: { localDate, direction: 'TO_CAMPUS', timeZone: DEMO3X7_TIME_ZONE }, passengerCapacity: capacity,
    start: stationPoint(`${key}-driver-start`, station), campusDropoff: clone(campus),
    departureWindow: window(localDate, earliest, latest), preferredDeparture: epoch(localDate, preferred),
    campusArrivalWindow: window(localDate, 8 * 60, 9 * 60 + 30),
    maxExtraDurationSeconds: 15 * 60,
    // Deliberately omit a percentage cap: total added elapsed time is governed by the 15-minute absolute cap.
  };
}

function createRiders(generationId: string, localDate: string, campus: ConfirmedRoutePoint & { campusLot: 'tabler' }): RiderIntentV1[] {
  return (['ava', 'ben', 'chloe', 'diego', 'emi', 'finn', 'grace'] as const).map((key) => rider(key, key === 'ben' ? 2 : 1, generationId, localDate, campus));
}

function rider(key: Demo3x7RiderKey, requestedSeats: number, generationId: string, localDate: string,
  campus: ConfirmedRoutePoint & { campusLot: 'tabler' }): RiderIntentV1 {
  const station = DEMO3X7_LIVE_STATIONS[riderStations[key]];
  return {
    schema: RIDER_INTENT_SCHEMA, version: RIDER_INTENT_VERSION,
    id: `${DEMO3X7_NAMESPACE}-intent-${key}-${localDate}`, riderParticipantId: `${DEMO3X7_NAMESPACE}-person-${key}`,
    scenarioNamespace: DEMO3X7_NAMESPACE, generationId, intentRevision: `${DEMO3X7_NAMESPACE}-live-rider-intent-v1-${key}`,
    occurrence: { localDate, direction: 'TO_CAMPUS', timeZone: DEMO3X7_TIME_ZONE }, availability: 'AVAILABLE', requestedSeats,
    pickup: { status: 'CONFIRMED', point: stationPoint(`${key}-pickup`, station) }, acceptedCampusDropoff: clone(campus),
    pickupWindow: window(localDate, 7 * 60 + 30, 9 * 60), destinationArrivalWindow: window(localDate, 8 * 60, 9 * 60 + 45),
    pickupServiceSeconds: 120, accessWalkSeconds: 5 * 60, egressWalkSeconds: 5 * 60,
    maxAccessWalkSeconds: 10 * 60, maxEgressWalkSeconds: 10 * 60, maxExtraInVehicleSeconds: 30 * 60,
  };
}

function stationPoint(pointId: string, station: (typeof DEMO3X7_LIVE_STATIONS)[Demo3x7LiveStationKey]): ConfirmedRoutePoint {
  return { pointId, label: `${station.name} public station point`, coordinate: { ...station.coordinate }, accuracy: 'SELECTED_POINT' };
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function window(localDate: string, earliest: number, latest: number) { return { earliest: epoch(localDate, earliest), latest: epoch(localDate, latest) }; }
function epoch(localDate: string, minutes: number): number {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const minute = String(minutes % 60).padStart(2, '0');
  return Date.parse(`${localDate}T${hours}:${minute}:00-04:00`) / 1000;
}
