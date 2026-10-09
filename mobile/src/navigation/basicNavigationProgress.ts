import type { RoadRoute, RouteCoordinate, RouteStep } from '../routing/types';

const EARTH_RADIUS_METERS = 6_371_000;
const MAX_FIX_AGE_MS = 15_000;
const MAX_PROGRESS_ACCURACY_METERS = 100;
const MAX_OFF_ROUTE_ACCURACY_METERS = 75;
const OFF_ROUTE_FIX_COUNT = 3;
const REROUTE_INTERVAL_MS = 30_000;

export interface NavigationFix {
  coordinate: RouteCoordinate;
  accuracyMeters: number | null;
  speedMetersPerSecond: number | null;
  timestampEpochMs: number;
}

export interface NavigationInstruction {
  alongRouteMeters: number;
  legIndex: number;
  segmentIndex: number;
  step: RouteStep;
}

export interface PreparedNavigationRoute {
  route: RoadRoute;
  geometryCumulativeMeters: number[];
  geometryLengthMeters: number;
  instructions: NavigationInstruction[];
  legEndRouteMeters: number[];
}

export type FixDisposition = 'ACCEPTED' | 'STALE' | 'POOR_ACCURACY' | 'IMPLAUSIBLE';

export interface NavigationProgressState {
  alongRouteMeters: number;
  arrived: boolean;
  arrivalConfirmations: number;
  crossTrackDistanceMeters: number;
  disposition: FixDisposition;
  instructionIndex: number;
  instructionPassConfirmations: number;
  lastAcceptedFix: NavigationFix | null;
  lastRerouteRequestEpochMs: number | null;
  legIndex: number;
  offRoute: boolean;
  offRouteConfirmations: number;
  projectedCoordinate: RouteCoordinate;
  segmentIndex: number;
  shouldReroute: boolean;
}

interface Projection {
  alongGeometryMeters: number;
  coordinate: RouteCoordinate;
  distanceMeters: number;
  segmentIndex: number;
}

function radians(value: number): number {
  return value * Math.PI / 180;
}

