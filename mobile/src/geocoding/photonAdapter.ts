import { isValidRouteCoordinate } from '../routing/types';
import type { GeocodingAdapter, GeocodingResponse, GeocodingResult } from './types';

export const DEFAULT_PHOTON_BASE_URL = 'https://photon.komoot.io';
const DEFAULT_TIMEOUT_MS = 8_000;

interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

type FetchImplementation = (
  input: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<FetchResponse>;

interface PhotonAdapterOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImplementation?: FetchImplementation;
}

function failure(
  code: Exclude<GeocodingResponse, { status: 'SUCCESS' }>['code'],
  message: string,
  retryable: boolean,
): GeocodingResponse {
  return { status: 'FAILURE', code, message, retryable };
}

function normalizeBaseUrl(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, '');
  try {
    const url = new URL(trimmed);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname ? trimmed : null;
  } catch {
    return null;
  }
}

function stringProperty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseFeature(value: unknown, index: number): GeocodingResult | null {
  if (!value || typeof value !== 'object') return null;
  const feature = value as { geometry?: unknown; properties?: unknown };
  if (!feature.geometry || typeof feature.geometry !== 'object') return null;
  const geometry = feature.geometry as { type?: unknown; coordinates?: unknown };
  if (geometry.type !== 'Point' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 2) {
    return null;
  }
  const coordinate = { longitude: geometry.coordinates[0], latitude: geometry.coordinates[1] };
  if (!isValidRouteCoordinate(coordinate) || !feature.properties || typeof feature.properties !== 'object') {
    return null;
  }
  const properties = feature.properties as Record<string, unknown>;
  const name = stringProperty(properties.name);
  const street = [stringProperty(properties.housenumber), stringProperty(properties.street)]
    .filter(Boolean)
    .join(' ');
  const label = name || street;
  if (!label) return null;
  const contextParts = [
    street && street !== label ? street : '',
    stringProperty(properties.city) || stringProperty(properties.county),
    stringProperty(properties.state),
    stringProperty(properties.postcode),
    stringProperty(properties.country),
  ].filter(Boolean);
  const osmType = stringProperty(properties.osm_type);
  const osmId = typeof properties.osm_id === 'number' || typeof properties.osm_id === 'string'
    ? String(properties.osm_id)
    : `${coordinate.latitude},${coordinate.longitude},${index}`;
  return {
    id: `${osmType || 'feature'}-${osmId}`,
    label,
    context: contextParts.join(', '),
    coordinate,
    provider: { id: 'photon', name: 'Photon / OpenStreetMap' },
  };
}

export function createPhotonGeocodingAdapter(options: PhotonAdapterOptions = {}): GeocodingAdapter {
  const configured = options.baseUrl ?? process.env.EXPO_PUBLIC_GEOCODING_BASE_URL ?? DEFAULT_PHOTON_BASE_URL;
  const baseUrl = normalizeBaseUrl(configured);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImplementation = options.fetchImplementation ?? fetch;

  return {
    async search(query, requestOptions = {}) {
      const trimmed = query.trim();
      if (trimmed.length < 3) return failure('INVALID_QUERY', 'Enter at least three characters.', false);
      if (!baseUrl || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return failure('CONFIGURATION_ERROR', 'The geocoding configuration is invalid.', false);
      }
      if (requestOptions.signal?.aborted) return failure('CANCELLED', 'Search was cancelled.', true);

      const url = `${baseUrl}/api/?q=${encodeURIComponent(trimmed)}&limit=5&lang=en&lat=40.9128&lon=-73.1235`;
      const controller = new AbortController();
      let timedOut = false;
      const cancel = () => controller.abort();
      requestOptions.signal?.addEventListener('abort', cancel, { once: true });
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        const response = await fetchImplementation(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) {
          return failure('PROVIDER_ERROR', `Photon returned HTTP ${response.status}.`, response.status >= 500 || response.status === 429);
        }
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          return failure('MALFORMED_RESPONSE', 'Photon returned invalid JSON.', true);
        }
        if (!body || typeof body !== 'object' || !Array.isArray((body as { features?: unknown }).features)) {
          return failure('MALFORMED_RESPONSE', 'Photon returned malformed search data.', true);
        }
        const parsed = (body as { features: unknown[] }).features
          .map(parseFeature)
          .filter((result): result is GeocodingResult => result !== null);
        return { status: 'SUCCESS', results: parsed };
      } catch (error) {
        if (timedOut) return failure('TIMEOUT', 'The place search timed out.', true);
        if (requestOptions.signal?.aborted) return failure('CANCELLED', 'Search was cancelled.', true);
        const detail = error instanceof Error ? ` ${error.message}` : '';
        return failure('NETWORK_ERROR', `Place search failed.${detail}`.trim(), true);
      } finally {
        clearTimeout(timeout);
        requestOptions.signal?.removeEventListener('abort', cancel);
      }
    },
  };
}
