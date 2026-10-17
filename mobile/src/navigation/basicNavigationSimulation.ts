import {
  type NavigationFix,
  type PreparedNavigationRoute,
  distanceMeters,
} from './basicNavigationProgress';
import type { RouteCoordinate } from '../routing/types';

export interface SimulatedNavigationFix extends NavigationFix {
  label: string;
}

function coordinateAtFraction(prepared: PreparedNavigationRoute, fraction: number): RouteCoordinate {
  const target = prepared.geometryLengthMeters * Math.max(0, Math.min(1, fraction));
  let index = 0;
  while (
    index < prepared.geometryCumulativeMeters.length - 2 &&
    prepared.geometryCumulativeMeters[index + 1] < target
  ) index += 1;
  const startDistance = prepared.geometryCumulativeMeters[index];
  const endDistance = prepared.geometryCumulativeMeters[index + 1];
  const segmentFraction = endDistance === startDistance ? 0 : (target - startDistance) / (endDistance - startDistance);
  const start = prepared.route.geometry[index];
  const end = prepared.route.geometry[index + 1];
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * segmentFraction,
    longitude: start.longitude + (end.longitude - start.longitude) * segmentFraction,
  };
}

function offsetEast(coordinate: RouteCoordinate, meters: number): RouteCoordinate {
  const longitudeMeters = 111_320 * Math.cos(coordinate.latitude * Math.PI / 180);
  return { ...coordinate, longitude: coordinate.longitude + meters / longitudeMeters };
}

function fix(
  prepared: PreparedNavigationRoute,
  fraction: number,
  timestampEpochMs: number,
  overrides: Partial<SimulatedNavigationFix> = {},
): SimulatedNavigationFix {
  return {
    accuracyMeters: 6,
    coordinate: coordinateAtFraction(prepared, fraction),
    label: 'On route',
    speedMetersPerSecond: 10,
    timestampEpochMs,
    ...overrides,
  };
}

/** A deterministic developer trace containing turns, noise, a poor fix, off-route fixes, and arrival. */
export function createNavigationSimulation(
  prepared: PreparedNavigationRoute,
  startEpochMs = 0,
): SimulatedNavigationFix[] {
  const interval = 2_000;
  const points: SimulatedNavigationFix[] = [];
  let tick = 0;
  const add = (fraction: number, overrides: Partial<SimulatedNavigationFix> = {}) => {
    points.push(fix(prepared, fraction, startEpochMs + tick * interval, overrides));
    tick += 1;
  };
  add(0, { label: 'Departure' });
  add(0.12);
  add(0.24, { coordinate: offsetEast(coordinateAtFraction(prepared, 0.24), 9), label: 'Noisy fix' });
  add(0.3, { accuracyMeters: 180, label: 'Poor accuracy (ignored)' });
  add(0.4);
  for (let count = 0; count < 3; count += 1) {
    add(0.52 + count * 0.005, {
      coordinate: offsetEast(coordinateAtFraction(prepared, 0.52 + count * 0.005), 90),
      label: 'Off route',
    });
  }
  add(0.58, { label: 'Back on route' });
  add(0.72);
  add(0.86);
  add(0.97);
  add(1, { label: 'Arrival confirmation 1', speedMetersPerSecond: 0 });
  add(1, { label: 'Arrival confirmation 2', speedMetersPerSecond: 0 });
  return points;
}

export function simulationCoversRoute(prepared: PreparedNavigationRoute): boolean {
  const simulation = createNavigationSimulation(prepared);
  return distanceMeters(simulation[0].coordinate, prepared.route.geometry[0]) < 1 &&
    distanceMeters(simulation.at(-1)!.coordinate, prepared.route.geometry.at(-1)!) < 1;
}
