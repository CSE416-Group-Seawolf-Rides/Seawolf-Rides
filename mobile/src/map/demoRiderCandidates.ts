import { type Coordinates, toPrivacyArea } from '../commute/commuteModel';
import { riderRequestFixtures } from '../rides/rideFixtures';
import type { RiderMapCandidate } from './riderMapModel';

// Demo-only source points keyed to existing rider fixture IDs. They are transformed
// through the same privacy boundary as real commute locations before leaving this file.
const demoRiderLocations = {
  dev: { latitude: 40.8584, longitude: -73.0996 },
  maya: { latitude: 40.8352, longitude: -73.1318 },
  chris: { latitude: 40.9126, longitude: -73.123 },
} satisfies Record<string, Coordinates>;

export function getDemoRiderCandidates(): RiderMapCandidate[] {
  return Object.entries(demoRiderLocations).flatMap(([id, location]) => {
    const rider = riderRequestFixtures.find((request) => request.id === id);
    return rider
      ? [
          {
            id: rider.id,
            name: rider.riderName,
            approximateArea: toPrivacyArea(location, rider.startAreaLabel),
          },
        ]
      : [];
  });
}
