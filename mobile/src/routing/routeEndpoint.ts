import type { RouteCoordinate } from './types';

export type RouteEndpointSource =
  | 'CURRENT_LOCATION'
  | 'SEARCH_RESULT'
  | 'MAP_SELECTION'
  | 'PRESET'
  | 'CONFIRMED_RIDE';

export interface RouteEndpoint {
  coordinate: RouteCoordinate;
  label: string;
  source: RouteEndpointSource;
  locked: boolean;
}

export function createRouteEndpoint(
  coordinate: RouteCoordinate,
  label: string,
  source: Exclude<RouteEndpointSource, 'CONFIRMED_RIDE'>,
): RouteEndpoint {
  return { coordinate: { ...coordinate }, label, source, locked: false };
}

export function createLockedRideEndpoint(
  coordinate: RouteCoordinate,
  label: string,
): RouteEndpoint {
  return { coordinate: { ...coordinate }, label, source: 'CONFIRMED_RIDE', locked: true };
}

export function canEditEndpoint(endpoint: RouteEndpoint | null): boolean {
  return endpoint?.locked !== true;
}

export function swapEditableEndpoints(
  start: RouteEndpoint | null,
  destination: RouteEndpoint | null,
): { start: RouteEndpoint | null; destination: RouteEndpoint | null; swapped: boolean } {
  if (!start || !destination || start.locked || destination.locked) {
    return { start, destination, swapped: false };
  }
  return {
    start: { ...destination, coordinate: { ...destination.coordinate } },
    destination: { ...start, coordinate: { ...start.coordinate } },
    swapped: true,
  };
}

export const routeEndpointSourceLabels: Record<RouteEndpointSource, string> = {
  CURRENT_LOCATION: 'Current GPS location',
  SEARCH_RESULT: 'Search result',
  MAP_SELECTION: 'Map selection',
  PRESET: 'Public preset',
  CONFIRMED_RIDE: 'Confirmed ride point',
};
