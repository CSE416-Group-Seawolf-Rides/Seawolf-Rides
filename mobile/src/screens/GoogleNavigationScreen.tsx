import {
  AlternateRoutingStrategy,
  AudioGuidance,
  CameraPerspective,
  NavigationProvider,
  NavigationView,
  NavigationSessionStatus,
  RouteStatus,
  RoutingStrategy,
  TaskRemovedBehavior,
  TravelMode,
  useNavigation,
  type NavigationViewController,
  type TimeAndDistance,
} from '@googlemaps/react-native-navigation-sdk';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import {
  activateNavigation,
  arriveNavigation,
  beginNavigation,
  endNavigation,
  type GoogleNavigationRequest,
  type NavigationLifecycleState,
} from '../navigation/googleNavigation';
import { colors, radii, spacing } from '../theme';

interface GoogleNavigationScreenProps {
  onClose: () => void;
  request: GoogleNavigationRequest;
}

function formatDistance(meters: number): string {
  const miles = meters / 1609.344;
  return miles < 0.1 ? `${Math.round(meters)} m` : `${miles.toFixed(1)} mi`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

function sessionFailureMessage(status: NavigationSessionStatus): string {
  switch (status) {
    case NavigationSessionStatus.NOT_AUTHORIZED:
      return 'The Google API key is missing, restricted incorrectly, or not authorized for Navigation SDK.';
    case NavigationSessionStatus.TERMS_NOT_ACCEPTED:
      return 'Google Navigation terms must be accepted before navigation can start.';
    case NavigationSessionStatus.LOCATION_PERMISSION_MISSING:
      return 'Foreground location permission is required for navigation.';
    case NavigationSessionStatus.NETWORK_ERROR:
      return 'Google Navigation could not initialize because of a network error.';
    default:
      return 'Google Navigation could not initialize.';
  }
}

function routeFailureMessage(status: RouteStatus): string {
  switch (status) {
    case RouteStatus.NO_ROUTE_FOUND: return 'Google did not find a driving route to these stops.';
    case RouteStatus.NETWORK_ERROR: return 'Google could not calculate the route because of a network error.';
    case RouteStatus.QUOTA_CHECK_FAILED: return 'The Google project quota or billing check failed.';
    case RouteStatus.LOCATION_DISABLED: return 'Current GPS location is unavailable.';
    case RouteStatus.LOCATION_UNKNOWN: return 'Google could not resolve the current device location.';
    case RouteStatus.WAYPOINT_ERROR:
    case RouteStatus.INVALID_PLACE_ID:
    case RouteStatus.DUPLICATE_WAYPOINTS_ERROR:
      return 'One or more confirmed navigation stops are invalid.';
    case RouteStatus.ROUTE_CANCELED: return 'The Google route calculation was canceled.';
    default: return 'Google could not calculate the navigation route.';
  }
}

export function GoogleNavigationScreen({ onClose, request }: GoogleNavigationScreenProps) {
  return (
    <NavigationProvider
      taskRemovedBehavior={TaskRemovedBehavior.QUIT_SERVICE}
      termsAndConditionsDialogOptions={{
        title: 'Google Navigation terms',
        companyName: 'Seawolf Rides',
        uiParams: { acceptButtonTextColor: colors.accent, cancelButtonTextColor: colors.textMuted },
      }}
    >
      <NavigationSession onClose={onClose} request={request} />
    </NavigationProvider>
  );
}

function NavigationSession({ onClose, request }: GoogleNavigationScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    navigationController,
    removeAllListeners,
    setOnArrival,
    setOnLocationChanged,
    setOnRemainingTimeOrDistanceChanged,
    setOnReroutingRequestedByOffRoute,
    setOnRouteChanged,
  } = useNavigation();
  const [lifecycle, setLifecycle] = useState<NavigationLifecycleState>({ status: 'IDLE' });
  const [metrics, setMetrics] = useState<TimeAndDistance | null>(null);
  const [message, setMessage] = useState('Preparing Google Navigation…');
  const [waitingAtStop, setWaitingAtStop] = useState(false);
  const viewController = useRef<NavigationViewController | null>(null);
  const locationWaiter = useRef<(() => void) | null>(null);
  const started = useRef(false);
  const ended = useRef(false);

  const releaseResources = useCallback(async () => {
    if (ended.current) return;
    ended.current = true;
    locationWaiter.current = null;
    removeAllListeners();
    try { await navigationController.stopGuidance(); } catch {}
    try { await navigationController.clearDestinations(); } catch {}
    try { navigationController.setBackgroundLocationUpdatesEnabled(false); } catch {}
    try { navigationController.stopUpdatingLocation(); } catch {}
    try { navigationController.simulator.stopLocationSimulation(); } catch {}
    try { await navigationController.cleanup(); } catch {}
  }, [navigationController, removeAllListeners]);

  const finish = useCallback(async () => {
    setLifecycle((state) => endNavigation(state));
    setMessage('Ending navigation…');
    await releaseResources();
    onClose();
  }, [onClose, releaseResources]);

  useEffect(() => {
    setOnLocationChanged(() => locationWaiter.current?.());
    setOnRemainingTimeOrDistanceChanged((next) => setMetrics(next));
    setOnReroutingRequestedByOffRoute(() => setMessage('Off route. Google is recalculating…'));
    setOnRouteChanged(() => setMessage('Google route updated.'));
    setOnArrival((event) => {
      if (event.isFinalDestination === false) {
        setWaitingAtStop(true);
        setMessage(`Arrived at ${event.waypoint.title ?? 'the next stop'}. Continue when ready.`);
      } else {
        setLifecycle((state) => arriveNavigation(state));
        setMessage(`Arrived at ${request.destinationLabel}. End navigation when parked safely.`);
      }
    });
    return () => {
      void releaseResources();
    };
  }, [releaseResources, request.destinationLabel, setOnArrival, setOnLocationChanged, setOnRemainingTimeOrDistanceChanged, setOnReroutingRequestedByOffRoute, setOnRouteChanged]);

  const start = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setLifecycle((state) => beginNavigation(state));
    try {
      setMessage('Checking foreground location permission…');
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Location permission was denied. Allow foreground location, then retry.');
      if (!(await Location.hasServicesEnabledAsync())) throw new Error('Location services are unavailable. Turn on GPS, then retry.');
      // This verifies a fresh fix. It is intentionally not persisted or used as a preview origin;
      // Navigation SDK independently follows the live device location.
      await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

      setMessage('Review Google Navigation terms…');
      if (!(await navigationController.showTermsAndConditionsDialog())) {
        throw new Error('Google Navigation terms were not accepted.');
      }
      const sessionStatus = await navigationController.init();
      if (sessionStatus !== NavigationSessionStatus.OK) throw new Error(sessionFailureMessage(sessionStatus));

      navigationController.setBackgroundLocationUpdatesEnabled(false);
      navigationController.setAudioGuidanceType(
        AudioGuidance.VOICE_ALERTS_AND_GUIDANCE | AudioGuidance.BLUETOOTH_AUDIO,
      );
      navigationController.startUpdatingLocation();
      setMessage('Waiting for a live GPS fix…');
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          locationWaiter.current = null;
          reject(new Error('A fresh Google Navigation location was not available. Move outdoors and retry.'));
        }, 20_000);
        locationWaiter.current = () => {
          clearTimeout(timer);
          locationWaiter.current = null;
          resolve();
        };
      });

      setMessage('Google is calculating the driving route…');
      const routeStatus = await navigationController.setDestinations(
        request.waypoints.map((waypoint) => ({
          title: waypoint.label,
          position: { lat: waypoint.coordinate.latitude, lng: waypoint.coordinate.longitude },
          vehicleStopover: true,
        })),
        {
          routingOptions: {
            alternateRoutesStrategy: AlternateRoutingStrategy.SHOW_ONE,
            routingStrategy: RoutingStrategy.DEFAULT_BEST,
            travelMode: TravelMode.DRIVING,
          },
          displayOptions: { showDestinationMarkers: true },
        },
      );
      if (routeStatus !== RouteStatus.OK) throw new Error(routeFailureMessage(routeStatus));
      await navigationController.startGuidance();
      setLifecycle((state) => activateNavigation(state));
      setMessage('Google turn-by-turn guidance is active.');
      const currentMetrics = await navigationController.getCurrentTimeAndDistance();
      if (Number.isFinite(currentMetrics.meters) && Number.isFinite(currentMetrics.seconds)) {
        setMetrics(currentMetrics);
      }
      await viewController.current?.setFollowingPerspective(CameraPerspective.TILTED);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Navigation could not start.';
      setLifecycle({ status: 'ERROR', message: errorMessage });
      setMessage(errorMessage);
      await releaseResources();
    }
  }, [navigationController, releaseResources, request.waypoints]);

  useEffect(() => {
    const timer = setTimeout(() => { void start(); }, 0);
    return () => clearTimeout(timer);
  }, [start]);

  const retry = () => {
    // Initialization cleanup invalidates this native provider instance. Re-entering
    // the route creates a fresh provider and prevents duplicate sessions.
    onClose();
  };

  const continueToNextStop = async () => {
    if (!waitingAtStop) return;
    setWaitingAtStop(false);
    setMessage('Calculating the next confirmed leg…');
    const response = await navigationController.continueToNextDestination();
    if (response.routeStatus && response.routeStatus !== RouteStatus.OK) {
      setLifecycle({ status: 'ERROR', message: routeFailureMessage(response.routeStatus) });
      setMessage(routeFailureMessage(response.routeStatus));
    }
  };

  const isStarting = lifecycle.status === 'IDLE' || lifecycle.status === 'STARTING';
  return (
    <View style={styles.container}>
      <NavigationView
        footerEnabled
        headerEnabled
        myLocationEnabled
        onNavigationViewControllerCreated={(controller) => { viewController.current = controller; }}
        onRecenterButtonClick={() => { void viewController.current?.setFollowingPerspective(CameraPerspective.TILTED); }}
        recenterButtonEnabled
        reportIncidentButtonEnabled
        speedLimitIconEnabled
        speedometerEnabled
        style={styles.map}
        trafficEnabled
        trafficPromptsEnabled
        tripProgressBarEnabled
      />
      <View style={[styles.overlay, { top: insets.top + spacing.sm }]}>
        <Text accessibilityRole="header" numberOfLines={2} style={styles.destination}>{request.destinationLabel}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
        {metrics && lifecycle.status !== 'ERROR' && (
          <View style={styles.metrics}>
            <Text style={styles.metric}>{formatDistance(metrics.meters)}</Text>
            <Text style={styles.metric}>{formatDuration(metrics.seconds)}</Text>
            <Text style={styles.googleMetric}>Google route</Text>
          </View>
        )}
        {isStarting && <ActivityIndicator color={colors.accent} />}
        {waitingAtStop && <AppButton label="Continue to next stop" onPress={() => { void continueToNextStop(); }} />}
        {lifecycle.status === 'ERROR' && <AppButton label="Back to Map to retry" onPress={retry} variant="secondary" />}
        {lifecycle.status !== 'ERROR' && (
          <Pressable accessibilityRole="button" disabled={lifecycle.status === 'ENDING'} onPress={() => { void finish(); }} style={styles.endButton}>
            <Text style={styles.endButtonText}>End navigation</Text>
          </Pressable>
        )}
        <Text style={styles.disclaimer}>Foreground navigation only. Ending this session does not complete a carpool trip.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1 },
  map: { flex: 1 },
  overlay: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, elevation: 5, gap: spacing.sm, left: spacing.md, padding: spacing.md, position: 'absolute', right: spacing.md },
  destination: { color: colors.text, fontSize: 16, fontWeight: '800' },
  message: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  metrics: { flexDirection: 'row', gap: spacing.md },
  metric: { color: colors.text, fontSize: 13, fontWeight: '800' },
  googleMetric: { color: colors.success, fontSize: 12, fontWeight: '800' },
  endButton: { alignItems: 'center', borderColor: colors.error, borderRadius: radii.md, borderWidth: 1, minHeight: 44, justifyContent: 'center' },
  endButtonText: { color: colors.error, fontSize: 14, fontWeight: '800' },
  disclaimer: { color: colors.textMuted, fontSize: 10, lineHeight: 14 },
});
