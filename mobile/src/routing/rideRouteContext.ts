import type { Trip } from '../rides/rideModel';
import { createLockedRideEndpoint, type RouteEndpoint } from './routeEndpoint';
import { isValidRouteCoordinate } from './types';

export type RideRouteContext =
  | { status: 'NONE' }
  | { status: 'UNCONFIRMED'; rideId: string; rideLabel: string }
  | {
      status: 'LOCKED';
      rideId: string;
      rideLabel: string;
      start: RouteEndpoint;
      stops: RouteEndpoint[];
      destination: RouteEndpoint;
    };

export function getRideRouteContext(trip: Trip | null): RideRouteContext {
  if (!trip || trip.whenLabel !== 'Today' || trip.skipped) return { status: 'NONE' };
  const rideLabel = trip.kind === 'ride'
    ? `Today's ride with ${trip.offer?.driverName ?? 'your driver'}`
    : `Today's drive with ${(trip.riders ?? []).map((rider) => rider.riderName).join(', ') || 'your riders'}`;
  const points = trip.routingPoints;
  if (
    !points?.confirmed ||
    !isValidRouteCoordinate(points.start.coordinate) ||
    !isValidRouteCoordinate(points.destination.coordinate) ||
    (points.stops?.some((stop) => !isValidRouteCoordinate(stop.coordinate)) ?? false)
  ) {
    return { status: 'UNCONFIRMED', rideId: trip.id, rideLabel };
  }
  return {
    status: 'LOCKED',
    rideId: trip.id,
    rideLabel,
    start: createLockedRideEndpoint(points.start.coordinate, points.start.label),
    stops: (points.stops ?? []).map((stop) =>
      createLockedRideEndpoint(stop.coordinate, stop.label),
    ),
    destination: createLockedRideEndpoint(points.destination.coordinate, points.destination.label),
  };
}
