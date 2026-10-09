export interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

export interface RoutingProviderIdentity {
  id: 'osrm';
  name: string;
  baseUrl: string;
}

export interface SnappedWaypoint {
  input: RouteCoordinate;
  snapped: RouteCoordinate;
  distanceMeters: number;
  name: string;
}

export interface RoadRoute {
  /** Ordered road geometry in the same direction as the requested coordinates. */
  geometry: RouteCoordinate[];
  distanceMeters: number;
  durationSeconds: number;
  provider: RoutingProviderIdentity;
  snappedWaypoints: SnappedWaypoint[];
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
  signal?: AbortSignal;
}

export interface RoutingAdapter {
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
