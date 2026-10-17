import type { RouteCoordinate } from '../routing/types';

export interface GeocodingResult {
  id: string;
  label: string;
  context: string;
  coordinate: RouteCoordinate;
  provider: { id: 'photon'; name: string };
}

export type GeocodingFailureCode =
  | 'INVALID_QUERY'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'CONFIGURATION_ERROR'
  | 'PROVIDER_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'CANCELLED';

export type GeocodingResponse =
  | { status: 'SUCCESS'; results: GeocodingResult[] }
  | { status: 'FAILURE'; code: GeocodingFailureCode; message: string; retryable: boolean };

export interface GeocodingAdapter {
  search(query: string, options?: { signal?: AbortSignal }): Promise<GeocodingResponse>;
}
