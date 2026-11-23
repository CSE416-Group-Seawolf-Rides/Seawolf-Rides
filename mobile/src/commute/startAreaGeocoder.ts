import * as Location from 'expo-location';

import type { Coordinates } from './commuteModel';

// Address lookup for the start-area step. Phones use the platform geocoder through
// expo-location; browsers use startAreaGeocoder.web.ts, because expo-location's web
// build cannot geocode.

/** First match for an address, or null when nothing matches. Throws when search fails. */
export async function findPlace(address: string): Promise<Coordinates | null> {
  const [result] = await Location.geocodeAsync(address);
  return result ? { latitude: result.latitude, longitude: result.longitude } : null;
}

/** Town-level name near a point, or null when unknown. Never throws. */
export async function areaNameFor(center: Coordinates): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync(center);
    return place?.city ?? place?.district ?? place?.subregion ?? null;
  } catch {
    return null;
  }
}
