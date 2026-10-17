import type { RoadRoute } from './types';
import type { RouteEndpoint } from './routeEndpoint';

export type LocalRouteSession =
  | { status: 'IDLE' }
  | {
      status: 'ACTIVE';
      route: RoadRoute;
      start: RouteEndpoint;
      destination: RouteEndpoint;
      startedAtEpochMs: number;
    };

export const idleRouteSession: LocalRouteSession = { status: 'IDLE' };

export function startLocalRouteSession(
  session: LocalRouteSession,
  route: RoadRoute | null,
  start: RouteEndpoint | null,
  destination: RouteEndpoint | null,
  startedAtEpochMs = Date.now(),
): LocalRouteSession {
  if (session.status === 'ACTIVE' || !route || !start || !destination) return session;
  return { status: 'ACTIVE', route, start, destination, startedAtEpochMs };
}

export function endLocalRouteSession(_session: LocalRouteSession): LocalRouteSession {
  return idleRouteSession;
}
