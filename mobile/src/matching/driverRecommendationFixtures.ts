import type { DriverRoutingProfile } from './driverRecommendations';
import type { DriverOffer } from '../rides/rideModel';

export const QUEENS_TEST_DRIVER_ID = 'queens-test-driver';

/**
 * Development-only normal-flow candidate. The station coordinate is the
 * Jamaica stop published in the MTA LIRR GTFS feed (stop_id 102, code JAM),
 * retrieved 2026-10-15 from https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip.
 */
export const queensTestDriverOffer: DriverOffer = {
  id: QUEENS_TEST_DRIVER_ID,
  driverName: 'Queens test driver',
  startAreaLabel: 'Jamaica LIRR station test origin',
  campusLot: 'lot40',
  days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  pickupTime: 7 * 60 + 55,
  arriveBy: 8 * 60 + 45,
  leaveAt: null,
  seatsLeft: 3,
  vehicle: 'Synthetic test vehicle',
  pickupSpot: 'Selected public meeting point',
};

export const queensTestDriverRoutingProfile: DriverRoutingProfile = {
  offerId: QUEENS_TEST_DRIVER_ID,
  driverStart: { latitude: 40.69960817, longitude: -73.80852987 },
  departureWindowMinutes: { earliest: 6 * 60 + 30, latest: 7 * 60 + 15 },
  campusArrivalWindowMinutes: { earliest: 8 * 60, latest: 9 * 60 + 30 },
  preferredDepartureMinutes: 6 * 60 + 45,
  maxExtraDurationSeconds: 25 * 60,
  maxExtraDurationRatio: 0.3,
  pickupServiceSeconds: 2 * 60,
  skippedDates: [],
  conflictDates: [],
};

/**
 * Synthetic routing metadata for the existing frontend-only driver offers.
 * Coordinates are selected public routing anchors, never inferred homes or
 * privacy-area centers, and are not exposed by recommendation UI.
 */
export const syntheticDriverRoutingProfiles: readonly DriverRoutingProfile[] = [
  profile('alex', 40.86318, -73.13077, 450, 480, 465, 500, 535, 12, 0.35),
  profile('sarah', 40.8584, -73.0996, 460, 495, 480, 510, 545, 10, 0.3),
  profile('priya', 40.8662, -73.0358, 475, 515, 495, 525, 560, 12, 0.35),
  profile('marcus', 40.9347, -73.0526, 420, 455, 435, 465, 510, 10, 0.25),
  profile('jenna', 40.8559, -73.2007, 520, 560, 540, 565, 605, 12, 0.3),
  profile('dan', 40.8178, -73.2082, 515, 555, 535, 565, 610, 15, 0.35),
  profile('omar', 40.8081, -73.1059, 450, 495, 475, 505, 555, 15, 0.35),
  profile('lena', 40.9294, -73.1026, 480, 525, 505, 515, 555, 10, 0.3),
  profile('jordan', 40.8815, -73.0057, 390, 440, 420, 445, 490, 15, 0.35),
  profile('hannah', 40.8429, -73.2929, 480, 535, 510, 540, 590, 15, 0.35),
] as const;

function profile(
  offerId: string,
  latitude: number,
  longitude: number,
  departureEarliest: number,
  departureLatest: number,
  preferredDeparture: number,
  arrivalEarliest: number,
  arrivalLatest: number,
  absoluteDetourMinutes: number,
  detourRatio: number,
): DriverRoutingProfile {
  return {
    offerId,
    driverStart: { latitude, longitude },
    departureWindowMinutes: { earliest: departureEarliest, latest: departureLatest },
    campusArrivalWindowMinutes: { earliest: arrivalEarliest, latest: arrivalLatest },
    preferredDepartureMinutes: preferredDeparture,
    maxExtraDurationSeconds: absoluteDetourMinutes * 60,
    maxExtraDurationRatio: detourRatio,
    pickupServiceSeconds: 2 * 60,
    skippedDates: [],
    conflictDates: [],
  };
}
