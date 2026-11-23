import { createPhotonGeocodingAdapter, DEFAULT_PHOTON_BASE_URL } from '../geocoding/photonAdapter';
import type { Coordinates } from './commuteModel';

// Browser version of startAreaGeocoder.ts. expo-location cannot geocode on the web, so
// this uses Photon (OpenStreetMap), the same free search the Map screen already uses.

type Fetch = (
  input: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const REVERSE_TIMEOUT_MS = 8_000;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function createWebStartAreaGeocoder(options: { baseUrl?: string; fetchImplementation?: Fetch } = {}) {
  const baseUrl = (
    options.baseUrl ?? process.env.EXPO_PUBLIC_GEOCODING_BASE_URL ?? DEFAULT_PHOTON_BASE_URL
  ).trim().replace(/\/+$/, '');
  const fetchImplementation: Fetch = options.fetchImplementation ?? fetch;
  const adapter = createPhotonGeocodingAdapter({ baseUrl, fetchImplementation });

  return {
    async findPlace(address: string): Promise<Coordinates | null> {
      const response = await adapter.search(address);
      if (response.status === 'FAILURE') throw new Error(response.message);
      const [first] = response.results;
      return first ? { latitude: first.coordinate.latitude, longitude: first.coordinate.longitude } : null;
    },

    async areaNameFor(center: Coordinates): Promise<string | null> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REVERSE_TIMEOUT_MS);
      try {
        const url = `${baseUrl}/reverse?lat=${center.latitude}&lon=${center.longitude}&lang=en&limit=1`;
        const response = await fetchImplementation(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) return null;
        const body = (await response.json()) as { features?: { properties?: Record<string, unknown> }[] };
        const properties = Array.isArray(body?.features) ? body.features[0]?.properties : undefined;
        if (!properties) return null;
        return text(properties.city) ?? text(properties.district) ?? text(properties.county);
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

const browserGeocoder = createWebStartAreaGeocoder();

/** First match for an address, or null when nothing matches. Throws when search fails. */
export const findPlace = (address: string) => browserGeocoder.findPlace(address);

/** Town-level name near a point, or null when unknown. Never throws. */
export const areaNameFor = (center: Coordinates) => browserGeocoder.areaNameFor(center);
