import {
  isValidRouteCoordinate,
  type RoadRoute,
  type RouteCoordinate,
  type RouteRequestOptions,
  type RoutingAdapter,
  type RoutingResult,
  type SnappedWaypoint,
} from './types';

export const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';
export const DEFAULT_OSRM_TIMEOUT_MS = 12_000;

interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

type FetchImplementation = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<FetchResponse>;

export interface OsrmAdapterOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImplementation?: FetchImplementation;
}

interface OsrmWaypoint {
  distance?: unknown;
  location?: unknown;
  name?: unknown;
}

interface OsrmRoute {
  distance?: unknown;
  duration?: unknown;
  geometry?: unknown;
}

interface OsrmResponse {
  code?: unknown;
  message?: unknown;
  routes?: unknown;
  waypoints?: unknown;
}

function failure(
  code: Exclude<RoutingResult, { status: 'SUCCESS' }>['code'],
  message: string,
  retryable: boolean,
): RoutingResult {
  return { status: 'FAILURE', code, message, retryable };
}

function normalizedBaseUrl(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !parsed.hostname) {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

function finiteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function parsePair(value: unknown): RouteCoordinate | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const coordinate = { longitude: value[0], latitude: value[1] };
  return isValidRouteCoordinate(coordinate) ? coordinate : null;
}

function parseGeometry(value: unknown): RouteCoordinate[] | null {
  if (!value || typeof value !== 'object') return null;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) return null;
  const parsed = geometry.coordinates.map(parsePair);
  if (parsed.length < 2 || parsed.some((coordinate) => coordinate === null)) return null;
  return parsed as RouteCoordinate[];
}

function parseWaypoints(
  value: unknown,
  inputs: readonly RouteCoordinate[],
): SnappedWaypoint[] | null {
  if (!Array.isArray(value) || value.length !== inputs.length) return null;

  const parsed = value.map((raw, index) => {
    if (!raw || typeof raw !== 'object') return null;
    const waypoint = raw as OsrmWaypoint;
    const snapped = parsePair(waypoint.location);
    if (!snapped || !finiteNonnegative(waypoint.distance)) return null;
    if (waypoint.name !== undefined && typeof waypoint.name !== 'string') return null;
    return {
      input: { ...inputs[index] },
      snapped,
      distanceMeters: waypoint.distance,
      name: waypoint.name ?? '',
    };
  });

  return parsed.some((waypoint) => waypoint === null) ? null : (parsed as SnappedWaypoint[]);
}

function mapSuccessfulResponse(
  body: OsrmResponse,
  inputs: readonly RouteCoordinate[],
  baseUrl: string,
): RoutingResult {
  if (!Array.isArray(body.routes) || body.routes.length === 0) {
    return failure('MALFORMED_RESPONSE', 'OSRM returned no route object.', true);
  }
  const rawRoute = body.routes[0] as OsrmRoute;
  const geometry = parseGeometry(rawRoute?.geometry);
  const snappedWaypoints = parseWaypoints(body.waypoints, inputs);
  if (
    !finiteNonnegative(rawRoute?.distance) ||
    !finiteNonnegative(rawRoute?.duration) ||
    !geometry ||
    !snappedWaypoints
  ) {
    return failure('MALFORMED_RESPONSE', 'OSRM returned malformed route data.', true);
  }

  const route: RoadRoute = {
    geometry,
    distanceMeters: rawRoute.distance,
    durationSeconds: rawRoute.duration,
    provider: { id: 'osrm', name: 'OSRM', baseUrl },
    snappedWaypoints,
  };
  return { status: 'SUCCESS', route };
}

export function createOsrmRoutingAdapter(options: OsrmAdapterOptions = {}): RoutingAdapter {
  const configuredBaseUrl = options.baseUrl ?? process.env.EXPO_PUBLIC_OSRM_BASE_URL ?? DEFAULT_OSRM_BASE_URL;
  const baseUrl = normalizedBaseUrl(configuredBaseUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_OSRM_TIMEOUT_MS;
  const fetchImplementation = options.fetchImplementation ?? fetch;

  return {
    async route(
      coordinates: readonly RouteCoordinate[],
      requestOptions: RouteRequestOptions = {},
    ): Promise<RoutingResult> {
      if (coordinates.length < 2) {
        return failure('INSUFFICIENT_WAYPOINTS', 'At least two ordered waypoints are required.', false);
      }
      if (!coordinates.every(isValidRouteCoordinate)) {
        return failure('INVALID_COORDINATES', 'Every waypoint must contain finite, in-range coordinates.', false);
      }
      if (!baseUrl || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return failure('CONFIGURATION_ERROR', 'The OSRM base URL or timeout is invalid.', false);
      }
      if (requestOptions.signal?.aborted) {
        return failure('CANCELLED', 'The route request was cancelled.', true);
      }

      const coordinatePath = coordinates
        .map(({ latitude, longitude }) => `${longitude},${latitude}`)
        .join(';');
      const url = `${baseUrl}/route/v1/driving/${coordinatePath}?overview=full&geometries=geojson&steps=false`;
      const controller = new AbortController();
      let timedOut = false;
      const cancelForCaller = () => controller.abort();
      requestOptions.signal?.addEventListener('abort', cancelForCaller, { once: true });
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      try {
        const response = await fetchImplementation(url, { signal: controller.signal });
        if (!response.ok) {
          return failure(
            'PROVIDER_ERROR',
            `OSRM returned HTTP ${response.status}.`,
            response.status >= 500 || response.status === 429,
          );
        }

        let body: unknown;
        try {
          body = await response.json();
        } catch {
          return failure('MALFORMED_RESPONSE', 'OSRM returned invalid JSON.', true);
        }
        if (!body || typeof body !== 'object') {
          return failure('MALFORMED_RESPONSE', 'OSRM returned an invalid response body.', true);
        }

        const osrmBody = body as OsrmResponse;
        if (typeof osrmBody.code !== 'string') {
          return failure('MALFORMED_RESPONSE', 'OSRM returned a response without a valid code.', true);
        }
        if (osrmBody.code === 'NoRoute') {
          return failure('NO_ROUTE', 'OSRM explicitly reported that no driving route exists.', false);
        }
        if (osrmBody.code !== 'Ok') {
          const detail = typeof osrmBody.message === 'string' ? ` ${osrmBody.message}` : '';
          return failure('PROVIDER_ERROR', `OSRM reported ${osrmBody.code}.${detail}`.trim(), false);
        }
        return mapSuccessfulResponse(osrmBody, coordinates, baseUrl);
      } catch (error) {
        if (timedOut) return failure('TIMEOUT', 'The OSRM request timed out.', true);
        if (requestOptions.signal?.aborted) {
          return failure('CANCELLED', 'The route request was cancelled.', true);
        }
        const detail = error instanceof Error ? ` ${error.message}` : '';
        return failure('NETWORK_ERROR', `The OSRM request failed.${detail}`.trim(), true);
      } finally {
        clearTimeout(timeout);
        requestOptions.signal?.removeEventListener('abort', cancelForCaller);
      }
    },
  };
}
