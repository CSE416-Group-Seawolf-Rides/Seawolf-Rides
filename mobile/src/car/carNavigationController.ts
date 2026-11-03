// Independent navigation controller for the car display.
//
// The phone's useBasicNavigationSession is a React hook tied to a mounted screen
// and pauses itself whenever the app leaves the foreground, so the car cannot
// share it. This controller reuses the same pure building blocks (OSRM adapter,
// route preparation and progress tracking) but owns its own GPS watcher and
// never pauses on AppState — while the car is connected the CarAppService runs
// a location foreground service that keeps this process alive and allowed to
// receive location.
import * as Location from 'expo-location';

import {
  ResourceSlot,
  getNextInstruction,
  initialNavigationProgress,
  prepareNavigationRoute,
  updateNavigationProgress,
  type NavigationFix,
  type NavigationProgressState,
  type PreparedNavigationRoute,
} from '../navigation/basicNavigationProgress';
import { LatestRouteRequest } from '../routing/latestRouteRequest';
import { createOsrmRoutingAdapter } from '../routing/osrmAdapter';
import type { RoadRoute, RouteCoordinate, RoutingResult } from '../routing/types';

export interface CarDestination {
  id: string;
  label: string;
  coordinate: RouteCoordinate;
}

export type CarNavStatus =
  | 'IDLE'
  | 'PLANNING'
  | 'PREVIEW'
  | 'ACTIVE'
  | 'REROUTING'
  | 'ARRIVED'
  | 'ERROR';

export interface CarNavSnapshot {
  status: CarNavStatus;
  error: string | null;
  destination: CarDestination | null;
  route: RoadRoute | null;
  prepared: PreparedNavigationRoute | null;
  progress: NavigationProgressState | null;
  fix: NavigationFix | null;
  nextInstruction: ReturnType<typeof getNextInstruction>;
  remainingDistanceMeters: number | null;
  remainingDurationSeconds: number | null;
}

const IDLE_SNAPSHOT: CarNavSnapshot = {
  status: 'IDLE',
  error: null,
  destination: null,
  route: null,
  prepared: null,
  progress: null,
  fix: null,
  nextInstruction: null,
  remainingDistanceMeters: null,
  remainingDurationSeconds: null,
};

function failureMessage(result: Extract<RoutingResult, { status: 'FAILURE' }>): string {
  switch (result.code) {
    case 'NO_ROUTE': return 'No driving route found.';
    case 'NETWORK_ERROR': return 'Route service unreachable.';
    case 'TIMEOUT': return 'Route request timed out.';
    default: return result.message;
  }
}

function toFix(location: Location.LocationObject): NavigationFix {
  return {
    coordinate: { latitude: location.coords.latitude, longitude: location.coords.longitude },
    accuracyMeters: location.coords.accuracy,
    speedMetersPerSecond: location.coords.speed,
    timestampEpochMs: location.timestamp,
  };
}

class CarNavigationController {
  private snapshot: CarNavSnapshot = IDLE_SNAPSHOT;
  private listeners = new Set<() => void>();
  private adapter = createOsrmRoutingAdapter();
  private latestRoute = new LatestRouteRequest();
  private watcher = new ResourceSlot<Location.LocationSubscription>();
  private watcherGeneration = 0;
  private rerouteInFlight = false;
  /** Bumped on every plan/end so late async results from an older request are dropped. */
  private session = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = (): CarNavSnapshot => this.snapshot;

