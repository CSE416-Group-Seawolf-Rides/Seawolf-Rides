import type { Coordinates } from '../commute/commuteModel';

// One tap hands the whole trip to the phone's maps app: from wherever you are now, through
// each pickup in order, to the campus lot. Apple's unified Maps URLs take repeated `waypoint`
// parameters; Google's take `waypoints` separated by "|" (3 on mobile browsers, 9 in the app).
export const GOOGLE_MOBILE_WAYPOINT_LIMIT = 3;

const point = (c: Coordinates) => `${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`;

export function tripDirectionsUrl(
  platform: 'ios' | 'android' | string,
  stops: Coordinates[],
  destination: Coordinates,
): string {
  if (platform === 'ios') {
    const params = new URLSearchParams();
    stops.forEach((stop) => params.append('waypoint', point(stop)));
    params.append('destination', point(destination));
    params.append('mode', 'driving');
    return `https://maps.apple.com/directions?${params.toString()}`;
  }
  const params = new URLSearchParams({ api: '1', destination: point(destination), travelmode: 'driving' });
  if (stops.length) params.append('waypoints', stops.map(point).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
