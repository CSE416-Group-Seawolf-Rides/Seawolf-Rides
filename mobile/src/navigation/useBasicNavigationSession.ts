import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { LatestRouteRequest } from '../routing/latestRouteRequest';
import { createOsrmRoutingAdapter } from '../routing/osrmAdapter';
import type { RoadRoute, RoutingResult } from '../routing/types';
import { remainingRouteWaypoints, type RouteNavigationRequest } from './routeNavigationRequest';
import {
  ResourceSlot,
  getNextInstruction,
  initialNavigationProgress,
  prepareNavigationRoute,
  updateNavigationProgress,
  type NavigationFix,
  type NavigationProgressState,
  type PreparedNavigationRoute,
} from './basicNavigationProgress';
import { createNavigationSimulation } from './basicNavigationSimulation';

export type BasicNavigationStatus =
  | 'STARTING'
  | 'ACTIVE'
  | 'PAUSED'
  | 'REROUTING'
  | 'REROUTE_FAILED'
  | 'ARRIVED'
  | 'ERROR'
  | 'ENDED';

interface TimerResource { remove(): void }

function failureMessage(result: Exclude<RoutingResult, { status: 'SUCCESS' }>): string {
  switch (result.code) {
    case 'NO_ROUTE': return 'OSRM reported no driving route through the remaining stops.';
    case 'NETWORK_ERROR': return 'The OSRM service could not be reached.';
    case 'TIMEOUT': return 'The OSRM route request timed out.';
    case 'CANCELLED': return 'The route request was cancelled.';
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

export interface BasicNavigationSession {
  currentFix: NavigationFix | null;
  end: () => void;
  error: string | null;
  nextInstruction: ReturnType<typeof getNextInstruction>;
  notice: string;
  preparedRoute: PreparedNavigationRoute | null;
  progress: NavigationProgressState | null;
  remainingDistanceMeters: number | null;
  remainingDurationSeconds: number | null;
  simulationLabel: string | null;
  startSimulation: () => void;
  status: BasicNavigationStatus;
}

export function useBasicNavigationSession(request: RouteNavigationRequest): BasicNavigationSession {
  const adapter = useMemo(() => createOsrmRoutingAdapter(), []);
  const latestRoute = useRef(new LatestRouteRequest());
  const locationResource = useRef(new ResourceSlot<Location.LocationSubscription>());
  const simulationResource = useRef(new ResourceSlot<TimerResource>());
  const watcherGeneration = useRef(0);
  const statusRef = useRef<BasicNavigationStatus>('STARTING');
  const preparedRef = useRef<PreparedNavigationRoute | null>(null);
  const progressRef = useRef<NavigationProgressState | null>(null);
  const waypointBaseIndex = useRef(0);
  const rerouteInFlight = useRef(false);
  const simulationIndex = useRef(0);
  const simulationMode = useRef(false);
  const mounted = useRef(true);
  const beginStarted = useRef(false);

  const [status, setStatusState] = useState<BasicNavigationStatus>('STARTING');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('Obtaining a fresh current location…');
  const [preparedRoute, setPreparedRoute] = useState<PreparedNavigationRoute | null>(null);
  const [progress, setProgress] = useState<NavigationProgressState | null>(null);
  const [currentFix, setCurrentFix] = useState<NavigationFix | null>(null);
  const [simulationLabel, setSimulationLabel] = useState<string | null>(null);

  const setStatus = useCallback((next: BasicNavigationStatus) => {
    statusRef.current = next;
    if (mounted.current) setStatusState(next);
  }, []);

  const stopLocationWatcher = useCallback(() => {
    watcherGeneration.current += 1;
    locationResource.current.clear();
  }, []);

  const stopSimulation = useCallback(() => {
    simulationResource.current.clear();
  }, []);

  const applyRoute = useCallback((route: RoadRoute, baseIndex: number, fix: NavigationFix) => {
    const nextPrepared = prepareNavigationRoute(route);
    let nextProgress = initialNavigationProgress(nextPrepared);
    nextProgress = updateNavigationProgress(nextPrepared, nextProgress, fix, Date.now());
    waypointBaseIndex.current = baseIndex;
    preparedRef.current = nextPrepared;
    progressRef.current = nextProgress;
    if (mounted.current) {
      setPreparedRoute(nextPrepared);
      setProgress(nextProgress);
    }
  }, []);

  const reroute = useCallback(async (fix: NavigationFix, progressAtRequest: NavigationProgressState) => {
    if (rerouteInFlight.current || statusRef.current === 'ENDED') return;
    const reachedCount = waypointBaseIndex.current + progressAtRequest.legIndex;
    const remaining = remainingRouteWaypoints(request, waypointBaseIndex.current, progressAtRequest.legIndex);
    if (remaining.length === 0) return;
    rerouteInFlight.current = true;
    setStatus('REROUTING');
    setNotice('Off route. Requesting a new OSRM route through the remaining stops…');
    const response = await latestRoute.current.run(adapter, [fix.coordinate, ...remaining.map((item) => item.coordinate)]);
    rerouteInFlight.current = false;
    if (!mounted.current || response.status === 'STALE') return;
    if (response.result.status === 'FAILURE') {
      setStatus('REROUTE_FAILED');
      setError(failureMessage(response.result));
      setNotice('Rerouting failed. The previous route remains visible but is not a valid replacement.');
      return;
    }
    applyRoute(response.result.route, reachedCount, fix);
    setError(null);
    if (AppState.currentState === 'active') {
      setStatus('ACTIVE');
      setNotice('Rerouted through the remaining stops. Estimate does not include live traffic.');
    } else {
      setStatus('PAUSED');
      setNotice('Reroute ready. Guidance remains paused while the app is in the background.');
    }
  }, [adapter, applyRoute, request, setStatus]);

  const processFix = useCallback((fix: NavigationFix, label?: string) => {
    if (!mounted.current || statusRef.current === 'ENDED') return;
    if (statusRef.current === 'PAUSED') return;
    setCurrentFix(fix);
    if (label) setSimulationLabel(label);
    const currentPrepared = preparedRef.current;
    const currentProgress = progressRef.current;
    if (!currentPrepared || !currentProgress) return;
    const next = updateNavigationProgress(currentPrepared, currentProgress, fix, Date.now());
    progressRef.current = next;
    setProgress(next);
    if (next.arrived) {
      stopLocationWatcher();
      stopSimulation();
      setStatus('ARRIVED');
      setNotice(`Arrived at ${request.destinationLabel}. End navigation when safe.`);
      return;
    }
    if (next.disposition === 'POOR_ACCURACY') {
      setNotice('GPS accuracy is too poor to advance guidance. Waiting for a better fix…');
    } else if (next.disposition === 'STALE') {
      setNotice('Ignoring a stale GPS fix.');
    } else if (next.disposition === 'IMPLAUSIBLE') {
      setNotice('Ignoring an implausible GPS jump.');
    } else if (next.offRoute) {
      setNotice('Sustained off-route movement detected.');
    } else if (statusRef.current !== 'REROUTING') {
      setStatus('ACTIVE');
      setNotice('Basic guidance active · estimated time, no live traffic.');
    }
    if (next.shouldReroute) void reroute(fix, next);
  }, [request.destinationLabel, reroute, setStatus, stopLocationWatcher, stopSimulation]);

  const startLocationWatcher = useCallback(async () => {
    stopLocationWatcher();
    const generation = watcherGeneration.current;
    try {
      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 1_000 },
        (location) => processFix(toFix(location)),
        (reason) => {
          if (mounted.current) {
            setError(reason);
            setNotice('Foreground location tracking failed.');
          }
        },
      );
      if (!mounted.current || generation !== watcherGeneration.current || simulationMode.current) {
        subscription.remove();
        return;
      }
      locationResource.current.replace(subscription);
    } catch (watchError) {
      if (mounted.current) {
        setError(watchError instanceof Error ? watchError.message : 'Unable to watch location.');
        setStatus('ERROR');
      }
    }
  }, [processFix, setStatus, stopLocationWatcher]);

  const begin = useCallback(async () => {
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Foreground location permission was denied.');
      if (!(await Location.hasServicesEnabledAsync())) throw new Error('Location services are unavailable.');
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      const fix = toFix(location);
      setCurrentFix(fix);
      setNotice('Requesting an OSRM route from the fresh GPS position…');
      const response = await latestRoute.current.run(adapter, [fix.coordinate, ...request.waypoints.map((item) => item.coordinate)]);
      if (!mounted.current || response.status === 'STALE') return;
      if (response.result.status === 'FAILURE') throw new Error(failureMessage(response.result));
      applyRoute(response.result.route, 0, fix);
      if (AppState.currentState === 'active') {
        setStatus('ACTIVE');
        setNotice('Basic guidance active · estimated time, no live traffic.');
        await startLocationWatcher();
      } else {
        setStatus('PAUSED');
        setNotice('Route ready. Guidance is paused while the app is in the background.');
      }
    } catch (startError) {
      if (!mounted.current) return;
      setError(startError instanceof Error ? startError.message : 'Basic navigation could not start.');
      setStatus('ERROR');
      setNotice('Basic navigation could not start.');
    }
  }, [adapter, applyRoute, request.waypoints, setStatus, startLocationWatcher]);

  const resume = useCallback(async () => {
    if (statusRef.current === 'ENDED' || simulationMode.current) return;
    try {
      setNotice('Refreshing location before resuming guidance…');
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      setStatus('ACTIVE');
      processFix(toFix(location));
      if (statusRef.current !== 'ARRIVED') {
        await startLocationWatcher();
        setStatus('ACTIVE');
      }
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : 'Could not resume location tracking.');
      setStatus('ERROR');
    }
  }, [processFix, setStatus, startLocationWatcher]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (beginStarted.current) return;
      beginStarted.current = true;
      void begin();
    }, 0);
    return () => clearTimeout(timer);
  }, [begin]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active' && ['ACTIVE', 'REROUTING', 'REROUTE_FAILED'].includes(statusRef.current)) {
        stopLocationWatcher();
        stopSimulation();
        setStatus('PAUSED');
        setNotice('Guidance paused while the app is in the background.');
      } else if (next === 'active' && statusRef.current === 'PAUSED') {
        if (simulationMode.current) setNotice('Simulation paused. Start it again to continue testing.');
        else void resume();
      }
    });
    return () => subscription.remove();
  }, [resume, setStatus, stopLocationWatcher, stopSimulation]);

  useEffect(() => {
    mounted.current = true;
    const routeRequests = latestRoute.current;
    return () => {
      mounted.current = false;
      routeRequests.cancel();
      stopLocationWatcher();
      stopSimulation();
    };
  }, [stopLocationWatcher, stopSimulation]);

  const startSimulation = useCallback(() => {
    if (!__DEV__ || !preparedRef.current || statusRef.current === 'ENDED') return;
    stopLocationWatcher();
    stopSimulation();
    simulationMode.current = true;
    simulationIndex.current = 0;
    const simulationRoute = preparedRef.current;
    const resetProgress = initialNavigationProgress(simulationRoute);
    progressRef.current = resetProgress;
    setProgress(resetProgress);
    const trace = createNavigationSimulation(simulationRoute, Date.now());
    setSimulationLabel('Simulation starting');
    setStatus('ACTIVE');
    setNotice('DEVELOPMENT SIMULATION · location is not from GPS.');
    const timer = setInterval(() => {
      const simulated = trace[simulationIndex.current];
      if (!simulated) {
        stopSimulation();
        return;
      }
      simulationIndex.current += 1;
      processFix({ ...simulated, timestampEpochMs: Date.now() }, simulated.label);
    }, 900);
    simulationResource.current.replace({ remove: () => clearInterval(timer) });
  }, [processFix, setStatus, stopLocationWatcher, stopSimulation]);

  const end = useCallback(() => {
    latestRoute.current.cancel();
    stopLocationWatcher();
    stopSimulation();
    simulationMode.current = false;
    setStatus('ENDED');
    setNotice('Basic navigation ended. No carpool trip was completed.');
  }, [setStatus, stopLocationWatcher, stopSimulation]);

  const nextInstruction = preparedRoute && progress ? getNextInstruction(preparedRoute, progress) : null;
  const remainingDistanceMeters = preparedRoute && progress
    ? Math.max(0, preparedRoute.route.distanceMeters - progress.alongRouteMeters)
    : null;
  const remainingDurationSeconds = preparedRoute && remainingDistanceMeters !== null && preparedRoute.route.distanceMeters > 0
    ? preparedRoute.route.durationSeconds * remainingDistanceMeters / preparedRoute.route.distanceMeters
    : null;

  return {
    currentFix,
    end,
    error,
    nextInstruction,
    notice,
    preparedRoute,
    progress,
    remainingDistanceMeters,
    remainingDurationSeconds,
    simulationLabel,
    startSimulation,
    status,
  };
}
