export interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

export interface RoutingProviderIdentity {
  id: 'osrm' | 'tomtom';
  name: string;
  baseUrl: string;
}

export interface SnappedWaypoint {
  input: RouteCoordinate;
  snapped: RouteCoordinate;
  distanceMeters: number;
  name: string;
}

export interface RouteManeuver {
  /** OSRM may add maneuver identifiers; consumers must provide a generic fallback. */
  type: string;
  modifier: string | null;
  location: RouteCoordinate;
  bearingBefore: number | null;
  bearingAfter: number | null;
  exit: number | null;
}

export interface RouteStep {
  distanceMeters: number;
  durationSeconds: number;
  geometry: RouteCoordinate[];
  maneuver: RouteManeuver;
  name: string;
  reference: string;
}

export interface RouteLeg {
  distanceMeters: number;
  durationSeconds: number;
  summary: string;
  steps: RouteStep[];
}

export interface RoadRoute {
  /** Ordered road geometry in the same direction as the requested coordinates. */
  geometry: RouteCoordinate[];
  distanceMeters: number;
  durationSeconds: number;
  provider: RoutingProviderIdentity;
  /** Provider request time; a scheduled traffic forecast is not an observed future delay. */
  estimate?: {
    model: 'STATIC_ROAD' | 'TRAFFIC_FORECAST';
    computedAtEpochSeconds: number;
    departureEpochSeconds?: number;
  };
  snappedWaypoints: SnappedWaypoint[];
  /** Ordered legs between each supplied waypoint, including typed guidance steps. */
  legs: RouteLeg[];
}

export type RoutingFailureCode =
  | 'INVALID_COORDINATES'
  | 'INSUFFICIENT_WAYPOINTS'
  | 'NO_ROUTE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'CONFIGURATION_ERROR'
  | 'PROVIDER_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'CANCELLED';

export type RoutingResult =
  | { status: 'SUCCESS'; route: RoadRoute }
  | {
      status: 'FAILURE';
      code: RoutingFailureCode;
      message: string;
      retryable: boolean;
    };

export interface RouteRequestOptions {
  departureEpochSeconds?: number;
  /** Arrival-based suggestions use exactly one of arrival or departure. */
  arrivalEpochSeconds?: number;
  signal?: AbortSignal;
}

export interface RoutingAdapter {
  /** Requires a dated departure (matching) or arrival (onboarding suggestion). */
  timeDependent?: boolean;
  route(
    coordinates: readonly RouteCoordinate[],
    options?: RouteRequestOptions,
  ): Promise<RoutingResult>;
}

export function isValidRouteCoordinate(value: unknown): value is RouteCoordinate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RouteCoordinate>;
  return (
    typeof candidate.latitude === 'number' &&
    Number.isFinite(candidate.latitude) &&
    candidate.latitude >= -90 &&
    candidate.latitude <= 90 &&
    typeof candidate.longitude === 'number' &&
    Number.isFinite(candidate.longitude) &&
    candidate.longitude >= -180 &&
    candidate.longitude <= 180
  );
}

/** Maximum cached traffic forecast age; static road estimates have a separate policy. */
export const TRAFFIC_ESTIMATE_MAX_AGE_SECONDS = 120;
export function trafficForecastIsStale(
  estimate: { model: string; computedAtEpochSeconds: number } | undefined,
  now: number,
): boolean {
  return (
    estimate?.model === 'TRAFFIC_FORECAST' &&
    (!Number.isSafeInteger(estimate.computedAtEpochSeconds) ||
      !Number.isFinite(now) ||
      now - estimate.computedAtEpochSeconds >= TRAFFIC_ESTIMATE_MAX_AGE_SECONDS)
  );
}
