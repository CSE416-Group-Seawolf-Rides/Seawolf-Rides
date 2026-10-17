import type { Trip } from '../rides/rideModel';
import type { RideRouteContext } from '../routing/rideRouteContext';
import type { RouteCoordinate } from '../routing/types';

export interface RouteNavigationWaypoint {
  label: string;
  coordinate: RouteCoordinate;
}

export interface RouteNavigationRequest {
  destinationLabel: string;
  rideId?: string;
  mode: 'STANDALONE' | 'CONFIRMED_RIDE';
  /** Ordered confirmed stops followed by the final destination. */
  waypoints: RouteNavigationWaypoint[];
}

export type NavigationRequestResult =
  | { status: 'READY'; request: RouteNavigationRequest }
  | { status: 'BLOCKED'; code: 'DESTINATION_REQUIRED' | 'PICKUPS_UNCONFIRMED' | 'PICKUP_ORDER_UNCONFIRMED' | 'PICKUP_SCHEDULE_UNVERIFIED'; message: string };

export function buildConfirmedPickupNavigationRequest(options: {
  tripId: string;
  campus: RouteNavigationWaypoint;
  orderedPickups: RouteNavigationWaypoint[];
  acceptedRiderCount: number;
  orderConfirmed: boolean;
  scheduleStatus: 'INCOMPLETE' | 'CONFLICT' | 'VERIFIED';
}): NavigationRequestResult {
  if (options.orderedPickups.length !== options.acceptedRiderCount) return { status: 'BLOCKED', code: 'PICKUPS_UNCONFIRMED', message: 'Confirm every accepted rider pickup before starting navigation.' };
  if (!options.orderConfirmed) return { status: 'BLOCKED', code: 'PICKUP_ORDER_UNCONFIRMED', message: 'Confirm the proposed pickup order before starting navigation.' };
  if (options.scheduleStatus !== 'VERIFIED') return { status: 'BLOCKED', code: 'PICKUP_SCHEDULE_UNVERIFIED', message: options.scheduleStatus === 'CONFLICT' ? 'Resolve pickup schedule conflicts before starting navigation.' : 'Complete the pickup schedule before starting navigation.' };
  return { status: 'READY', request: { destinationLabel: options.campus.label, mode: 'CONFIRMED_RIDE', rideId: options.tripId, waypoints: [...options.orderedPickups, options.campus] } };
}

export function buildRouteNavigationRequest(
  destination: RouteNavigationWaypoint | null,
  rideContext: RideRouteContext,
  currentTrip: Trip | null,
): NavigationRequestResult {
  if (!destination) return { status: 'BLOCKED', code: 'DESTINATION_REQUIRED', message: 'Select a destination first.' };
  if (rideContext.status !== 'LOCKED') {
    return { status: 'READY', request: { destinationLabel: destination.label, mode: 'STANDALONE', waypoints: [destination] } };
  }
  const hasAcceptedRiders = currentTrip?.kind === 'drive' && (currentTrip.riders?.length ?? 0) > 0;
  if (hasAcceptedRiders && rideContext.stops.length === 0) {
    return {
      status: 'BLOCKED',
      code: 'PICKUPS_UNCONFIRMED',
      message: 'This drive has riders but no confirmed pickup coordinates. Navigation will not skip them.',
    };
  }
  return {
    status: 'READY',
    request: {
      destinationLabel: rideContext.destination.label,
      mode: 'CONFIRMED_RIDE',
      rideId: rideContext.rideId,
      waypoints: [
        ...rideContext.stops.map((stop) => ({ label: stop.label, coordinate: stop.coordinate })),
        { label: rideContext.destination.label, coordinate: rideContext.destination.coordinate },
      ],
    },
  };
}

export function encodeRouteNavigationRequest(request: RouteNavigationRequest): string {
  return JSON.stringify(request);
}

export function remainingRouteWaypoints(
  request: RouteNavigationRequest,
  routeWaypointBaseIndex: number,
  currentLegIndex: number,
): RouteNavigationWaypoint[] {
  const reachedCount = Math.max(0, Math.min(
    request.waypoints.length,
    Math.trunc(routeWaypointBaseIndex) + Math.trunc(currentLegIndex),
  ));
  return request.waypoints.slice(reachedCount);
}

export function decodeRouteNavigationRequest(value: unknown): RouteNavigationRequest | null {
  if (typeof value !== 'string') return null;
  try {
    const candidate = JSON.parse(value) as Partial<RouteNavigationRequest>;
    if (
      (candidate.mode !== 'STANDALONE' && candidate.mode !== 'CONFIRMED_RIDE') ||
      typeof candidate.destinationLabel !== 'string' ||
      !Array.isArray(candidate.waypoints) || candidate.waypoints.length === 0 ||
      candidate.waypoints.some((waypoint) =>
        !waypoint || typeof waypoint.label !== 'string' ||
        typeof waypoint.coordinate?.latitude !== 'number' || !Number.isFinite(waypoint.coordinate.latitude) ||
        waypoint.coordinate.latitude < -90 || waypoint.coordinate.latitude > 90 ||
        typeof waypoint.coordinate?.longitude !== 'number' || !Number.isFinite(waypoint.coordinate.longitude) ||
        waypoint.coordinate.longitude < -180 || waypoint.coordinate.longitude > 180
      )
    ) return null;
    return candidate as RouteNavigationRequest;
  } catch {
    return null;
  }
}
