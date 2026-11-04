// DEV-ONLY mock routing for the car display.
//
// Used by carNavigationController when __DEV__ is true and EXPO_PUBLIC_OSRM_BASE_URL is
// unset (no routing server available). It never touches the phone's routing or the OSRM
// public-demo guard. The route is a believable three-leg path (two turns) between the
// fix and the destination, with typed maneuvers, distance and ETA — not real road data.
import type {
  RoadRoute,
  RouteCoordinate,
  RouteManeuver,
  RouteStep,
  RoutingAdapter,
  RoutingResult,
} from '../routing/types';

const EARTH_RADIUS_METERS = 6_371_000;
/** Mock roads are not straight lines; inflate the crow-flies distance a little. */
const ROAD_FACTOR = 1.0;
/** ~25 mph campus driving. */
const SPEED_METERS_PER_SECOND = 11.2;
const POINT_SPACING_METERS = 60;

const toRad = (deg: number) => deg * Math.PI / 180;

function haversine(a: RouteCoordinate, b: RouteCoordinate): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function bearing(a: RouteCoordinate, b: RouteCoordinate): number {
  const y = Math.sin(toRad(b.longitude - a.longitude)) * Math.cos(toRad(b.latitude));
  const x = Math.cos(toRad(a.latitude)) * Math.sin(toRad(b.latitude))
    - Math.sin(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.cos(toRad(b.longitude - a.longitude));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** OSRM-style modifier for the change from `before` to `after` bearing. */
function turnModifier(before: number, after: number): string {
  const delta = ((after - before + 540) % 360) - 180; // -180..180, + = right
  const abs = Math.abs(delta);
  if (abs < 20) return 'straight';
  const side = delta > 0 ? 'right' : 'left';
  if (abs < 60) return `slight ${side}`;
  if (abs < 120) return side;
  if (abs < 160) return `sharp ${side}`;
  return 'uturn';
}

function interpolate(a: RouteCoordinate, b: RouteCoordinate): RouteCoordinate[] {
  const segments = Math.max(1, Math.round(haversine(a, b) / POINT_SPACING_METERS));
  const points: RouteCoordinate[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    points.push({
      latitude: a.latitude + (b.latitude - a.latitude) * t,
      longitude: a.longitude + (b.longitude - a.longitude) * t,
    });
  }
  return points;
}

const ROAD_NAMES = ['Nicolls Road', 'Engineering Drive', 'Circle Road'];

function buildRoute(origin: RouteCoordinate, destination: RouteCoordinate): RoadRoute {
  // Z-shaped path: drive along the latitude axis, cut across, then finish along latitude.
  const midLat = origin.latitude + (destination.latitude - origin.latitude) * 0.55;
  const corner1: RouteCoordinate = { latitude: midLat, longitude: origin.longitude };
  const corner2: RouteCoordinate = { latitude: midLat, longitude: destination.longitude };
  const waypoints = [origin, corner1, corner2, destination]
    // Drop degenerate legs (destination due north/south/east/west of the fix).
    .filter((point, index, all) => index === 0 || haversine(all[index - 1], point) > 15);
  if (waypoints.length < 2) waypoints.push({ latitude: origin.latitude + 0.0005, longitude: origin.longitude });

  const geometry: RouteCoordinate[] = [];
  const steps: RouteStep[] = [];
  let previousBearing: number | null = null;
  let totalMeters = 0;

  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    const points = interpolate(from, to);
    const legMeters = haversine(from, to) * ROAD_FACTOR;
    const heading = bearing(from, to);
    const maneuver: RouteManeuver = i === 0
      ? { type: 'depart', modifier: null, location: from, bearingBefore: null, bearingAfter: heading, exit: null }
      : {
          type: 'turn',
          modifier: turnModifier(previousBearing ?? heading, heading),
          location: from,
          bearingBefore: previousBearing,
          bearingAfter: heading,
          exit: null,
        };
    steps.push({
      distanceMeters: legMeters,
      durationSeconds: legMeters / SPEED_METERS_PER_SECOND,
      geometry: points,
      maneuver,
      name: ROAD_NAMES[i % ROAD_NAMES.length],
      reference: '',
    });
    geometry.push(...(geometry.length > 0 ? points.slice(1) : points));
    previousBearing = heading;
    totalMeters += legMeters;
  }

  steps.push({
    distanceMeters: 0,
    durationSeconds: 0,
    geometry: [destination],
    maneuver: {
      type: 'arrive',
      modifier: null,
      location: destination,
      bearingBefore: previousBearing,
      bearingAfter: null,
      exit: null,
    },
    name: '',
    reference: '',
  });

  const durationSeconds = totalMeters / SPEED_METERS_PER_SECOND;
  return {
    geometry,
    distanceMeters: totalMeters,
    durationSeconds,
    provider: { id: 'osrm', name: 'Dev mock route', baseUrl: 'dev-mock://car' },
    estimate: { model: 'STATIC_ROAD', computedAtEpochSeconds: Math.floor(Date.now() / 1000) },
    snappedWaypoints: [origin, destination].map((point) => ({
      input: point,
      snapped: point,
      distanceMeters: 0,
      name: '',
    })),
    legs: [{
      distanceMeters: totalMeters,
      durationSeconds,
      summary: ROAD_NAMES.slice(0, Math.max(1, waypoints.length - 1)).join(', '),
      steps,
    }],
  };
}

export function createDevMockRoutingAdapter(): RoutingAdapter {
  return {
    async route(coordinates): Promise<RoutingResult> {
      if (coordinates.length < 2) {
        return { status: 'FAILURE', code: 'INSUFFICIENT_WAYPOINTS', message: 'Two waypoints required.', retryable: false };
      }
      // Small delay so the "loading" route-preview state is visible, like a real request.
      await new Promise((resolve) => setTimeout(resolve, 400));
      return { status: 'SUCCESS', route: buildRoute(coordinates[0], coordinates[coordinates.length - 1]) };
    },
  };
}