  private set(patch: Partial<CarNavSnapshot>): void {
    const next = { ...this.snapshot, ...patch };
    if (next.prepared && next.progress) {
      next.nextInstruction = getNextInstruction(next.prepared, next.progress);
      const remaining = Math.max(0, next.prepared.route.distanceMeters - next.progress.alongRouteMeters);
      next.remainingDistanceMeters = remaining;
      next.remainingDurationSeconds = next.prepared.route.distanceMeters > 0
        ? next.prepared.route.durationSeconds * remaining / next.prepared.route.distanceMeters
        : 0;
    } else if (!next.prepared) {
      next.nextInstruction = null;
      next.remainingDistanceMeters = null;
      next.remainingDurationSeconds = null;
    }
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  private fail(message: string): void {
    this.set({ status: 'ERROR', error: message });
  }

  /** Fetches a fresh GPS fix and a route to `destination` for the preview screen. */
  async plan(destination: CarDestination): Promise<void> {
    this.stopWatching();
    this.latestRoute.cancel();
    const session = ++this.session;
    this.set({ ...IDLE_SNAPSHOT, status: 'PLANNING', destination });
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Location permission is needed. Grant it on the phone.');
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const fix = toFix(location);
      const response = await this.latestRoute.run(this.adapter, [fix.coordinate, destination.coordinate]);
      if (session !== this.session || response.status === 'STALE') return;
      if (response.result.status === 'FAILURE') throw new Error(failureMessage(response.result));
      const prepared = prepareNavigationRoute(response.result.route);
      this.set({
        status: 'PREVIEW',
        error: null,
        route: response.result.route,
        prepared,
        progress: initialNavigationProgress(prepared),
        fix,
      });
    } catch (error) {
      if (session !== this.session) return;
      this.fail(error instanceof Error ? error.message : 'Could not plan a route.');
    }
  }

  /** Begins guidance on the previewed route. */
  async start(): Promise<void> {
    if (this.snapshot.status !== 'PREVIEW' || !this.snapshot.prepared) return;
    const session = this.session;
    this.set({ status: 'ACTIVE' });
    await this.startWatching(session);
  }

  /** Ends guidance and returns to idle. */
  end(): void {
    this.session += 1;
    this.latestRoute.cancel();
    this.stopWatching();
    this.rerouteInFlight = false;
    this.set({ ...IDLE_SNAPSHOT });
  }

  private stopWatching(): void {
    this.watcherGeneration += 1;
    this.watcher.clear();
  }

  private async startWatching(session: number): Promise<void> {
    this.stopWatching();
    const generation = this.watcherGeneration;
    try {
      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 1_000 },
        (location) => this.onFix(toFix(location), session),
        (reason) => { if (session === this.session) this.fail(reason); },
      );
      if (session !== this.session || generation !== this.watcherGeneration) {
        subscription.remove();
        return;
      }
      this.watcher.replace(subscription);
    } catch (error) {
      if (session === this.session) this.fail(error instanceof Error ? error.message : 'Unable to watch location.');
    }
  }

  private onFix(fix: NavigationFix, session: number): void {
    const { prepared, progress, status } = this.snapshot;
    if (session !== this.session || !prepared || !progress) return;
    if (status !== 'ACTIVE' && status !== 'REROUTING') return;
    const next = updateNavigationProgress(prepared, progress, fix, Date.now());
    if (next.arrived) {
      this.stopWatching();
      this.set({ status: 'ARRIVED', progress: next, fix });
      return;
    }
    this.set({ progress: next, fix });
    if (next.shouldReroute) void this.reroute(fix, session);
  }

  private async reroute(fix: NavigationFix, session: number): Promise<void> {
    const destination = this.snapshot.destination;
    if (this.rerouteInFlight || !destination) return;
    this.rerouteInFlight = true;
    this.set({ status: 'REROUTING' });
    const response = await this.latestRoute.run(this.adapter, [fix.coordinate, destination.coordinate]);
    this.rerouteInFlight = false;
    if (session !== this.session || response.status === 'STALE') return;
    if (response.result.status === 'FAILURE') {
      // Keep the old route on screen; the next off-route window retries.
      this.set({ status: 'ACTIVE' });
      return;
    }
    const prepared = prepareNavigationRoute(response.result.route);
    const progress = updateNavigationProgress(prepared, initialNavigationProgress(prepared), fix, Date.now());
    this.set({ status: 'ACTIVE', route: response.result.route, prepared, progress, fix });
  }
}

/** Single shared instance — car templates and the map surface both read from it. */
export const carNavigation = new CarNavigationController();