export function distanceMeters(a: RouteCoordinate, b: RouteCoordinate): number {
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const dLat = lat2 - lat1;
  const dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function projectSegment(point: RouteCoordinate, a: RouteCoordinate, b: RouteCoordinate) {
  const referenceLat = radians(point.latitude);
  const scaleX = Math.cos(referenceLat) * Math.PI / 180 * EARTH_RADIUS_METERS;
  const scaleY = Math.PI / 180 * EARTH_RADIUS_METERS;
  const ax = (a.longitude - point.longitude) * scaleX;
  const ay = (a.latitude - point.latitude) * scaleY;
  const bx = (b.longitude - point.longitude) * scaleX;
  const by = (b.latitude - point.latitude) * scaleY;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
  const x = ax + fraction * dx;
  const y = ay + fraction * dy;
  return {
    coordinate: {
      latitude: a.latitude + (b.latitude - a.latitude) * fraction,
      longitude: a.longitude + (b.longitude - a.longitude) * fraction,
    },
    distanceMeters: Math.hypot(x, y),
    fraction,
  };
}

function allProjections(prepared: PreparedNavigationRoute, point: RouteCoordinate): Projection[] {
  const projections: Projection[] = [];
  for (let index = 0; index < prepared.route.geometry.length - 1; index += 1) {
    const segment = projectSegment(point, prepared.route.geometry[index], prepared.route.geometry[index + 1]);
    const segmentLength = prepared.geometryCumulativeMeters[index + 1] - prepared.geometryCumulativeMeters[index];
    projections.push({
      alongGeometryMeters: prepared.geometryCumulativeMeters[index] + segmentLength * segment.fraction,
      coordinate: segment.coordinate,
      distanceMeters: segment.distanceMeters,
      segmentIndex: index,
    });
  }
  return projections;
}

function routeMetersForGeometry(prepared: PreparedNavigationRoute, geometryMeters: number): number {
  if (prepared.geometryLengthMeters === 0) return 0;
  return geometryMeters / prepared.geometryLengthMeters * prepared.route.distanceMeters;
}

function sequentialSegmentIndex(
  prepared: PreparedNavigationRoute,
  point: RouteCoordinate,
  minimumSegmentIndex: number,
): number {
  const candidates = allProjections(prepared, point)
    .filter((candidate) => candidate.segmentIndex >= minimumSegmentIndex);
  return (candidates.length ? candidates : allProjections(prepared, point)).reduce((best, candidate) =>
    candidate.distanceMeters < best.distanceMeters ? candidate : best,
  ).segmentIndex;
}

export function prepareNavigationRoute(route: RoadRoute): PreparedNavigationRoute {
  const cumulative = [0];
  for (let index = 1; index < route.geometry.length; index += 1) {
    cumulative.push(cumulative[index - 1] + distanceMeters(route.geometry[index - 1], route.geometry[index]));
  }

  let alongRouteMeters = 0;
  let minimumSegmentIndex = 0;
  const instructions: NavigationInstruction[] = [];
  const legEndRouteMeters: number[] = [];
  route.legs.forEach((leg, legIndex) => {
    leg.steps.forEach((step) => {
      const segmentIndex = sequentialSegmentIndex(
        { route, geometryCumulativeMeters: cumulative, geometryLengthMeters: cumulative.at(-1) ?? 0, instructions: [], legEndRouteMeters: [] },
        step.maneuver.location,
        minimumSegmentIndex,
      );
      minimumSegmentIndex = segmentIndex;
      instructions.push({ alongRouteMeters, legIndex, segmentIndex, step });
      alongRouteMeters += step.distanceMeters;
    });
    legEndRouteMeters.push(route.legs.slice(0, legIndex + 1).reduce((sum, item) => sum + item.distanceMeters, 0));
  });

  return {
    route,
    geometryCumulativeMeters: cumulative,
    geometryLengthMeters: cumulative.at(-1) ?? 0,
    instructions,
    legEndRouteMeters,
  };
}

export function initialNavigationProgress(prepared: PreparedNavigationRoute): NavigationProgressState {
  const firstInstruction = Math.max(0, prepared.instructions.findIndex((item) => item.step.maneuver.type !== 'depart'));
  return {
    alongRouteMeters: 0,
    arrived: false,
    arrivalConfirmations: 0,
    crossTrackDistanceMeters: Number.POSITIVE_INFINITY,
    disposition: 'STALE',
    instructionIndex: firstInstruction,
    instructionPassConfirmations: 0,
    lastAcceptedFix: null,
    lastRerouteRequestEpochMs: null,
    legIndex: 0,
    offRoute: false,
    offRouteConfirmations: 0,
    projectedCoordinate: prepared.route.geometry[0],
    segmentIndex: 0,
    shouldReroute: false,
  };
}

function rejectFix(state: NavigationProgressState, disposition: FixDisposition): NavigationProgressState {
  return { ...state, disposition, shouldReroute: false };
}

export function updateNavigationProgress(
  prepared: PreparedNavigationRoute,
  state: NavigationProgressState,
  fix: NavigationFix,
  nowEpochMs: number,
): NavigationProgressState {
  const accuracy = Math.max(0, fix.accuracyMeters ?? 50);
  if (
    !Number.isFinite(fix.timestampEpochMs) ||
    fix.timestampEpochMs > nowEpochMs + 5_000 ||
    nowEpochMs - fix.timestampEpochMs > MAX_FIX_AGE_MS
  ) return rejectFix(state, 'STALE');
  if (!Number.isFinite(accuracy) || accuracy > MAX_PROGRESS_ACCURACY_METERS) {
    return rejectFix(state, 'POOR_ACCURACY');
  }

  if (state.lastAcceptedFix) {
    const elapsedSeconds = Math.max(0.25, (fix.timestampEpochMs - state.lastAcceptedFix.timestampEpochMs) / 1000);
    const observedDistance = distanceMeters(state.lastAcceptedFix.coordinate, fix.coordinate);
    const priorAccuracy = Math.max(0, state.lastAcceptedFix.accuracyMeters ?? 50);
    const maximumPlausibleDistance = elapsedSeconds * 70 + accuracy + priorAccuracy + 50;
    if (observedDistance > maximumPlausibleDistance) return rejectFix(state, 'IMPLAUSIBLE');
  }

  const candidates = allProjections(prepared, fix.coordinate);
  const nearest = candidates.reduce((best, candidate) => candidate.distanceMeters < best.distanceMeters ? candidate : best);
  let selected = nearest;
  if (state.lastAcceptedFix) {
    const elapsedSeconds = Math.max(0.25, (fix.timestampEpochMs - state.lastAcceptedFix.timestampEpochMs) / 1000);
    const speed = Math.max(0, fix.speedMetersPerSecond ?? state.lastAcceptedFix.speedMetersPerSecond ?? 0);
    const expected = state.alongRouteMeters + speed * elapsedSeconds;
    const maximumForward = Math.max(100, elapsedSeconds * 70 + accuracy * 2 + 50);
    const maximumBackward = Math.max(25, accuracy * 2);
    const plausible = candidates.filter((candidate) => {
      const along = routeMetersForGeometry(prepared, candidate.alongGeometryMeters);
      return along >= state.alongRouteMeters - maximumBackward && along <= state.alongRouteMeters + maximumForward;
    });
    if (plausible.length) {
      selected = plausible.reduce((best, candidate) => {
        const along = routeMetersForGeometry(prepared, candidate.alongGeometryMeters);
        const bestAlong = routeMetersForGeometry(prepared, best.alongGeometryMeters);
        const score = candidate.distanceMeters + Math.abs(along - expected) * 0.08 + Math.abs(candidate.segmentIndex - state.segmentIndex) * 0.3;
        const bestScore = best.distanceMeters + Math.abs(bestAlong - expected) * 0.08 + Math.abs(best.segmentIndex - state.segmentIndex) * 0.3;
        return score < bestScore ? candidate : best;
      });
    }
  }

  const candidateAlong = routeMetersForGeometry(prepared, selected.alongGeometryMeters);
  const alongRouteMeters = Math.max(state.alongRouteMeters, Math.min(prepared.route.distanceMeters, candidateAlong));
  let instructionIndex = state.instructionIndex;
  let instructionPassConfirmations = state.instructionPassConfirmations;
  const instruction = prepared.instructions[instructionIndex];
  if (
    instruction && instructionIndex < prepared.instructions.length - 1 &&
    alongRouteMeters >= instruction.alongRouteMeters + Math.max(8, accuracy * 0.5) &&
    selected.segmentIndex >= instruction.segmentIndex
  ) {
    instructionPassConfirmations += 1;
    if (instructionPassConfirmations >= 2) {
      instructionIndex += 1;
      instructionPassConfirmations = 0;
    }
  } else {
    instructionPassConfirmations = 0;
  }

  const offRouteThreshold = Math.max(35, accuracy * 1.75);
  const offRouteConfirmations = accuracy <= MAX_OFF_ROUTE_ACCURACY_METERS && nearest.distanceMeters > offRouteThreshold
    ? state.offRouteConfirmations + 1
    : 0;
  const offRoute = offRouteConfirmations >= OFF_ROUTE_FIX_COUNT;
  const rerouteAllowed = state.lastRerouteRequestEpochMs === null || nowEpochMs - state.lastRerouteRequestEpochMs >= REROUTE_INTERVAL_MS;
  const shouldReroute = offRoute && rerouteAllowed;

  const arrivalThreshold = Math.max(20, accuracy);
  const remainingMeters = Math.max(0, prepared.route.distanceMeters - alongRouteMeters);
  const arrivalConfirmations = remainingMeters <= arrivalThreshold && nearest.distanceMeters <= arrivalThreshold
    ? state.arrivalConfirmations + 1
    : 0;
  const arrived = arrivalConfirmations >= 2;
  const legIndex = Math.min(
    prepared.route.legs.length - 1,
    prepared.legEndRouteMeters.filter((end) => alongRouteMeters > end + 10).length,
  );

  return {
    ...state,
    alongRouteMeters,
    arrived,
    arrivalConfirmations,
    crossTrackDistanceMeters: nearest.distanceMeters,
    disposition: 'ACCEPTED',
    instructionIndex,
    instructionPassConfirmations,
    lastAcceptedFix: fix,
    lastRerouteRequestEpochMs: shouldReroute ? nowEpochMs : state.lastRerouteRequestEpochMs,
    legIndex,
    offRoute,
    offRouteConfirmations,
    projectedCoordinate: selected.coordinate,
    segmentIndex: selected.segmentIndex,
    shouldReroute,
  };
}

export function getNextInstruction(
  prepared: PreparedNavigationRoute,
  state: NavigationProgressState,
): { distanceMeters: number; instruction: NavigationInstruction } | null {
  const instruction = prepared.instructions[state.instructionIndex];
  if (!instruction) return null;
  return { distanceMeters: Math.max(0, instruction.alongRouteMeters - state.alongRouteMeters), instruction };
}

export function formatManeuver(step: RouteStep): string {
  const modifier = step.maneuver.modifier?.replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? '';
  switch (step.maneuver.type) {
    case 'depart': return 'Start';
    case 'arrive': return 'Arrive at destination';
    case 'turn': return modifier ? `Turn ${modifier}` : 'Turn';
    case 'continue': return modifier && modifier !== 'Straight' ? `Continue ${modifier}` : 'Continue straight';
    case 'merge': return modifier ? `Merge ${modifier}` : 'Merge';
    case 'on ramp': return modifier ? `Take the ramp ${modifier}` : 'Take the ramp';
    case 'off ramp': return modifier ? `Take the exit ${modifier}` : 'Take the exit';
    case 'fork': return modifier ? `Keep ${modifier}` : 'Keep at the fork';
    case 'roundabout':
    case 'rotary': return step.maneuver.exit ? `Take exit ${step.maneuver.exit} at the roundabout` : 'Enter the roundabout';
    case 'new name': return 'Continue';
    default: return modifier ? `Continue ${modifier}` : 'Continue';
  }
}

export interface RemovableResource { remove(): void }

export class ResourceSlot<T extends RemovableResource> {
  private resource: T | null = null;

  replace(next: T | null): void {
    this.resource?.remove();
    this.resource = next;
  }

  clear(): void {
    this.replace(null);
  }

  get active(): boolean {
    return this.resource !== null;
  }
}
