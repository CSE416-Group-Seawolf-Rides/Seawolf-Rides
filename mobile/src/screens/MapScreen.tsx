import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Circle, Marker, type Camera, type MapPressEvent } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CommuteSchedule } from '../commute/commuteModel';
import { METERS_PER_MILE } from '../commute/commuteModel';
import { AppButton } from '../components/AppButton';
import { LatestGeocodingSearch } from '../geocoding/latestGeocodingSearch';
import { createPhotonGeocodingAdapter } from '../geocoding/photonAdapter';
import type { GeocodingResult } from '../geocoding/types';
import { getCampusDestinationMapLocation } from '../map/campusDestinations';
import type { RiderMapCandidate } from '../map/riderMapModel';
import { queensTestDriverRoutingProfile } from '../matching/driverRecommendationFixtures';
import { parseClockMinutes } from '../matching/driverRecommendations';
import {
  buildConfirmedPickupNavigationRequest,
  buildRouteNavigationRequest,
  type RouteNavigationRequest,
} from '../navigation/routeNavigationRequest';
import { getRuntimeGoogleNavigationAvailability } from '../navigation/googleNavigationRuntime';
import { participantIdForRequest } from '../profiles/publicProfiles';
import type { Trip } from '../rides/rideModel';
import { RoadRouteLayers, type EndpointSelection } from '../routing/components/RouteMap';
import { LatestRouteRequest } from '../routing/latestRouteRequest';
import { createOsrmRoutingAdapter } from '../routing/osrmAdapter';
import {
  canEditEndpoint,
  createRouteEndpoint,
  routeEndpointSourceLabels,
  swapEditableEndpoints,
  type RouteEndpoint,
} from '../routing/routeEndpoint';
import { getRideRouteContext } from '../routing/rideRouteContext';
import {
  endLocalRouteSession,
  idleRouteSession,
  startLocalRouteSession,
  type LocalRouteSession,
} from '../routing/routeSession';
import { routePresets } from '../routing/routePresets';
import {
  buildTripPickupManifest,
  calculateTripPickupRoute,
  evaluateTripPickupSchedule,
  LatestTripPickupRouteRequest,
  type TripPickupRouteResult,
} from '../routing/tripPickupRoute';
import type { RoadRoute, RoutingResult } from '../routing/types';
import { colors, radii, spacing } from '../theme';

interface MapScreenProps {
  commute: CommuteSchedule | null;
  currentTrip: Trip | null;
  pickupRouteTrip?: Trip | null;
  onClearPickupRoute?: () => void;
  onOpenCarpoolMatchingDemo?: () => void;
  onOpenDriverTest?: () => void;
  onOpenMatchingDiagnostics?: () => void;
  onOpenRoutePlanner?: () => void;
  onOpenProfile?: (participantId: string, displayName: string) => void;
  fridayDriverTest?: { status: 'IDLE' | 'LOADING' | 'LOADED' | 'ERROR'; message: string | null };
  onLoadFridayDriverTest?: () => Promise<void>;
  onResetFridayDriverTest?: () => void;
  onStartBasicNavigation: (request: RouteNavigationRequest) => void;
  onStartNavigation: (request: RouteNavigationRequest) => void;
  riders: RiderMapCandidate[];
}

type CurrentLocationState = 'IDLE' | 'LOADING' | 'DENIED' | 'UNAVAILABLE' | 'ERROR' | 'SELECTED';

const STONY_BROOK_REGION = {
  latitude: 40.9128,
  longitude: -73.1235,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};
const SEARCH_DEBOUNCE_MS = 450;

function formatDistance(meters: number): string {
  const miles = meters / 1609.344;
  return miles < 0.1 ? `${Math.round(meters)} m` : `${miles.toFixed(1)} mi`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function formatEpochTime(epochSeconds: number | undefined): string {
  if (epochSeconds === undefined) return 'unavailable';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).format(new Date(epochSeconds * 1000));
}

function routingFailureMessage(result: Exclude<RoutingResult, { status: 'SUCCESS' }>): string {
  switch (result.code) {
    case 'NO_ROUTE': return 'The provider reported no driving route for these points.';
    case 'NETWORK_ERROR': return 'The routing service could not be reached.';
    case 'TIMEOUT': return 'The route request timed out.';
    case 'CONFIGURATION_ERROR': return 'Routing is not configured correctly.';
    case 'MALFORMED_RESPONSE': return 'The provider returned unusable route data.';
    case 'PROVIDER_ERROR': return 'The routing provider returned an error.';
    case 'CANCELLED': return 'The route request was cancelled.';
    default: return result.message;
  }
}

export function MapScreen({ commute, currentTrip, pickupRouteTrip = null, fridayDriverTest, onClearPickupRoute, onLoadFridayDriverTest, onOpenCarpoolMatchingDemo, onOpenDriverTest, onOpenMatchingDiagnostics, onOpenRoutePlanner, onOpenProfile, onResetFridayDriverTest, onStartBasicNavigation, onStartNavigation, riders }: MapScreenProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const expandedMapRef = useRef<MapView>(null);
  const savedMapCamera = useRef<Camera | null>(null);
  const mapExpansionTransition = useRef(false);
  const routeAdapter = useMemo(() => createOsrmRoutingAdapter(), []);
  const geocodingAdapter = useMemo(() => createPhotonGeocodingAdapter(), []);
  const latestRoute = useRef(new LatestRouteRequest());
  const latestPickupRoute = useRef(new LatestTripPickupRouteRequest());
  const latestSearch = useRef(new LatestGeocodingSearch());
  const locationRequestGeneration = useRef(0);
  const navigationLaunchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rideContext = useMemo(() => getRideRouteContext(currentTrip), [currentTrip]);
  const initialCampus = pickupRouteTrip?.routingPoints?.destination
    ? {
        id: `trip-${pickupRouteTrip.id}-destination`,
        title: pickupRouteTrip.routingPoints.destination.label,
        subtitle: 'Agreed trip destination',
        coordinate: pickupRouteTrip.routingPoints.destination.coordinate,
      }
    : pickupRouteTrip ? getCampusDestinationMapLocation(pickupRouteTrip.campusLot) : commute ? getCampusDestinationMapLocation(commute.campusLot) : null;
  const pickupManifest = useMemo(() => pickupRouteTrip ? buildTripPickupManifest(pickupRouteTrip) : null, [pickupRouteTrip]);

  const [selection, setSelection] = useState<EndpointSelection>('start');
  const [start, setStart] = useState<RouteEndpoint | null>(() =>
    rideContext.status === 'LOCKED' ? rideContext.start : null,
  );
  const [destination, setDestination] = useState<RouteEndpoint | null>(() =>
    pickupRouteTrip && initialCampus
      ? { ...createRouteEndpoint(initialCampus.coordinate, initialCampus.title, 'PRESET'), locked: true }
      : rideContext.status === 'LOCKED'
      ? rideContext.destination
      : initialCampus
        ? createRouteEndpoint(initialCampus.coordinate, initialCampus.title, 'PRESET')
        : null,
  );
  const [routeResult, setRouteResult] = useState<RoutingResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [notice, setNotice] = useState(() =>
    rideContext.status === 'LOCKED'
      ? 'Confirmed ride endpoints are locked. Get the route when ready.'
      : rideContext.status === 'UNCONFIRMED'
        ? 'Confirm a separate standalone route before choosing exact points.'
        : 'Select endpoints, then get a road route.',
  );
  const [standaloneConfirmed, setStandaloneConfirmed] = useState(pickupRouteTrip !== null || rideContext.status !== 'UNCONFIRMED');
  const [locationLoading, setLocationLoading] = useState(false);
  const [navigationLaunching, setNavigationLaunching] = useState(false);
  const [developerToolsExpanded, setDeveloperToolsExpanded] = useState(false);
  const [currentLocationState, setCurrentLocationState] = useState<CurrentLocationState>('IDLE');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [session, setSession] = useState<LocalRouteSession>(idleRouteSession);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [expandedInitialCamera, setExpandedInitialCamera] = useState<Camera | null>(null);
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [pickupRouteResult, setPickupRouteResult] = useState<TripPickupRouteResult | null>(null);
  const [pickupOrderConfirmed, setPickupOrderConfirmed] = useState(false);
  const [plannedDeparture, setPlannedDeparture] = useState(() => {
    const proposal = pickupRouteTrip?.proposal ?? pickupRouteTrip?.riders?.find((rider) => rider.proposal)?.proposal;
    if (!proposal) return '';
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: proposal.occurrence.timeZone,
    }).format(new Date(proposal.routingEstimates.plan.departure * 1000));
  });
  const [pickupRouteError, setPickupRouteError] = useState<string | null>(null);

  const active = session.status === 'ACTIVE';
  const displayedRoute: RoadRoute | null = active
    ? session.route
    : pickupRouteResult?.route ?? (routeResult?.status === 'SUCCESS'
      ? routeResult.route
      : null);
  const displayedStart = active ? session.start : start;
  const displayedDestination = active ? session.destination : destination;
  const selectedEndpoint = selection === 'start' ? start : destination;
  const selectedEndpointEditable = canEditEndpoint(selectedEndpoint) && !active && standaloneConfirmed;
  const startEndpointEditable = canEditEndpoint(start) && !active && standaloneConfirmed;
  const queensStartDisabledReason = active
    ? 'End the active route before changing its start.'
    : start?.locked
      ? 'This confirmed ride has a locked start point.'
      : null;
  const navigationAvailability = getRuntimeGoogleNavigationAvailability();
  const standardNavigationRequest = buildRouteNavigationRequest(
    destination ? { label: destination.label, coordinate: destination.coordinate } : null,
    rideContext,
    currentTrip,
  );
  const departureMinutes = plannedDeparture.trim() === '' ? null : parseClockMinutes(plannedDeparture);
  const pickupSchedule = pickupRouteTrip && pickupRouteResult
    ? evaluateTripPickupSchedule({ trip: pickupRouteTrip, result: pickupRouteResult, departureMinutes })
    : null;
  const pickupOrderReady = pickupRouteResult?.orderKind === 'AGREED' || pickupOrderConfirmed;
  const displayedPickupStops = pickupRouteResult?.orderedStops ?? pickupManifest?.stops ?? [];
  const navigationRequest = pickupRouteTrip && pickupManifest
    ? buildConfirmedPickupNavigationRequest({
        tripId: pickupRouteTrip.id,
        campus: pickupManifest.campus,
        orderedPickups: pickupRouteResult?.orderedStops.map((stop) => ({ label: `${stop.riderName} pickup`, coordinate: stop.coordinate })) ?? [],
        acceptedRiderCount: pickupManifest.acceptedRiderIds.length,
        orderConfirmed: pickupOrderReady,
        scheduleStatus: pickupSchedule?.status ?? 'INCOMPLETE',
      })
    : standardNavigationRequest;

  useEffect(() => () => {
    latestRoute.current.cancel();
    latestPickupRoute.current.cancel();
    latestSearch.current.cancel();
    if (navigationLaunchTimer.current) clearTimeout(navigationLaunchTimer.current);
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 3 || !selectedEndpointEditable) return;
    const timer = setTimeout(async () => {
      const response = await latestSearch.current.run(geocodingAdapter, text);
      if (response.status === 'STALE') return;
      setSearching(false);
      if (response.response.status === 'FAILURE') {
        if (response.response.code !== 'CANCELLED') setSearchError(response.response.message);
        return;
      }
      setSearchResults(response.response.results);
      if (response.response.results.length === 0) setSearchError('No places found. Try a more specific search.');
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [geocodingAdapter, query, selectedEndpointEditable, selection]);

  useEffect(() => {
    if (!displayedRoute) return;
    mapRef.current?.fitToCoordinates(displayedRoute.geometry, {
      animated: true,
      edgePadding: { top: panelExpanded ? 440 : 180, right: 50, bottom: 90, left: 50 },
    });
  }, [displayedRoute, panelExpanded]);

  const invalidateRoute = (message: string) => {
    latestRoute.current.cancel();
    latestPickupRoute.current.cancel();
    setRouteLoading(false);
    setRouteResult(null);
    setPickupRouteResult(null);
    setPickupOrderConfirmed(false);
    setPickupRouteError(null);
    setNotice(message);
  };

  const selectEndpoint = (endpoint: RouteEndpoint) => {
    if (!selectedEndpointEditable) return;
    locationRequestGeneration.current += 1;
    setLocationLoading(false);
    setCurrentLocationState((state) => state === 'LOADING'
      ? (start?.source === 'CURRENT_LOCATION' ? 'SELECTED' : 'IDLE')
      : state);
    latestSearch.current.cancel();
    invalidateRoute('Endpoint changed. Get a new route.');
    if (selection === 'start') {
      setStart(endpoint);
      setCurrentLocationState(endpoint.source === 'CURRENT_LOCATION' ? 'SELECTED' : 'IDLE');
      setSelection('destination');
    } else {
      setDestination(endpoint);
    }
    setQuery('');
    setSearchResults([]);
    setSearching(false);
  };

  const chooseSelection = (nextSelection: EndpointSelection) => {
    locationRequestGeneration.current += 1;
    setLocationLoading(false);
    setCurrentLocationState((state) => state === 'LOADING'
      ? (start?.source === 'CURRENT_LOCATION' ? 'SELECTED' : 'IDLE')
      : state);
    latestSearch.current.cancel();
    setSelection(nextSelection);
    setQuery('');
    setSearchResults([]);
    setSearchError(null);
    setSearching(false);
  };

  const changeSearchQuery = (text: string) => {
    locationRequestGeneration.current += 1;
    setLocationLoading(false);
    setCurrentLocationState((state) => state === 'LOADING'
      ? (start?.source === 'CURRENT_LOCATION' ? 'SELECTED' : 'IDLE')
      : state);
    latestSearch.current.cancel();
    setQuery(text);
    setSearchResults([]);
    setSearchError(null);
    setSearching(text.trim().length >= 3 && selectedEndpointEditable);
  };

  const handleMapPress = (event: MapPressEvent) => {
    // Marker presses can bubble through MapView on some platforms. Never turn an
    // approximate rider-area marker into an exact routing endpoint.
    if (event.nativeEvent.action === 'marker-press') return;
    selectEndpoint(createRouteEndpoint(event.nativeEvent.coordinate, 'Dropped pin', 'MAP_SELECTION'));
  };

  const useCurrentLocation = async () => {
    if (!startEndpointEditable) return;
    const requestGeneration = locationRequestGeneration.current + 1;
    locationRequestGeneration.current = requestGeneration;
    setLocationLoading(true);
    setCurrentLocationState('LOADING');
    setNotice('Requesting your current location…');
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (requestGeneration !== locationRequestGeneration.current) return;
      if (permission.status !== 'granted') {
        setCurrentLocationState('DENIED');
        setNotice('Location permission was denied. Choose a map point, preset, or search result instead.');
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        if (requestGeneration !== locationRequestGeneration.current) return;
        setCurrentLocationState('UNAVAILABLE');
        setNotice('Location services are unavailable. Turn them on or choose another source.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (requestGeneration !== locationRequestGeneration.current) return;
      const coordinate = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      latestSearch.current.cancel();
      invalidateRoute('Current location selected as the start. Get a new preview route.');
      setStart(createRouteEndpoint(coordinate, 'Current location', 'CURRENT_LOCATION'));
      setSelection('destination');
      setQuery('');
      setSearchResults([]);
      setSearching(false);
      setCurrentLocationState('SELECTED');
      mapRef.current?.animateToRegion({ ...coordinate, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 300);
    } catch {
      if (requestGeneration === locationRequestGeneration.current) {
        setCurrentLocationState('ERROR');
        setNotice('We could not retrieve a fresh location. Choose another source or retry.');
      }
    } finally {
      if (requestGeneration === locationRequestGeneration.current) setLocationLoading(false);
    }
  };

  const useQueensTestStart = () => {
    if (active || start?.locked) return;
    locationRequestGeneration.current += 1;
    setLocationLoading(false);
    setCurrentLocationState('IDLE');
    latestSearch.current.cancel();
    invalidateRoute('Jamaica, Queens test start selected. Get a new preview route.');
    setStandaloneConfirmed(true);
    setStart(createRouteEndpoint(
      queensTestDriverRoutingProfile.driverStart,
      'Jamaica, Queens — test start',
      'PRESET',
    ));
    setSelection('destination');
    setQuery('');
    setSearchResults([]);
    setSearchError(null);
    setSearching(false);
    mapRef.current?.animateToRegion({
      ...queensTestDriverRoutingProfile.driverStart,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    }, 300);
  };

  const currentLocationButtonLabel = currentLocationState === 'LOADING'
    ? 'Getting current location…'
    : currentLocationState === 'DENIED' || currentLocationState === 'UNAVAILABLE' || currentLocationState === 'ERROR'
      ? 'Retry current location'
      : currentLocationState === 'SELECTED'
        ? 'Refresh current location'
        : 'Current location';

  const startGoogleNavigation = () => {
    if (navigationLaunching || navigationRequest.status !== 'READY' || navigationAvailability.status !== 'READY') return;
    setNavigationLaunching(true);
    navigationLaunchTimer.current = setTimeout(() => setNavigationLaunching(false), 2_000);
    onStartNavigation(navigationRequest.request);
  };

  const startBasicNavigation = () => {
    if (navigationLaunching || navigationRequest.status !== 'READY') return;
    setNavigationLaunching(true);
    navigationLaunchTimer.current = setTimeout(() => setNavigationLaunching(false), 2_000);
    onStartBasicNavigation(navigationRequest.request);
  };

  const chooseSearchResult = (result: GeocodingResult) => {
    selectEndpoint(createRouteEndpoint(
      result.coordinate,
      result.context ? `${result.label}, ${result.context}` : result.label,
      'SEARCH_RESULT',
    ));
  };

  const swapEndpoints = () => {
    const swapped = swapEditableEndpoints(start, destination);
    if (!swapped.swapped) return;
    invalidateRoute('Endpoints swapped. Get a new route.');
    setStart(swapped.start);
    setDestination(swapped.destination);
  };

  const getRoute = async () => {
    if (!start || !destination || active) return;
    if (pickupRouteTrip && pickupManifest) {
      if (pickupManifest.missingPickupRiders.length > 0) {
        setPickupRouteError(pickupManifest.missingPickupRiders.map((rider) => `Confirm pickup location for ${rider.name} before routing.`).join(' '));
        return;
      }
      setRouteLoading(true);
      setPickupRouteResult(null);
      setPickupOrderConfirmed(false);
      setPickupRouteError(null);
      setNotice('Comparing directed pickup orders with live OSRM routes…');
      try {
        const response = await latestPickupRoute.current.run((signal) => calculateTripPickupRoute({ adapter: routeAdapter, manifest: pickupManifest, origin: start.coordinate, signal }));
        if (response.status === 'STALE') return;
        setPickupRouteResult(response.result);
        setNotice(response.result.orderKind === 'PROPOSED' ? `Road route available. Compared ${response.result.alternativesCompared} directed orders; confirm the proposal before navigation.` : 'Road route available in the agreed pickup order.');
      } catch (caught) {
        setPickupRouteError(caught instanceof Error ? caught.message : 'The pickup route could not be calculated.');
        setNotice('Pickup route unavailable. Correct the issue or retry.');
      } finally {
        setRouteLoading(false);
      }
      return;
    }
    setRouteLoading(true);
    setRouteResult(null);
    setNotice('Requesting a driving route…');
    const response = await latestRoute.current.run(routeAdapter, [start.coordinate, destination.coordinate]);
    if (response.status === 'STALE') return;
    setRouteLoading(false);
    setRouteResult(response.result);
    setNotice(response.result.status === 'SUCCESS' ? 'Road route ready.' : routingFailureMessage(response.result));
  };

  const startRide = () => {
    if (pickupRouteTrip && navigationRequest.status !== 'READY') return;
    latestSearch.current.cancel();
    setQuery('');
    setSearchResults([]);
    setSearching(false);
    setSession((current) => startLocalRouteSession(current, displayedRoute, start, destination));
    setNotice('Local route session active. This is not turn-by-turn navigation.');
    setPanelExpanded(true);
  };

  const endRide = () => {
    setSession((current) => endLocalRouteSession(current));
    setNotice('Local route session ended. No carpool trip was completed.');
  };

  const expandMap = async () => {
    if (mapExpanded || mapExpansionTransition.current) return;
    mapExpansionTransition.current = true;
    try {
      savedMapCamera.current = await mapRef.current?.getCamera() ?? savedMapCamera.current;
    } catch {
      // Fall back to the last known camera (or the initial region) if the native
      // map is briefly unavailable while its screen is transitioning.
    }
    setExpandedInitialCamera(savedMapCamera.current);
    setMapExpanded(true);
    mapExpansionTransition.current = false;
  };

  const closeExpandedMap = async () => {
    if (!mapExpanded || mapExpansionTransition.current) return;
    mapExpansionTransition.current = true;
    try {
      savedMapCamera.current = await expandedMapRef.current?.getCamera() ?? savedMapCamera.current;
    } catch {
      // Preserve the camera captured while opening if the modal map has already
      // begun its native dismissal.
    }
    const camera = savedMapCamera.current;
    setMapExpanded(false);
    requestAnimationFrame(() => {
      if (camera) mapRef.current?.animateCamera(camera, { duration: 0 });
      mapExpansionTransition.current = false;
    });
  };

  const renderMapLayers = () => (
    <>
      <RoadRouteLayers
        destination={displayedDestination?.coordinate ?? null}
        destinationTitle={displayedDestination?.label}
        route={displayedRoute}
        start={displayedStart?.coordinate ?? null}
        startTitle={displayedStart?.label}
      />
      {pickupRouteTrip && displayedPickupStops.map((stop, index) => (
        <Marker accessibilityLabel={`Pickup ${index + 1}, ${stop.riderName}`} coordinate={stop.coordinate} description={stop.label} key={stop.riderId} title={`${index + 1}. ${stop.riderName}`}>
          <View style={styles.pickupMarker}><Text style={styles.pickupMarkerText}>{index + 1}</Text></View>
        </Marker>
      ))}
      {!pickupRouteTrip && riders.map((rider) => {
        const selected = rider.id === selectedRiderId;
        return (
          <Fragment key={rider.id}>
            <Circle center={rider.approximateArea.center} fillColor="rgba(153, 0, 0, 0.14)" radius={rider.approximateArea.radiusMiles * METERS_PER_MILE} strokeColor={colors.accent} strokeWidth={selected ? 4 : 2} />
            <Marker accessibilityLabel={`${rider.name}, approximate area`} coordinate={rider.approximateArea.center} description="Approximate area" onPress={() => setSelectedRiderId(rider.id)} title={rider.name}>
              <View style={[styles.riderMarker, selected && styles.selectedRiderMarker]}><Ionicons color={selected ? colors.surface : colors.accent} name="person" size={18} /></View>
            </Marker>
          </Fragment>
        );
      })}
    </>
  );

  return (
    <View style={styles.container}>
      <MapView initialRegion={STONY_BROOK_REGION} onPress={handleMapPress} ref={mapRef} style={styles.map}>
        {renderMapLayers()}
      </MapView>

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <Pressable accessibilityLabel="Expand map" accessibilityRole="button" onPress={() => void expandMap()} style={({ pressed }) => [styles.mapExpandButton, { bottom: insets.bottom + spacing.md }, pressed && styles.mapControlPressed]}>
          <Ionicons color={colors.text} name="expand-outline" size={23} />
        </Pressable>
        <View style={[styles.panel, { top: insets.top + spacing.sm }]}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: panelExpanded }} onPress={() => setPanelExpanded((expanded) => !expanded)} style={styles.panelHeader}>
            <View style={styles.panelHeaderCopy}>
              <Text accessibilityRole="header" style={styles.panelTitle}>{active ? 'Route active' : 'Plan a route'}</Text>
              <Text numberOfLines={1} style={styles.panelSubtitle}>{active ? displayedDestination?.label : 'Road routing · no live traffic'}</Text>
            </View>
            <Ionicons color={colors.text} name={panelExpanded ? 'chevron-up' : 'chevron-down'} size={20} />
          </Pressable>

          {panelExpanded && (
            <ScrollView contentContainerStyle={styles.panelBody} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.panelScroll}>
              {__DEV__ && onOpenCarpoolMatchingDemo && (
                <View style={styles.rideNotice}>
                  <View style={styles.rideNoticeHeader}>
                    <Ionicons color={colors.accent} name="people-outline" size={18} />
                    <Text style={styles.rideNoticeTitle}>Carpool Matching Demo</Text>
                  </View>
                  <Text style={styles.smallText}>Present two matching cases with six independent synthetic rider alternatives.</Text>
                  <AppButton label="Carpool Matching Demo" onPress={onOpenCarpoolMatchingDemo} />
                </View>
              )}
              {__DEV__ && (onLoadFridayDriverTest || onOpenDriverTest || onOpenMatchingDiagnostics || onOpenRoutePlanner) && (
                <View style={styles.developerTools}>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: developerToolsExpanded }} onPress={() => setDeveloperToolsExpanded((expanded) => !expanded)} style={styles.developerToolsHeader}>
                    <Text style={styles.developerToolsTitle}>Developer tools</Text>
                    <Ionicons color={colors.textMuted} name={developerToolsExpanded ? 'chevron-up' : 'chevron-down'} size={18} />
                  </Pressable>
                  {developerToolsExpanded && (
                    <View style={styles.developerToolsBody}>
                      {onLoadFridayDriverTest && fridayDriverTest && (
                        <View style={styles.fridayTestTool}>
                          <Text style={styles.developerToolsTitle}>Friday dated driver test</Text>
                          <Text style={styles.smallText}>Oct 16, 2026 · Jamaica → Tabler · Ava 1 seat, Ben 2 seats, Chloe 1 seat · live OSRM</Text>
                          {fridayDriverTest.message && <Text accessibilityLiveRegion={fridayDriverTest.status === 'ERROR' ? 'assertive' : 'polite'} style={fridayDriverTest.status === 'ERROR' ? styles.errorText : styles.smallText}>{fridayDriverTest.message}</Text>}
                          {fridayDriverTest.status === 'LOADED' && onResetFridayDriverTest
                            ? <AppButton label="Reset Friday driver test" onPress={onResetFridayDriverTest} variant="secondary" />
                            : <AppButton disabled={fridayDriverTest.status === 'LOADING'} label={fridayDriverTest.status === 'LOADING' ? 'Loading Friday driver test…' : fridayDriverTest.status === 'ERROR' ? 'Retry Friday driver test' : 'Load Friday driver test'} onPress={() => void onLoadFridayDriverTest()} variant="secondary" />}
                        </View>
                      )}
                      {onOpenDriverTest && <AppButton label="Test as driver" onPress={onOpenDriverTest} variant="secondary" />}
                      {onOpenMatchingDiagnostics && <AppButton label="Matching evaluator diagnostics" onPress={onOpenMatchingDiagnostics} variant="secondary" />}
                      {onOpenRoutePlanner && <AppButton label="Route planner" onPress={onOpenRoutePlanner} variant="secondary" />}
                    </View>
                  )}
                </View>
              )}
              {pickupRouteTrip && pickupManifest && (
                <View style={styles.tripRouteCard}>
                  <View style={styles.rideNoticeHeader}><Ionicons color={colors.accent} name="people-outline" size={18} /><Text style={styles.rideNoticeTitle}>Pickup route · {pickupRouteTrip.dateLabel}</Text></View>
                  <Text style={styles.smallText}>TO CAMPUS · {pickupManifest.campus.label} · {pickupRouteTrip.proposal ? `${pickupRouteTrip.proposal.agreed.requestedSeats} requested seat${pickupRouteTrip.proposal.agreed.requestedSeats === 1 ? '' : 's'}` : `${pickupManifest.acceptedRiderIds.length} accepted rider${pickupManifest.acceptedRiderIds.length === 1 ? '' : 's'}`}</Text>
                  <Text style={styles.smallText}>{pickupRouteTrip.proposal ? `${pickupRouteTrip.offer?.driverName ?? 'Driver'} · ${pickupRouteTrip.proposal.agreed.pickup.label}` : (pickupRouteTrip.riders ?? []).map((rider) => rider.riderName).join(', ')}</Text>
                  <Text style={styles.privacyNote}>{pickupRouteTrip.proposal ? 'This route uses the exact pickup and destination preserved in the accepted dated proposal.' : 'These precise points are accepted-request data. Candidate privacy areas are not used.'}</Text>
                  {pickupManifest.missingPickupRiders.map((rider) => <Text key={rider.id} style={styles.navigationWarning}>Confirm pickup location for {rider.name} before routing.</Text>)}
                  {onClearPickupRoute && <AppButton label="Plan a standalone route" onPress={onClearPickupRoute} variant="secondary" />}
                </View>
              )}
              {!pickupRouteTrip && rideContext.status !== 'NONE' && (
                <View style={styles.rideNotice}>
                  <View style={styles.rideNoticeHeader}><Ionicons color={colors.accent} name="car-outline" size={18} /><Text style={styles.rideNoticeTitle}>{rideContext.rideLabel}</Text></View>
                  {rideContext.status === 'LOCKED' ? (
                    <Text style={styles.smallText}>Confirmed routing points are locked. Change the ride through its existing ride flow.</Text>
                  ) : (
                    <>
                      <Text style={styles.smallText}>This ride has descriptive pickup text but no confirmed exact routing coordinates. Its privacy-area center will not be used.</Text>
                      {!standaloneConfirmed && <AppButton label="Plan a separate route" onPress={() => setStandaloneConfirmed(true)} variant="secondary" />}
                    </>
                  )}
                </View>
              )}

              <EndpointSummary endpoint={displayedStart} label="Start" selected={selection === 'start'} onPress={() => !active && chooseSelection('start')} />
              {__DEV__ && (
                <View style={styles.queensStartAction}>
                  <Pressable accessibilityHint={queensStartDisabledReason ?? 'Uses Jamaica LIRR as the route start without requesting location permission'} accessibilityRole="button" disabled={queensStartDisabledReason !== null} onPress={useQueensTestStart} style={({ pressed }) => [styles.sourceButton, pressed && styles.pressed, queensStartDisabledReason !== null && styles.disabled]}>
                    <Ionicons color={colors.accent} name="location-outline" size={17} />
                    <Text style={styles.sourceButtonText}>Use Queens start</Text>
                  </Pressable>
                  {queensStartDisabledReason && <Text accessibilityLiveRegion="polite" style={styles.disabledReason}>{queensStartDisabledReason}</Text>}
                </View>
              )}
              <EndpointSummary endpoint={displayedDestination} label="Destination" selected={selection === 'destination'} onPress={() => !active && chooseSelection('destination')} />
              {pickupRouteTrip && <TextInput accessibilityLabel="Planned departure time" autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" onChangeText={setPlannedDeparture} placeholder="Planned departure (HH:MM)" placeholderTextColor={colors.textMuted} style={styles.searchInput} value={plannedDeparture} />}

              {!active && standaloneConfirmed && (
                <>
                  <View style={styles.sourceActions}>
                    {!__DEV__ && <Pressable accessibilityHint="Uses a fresh foreground GPS fix as the route start" accessibilityRole="button" disabled={!startEndpointEditable || locationLoading} onPress={useCurrentLocation} style={({ pressed }) => [styles.sourceButton, styles.currentLocationButton, pressed && styles.pressed, (!startEndpointEditable || locationLoading) && styles.disabled]}>
                      {locationLoading ? <ActivityIndicator color={colors.accent} size="small" /> : <Ionicons color={colors.accent} name="locate-outline" size={17} />}
                      <Text style={styles.sourceButtonText}>{currentLocationButtonLabel}</Text>
                    </Pressable>}
                    <Pressable accessibilityRole="button" disabled={!start || !destination || start.locked || destination.locked} onPress={swapEndpoints} style={({ pressed }) => [styles.sourceButton, pressed && styles.pressed, (!start || !destination || start.locked || destination.locked) && styles.disabled]}>
                      <Ionicons color={colors.accent} name="swap-vertical" size={17} /><Text style={styles.sourceButtonText}>Swap</Text>
                    </Pressable>
                  </View>

                  <TextInput accessibilityLabel={`Search for ${selection}`} autoCapitalize="words" autoCorrect={false} editable={selectedEndpointEditable} onChangeText={changeSearchQuery} placeholder={`Search for ${selection === 'start' ? 'a start' : 'a destination'}`} placeholderTextColor={colors.textMuted} style={styles.searchInput} value={query} />
                  {searching && <Text style={styles.smallText}>Searching…</Text>}
                  {searchError && <Text style={styles.errorText}>{searchError}</Text>}
                  {searchResults.map((result) => (
                    <Pressable accessibilityRole="button" key={result.id} onPress={() => chooseSearchResult(result)} style={({ pressed }) => [styles.searchResult, pressed && styles.pressed]}>
                      <Text style={styles.resultLabel}>{result.label}</Text>
                      <Text style={styles.resultContext}>{result.context || 'Address details unavailable'}</Text>
                    </Pressable>
                  ))}
                  {(query.length > 0 || searchResults.length > 0) && <Text style={styles.attribution}>Search data © OpenStreetMap contributors</Text>}

                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.presets}>
                      {routePresets.map((preset) => (
                        <Pressable accessibilityHint={`Use as ${selection}`} accessibilityRole="button" disabled={!selectedEndpointEditable} key={preset.id} onPress={() => selectEndpoint(createRouteEndpoint(preset.coordinate, preset.label, 'PRESET'))} style={({ pressed }) => [styles.preset, pressed && styles.pressed, !selectedEndpointEditable && styles.disabled]}>
                          <Text style={styles.presetText}>{preset.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                  <AppButton disabled={!start || !destination || routeLoading} label={pickupRouteTrip ? (pickupRouteError ? 'Retry pickup route' : 'Calculate pickup route') : routeResult?.status === 'FAILURE' ? 'Retry route' : 'Get route'} onPress={getRoute} />
                </>
              )}

              {routeLoading && <ActivityIndicator color={colors.accent} />}
              {pickupRouteError && <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{pickupRouteError}</Text>}
              <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>
              {displayedRoute && (
                <><Text style={styles.previewLabel}>Preview route</Text><View style={styles.metrics}><Text style={styles.metric}>{formatDistance(displayedRoute.distanceMeters)}</Text><Text style={styles.metric}>{formatDuration(displayedRoute.durationSeconds)}</Text><Text style={styles.metric}>{displayedRoute.provider.name}</Text></View></>
              )}
              {pickupRouteTrip && pickupRouteResult && (
                <View style={styles.pickupRouteSummary}>
                  <Text style={styles.rideNoticeTitle}>{pickupRouteResult.orderKind === 'PROPOSED' ? 'Proposed pickup order' : 'Confirmed pickup order'}</Text>
                  {pickupRouteResult.orderedStops.map((stop, index) => {
                    const rider = pickupRouteTrip?.riders?.find((candidate) => candidate.id === stop.riderId);
                    return <View key={stop.riderId} style={styles.pickupOrderRow}><View style={styles.pickupNumber}><Text style={styles.pickupNumberText}>{index + 1}</Text></View><Pressable accessibilityLabel={`View ${stop.riderName}'s profile`} accessibilityRole="button" disabled={!rider || !onOpenProfile} onPress={() => rider && onOpenProfile?.(participantIdForRequest(rider), rider.riderName)} style={({ pressed }) => [styles.panelHeaderCopy, pressed && styles.profilePressed]}><Text style={styles.resultLabel}>{stop.riderName}</Text><Text style={styles.resultContext}>{stop.label}{pickupSchedule && pickupSchedule.status !== 'INCOMPLETE' ? ` · est. ${formatEpochTime(pickupSchedule.pickupEpochs[stop.riderId])}` : ''}</Text></Pressable></View>;
                  })}
                  <Text style={styles.smallText}>Road driving: {formatDuration(pickupRouteResult.route.durationSeconds)} · {formatDistance(pickupRouteResult.route.distanceMeters)}</Text>
                  <Text style={styles.smallText}>Pickup service: {formatDuration(pickupRouteResult.orderedStops.reduce((total, stop) => total + (stop.serviceSeconds ?? 0), 0))} total, applied once per stop.</Text>
                  {pickupRouteResult.orderKind === 'PROPOSED' && !pickupOrderConfirmed && <><Text style={styles.privacyNote}>Shortest live road-driving duration among {pickupRouteResult.alternativesCompared} directed orders. This does not prove schedule feasibility.</Text><AppButton label="Confirm proposed pickup order" onPress={() => setPickupOrderConfirmed(true)} variant="secondary" /></>}
                  {pickupOrderReady && <Text style={styles.confirmedOrder}>Pickup order confirmed for this screen session.</Text>}
                  {!pickupSchedule || pickupSchedule.status === 'INCOMPLETE' ? <Text style={styles.scheduleIncomplete}>Schedule incomplete: {pickupSchedule?.messages.join(' ') ?? 'Calculate the road route and enter a planned departure.'}</Text> : pickupSchedule.status === 'CONFLICT' ? <Text style={styles.scheduleConflict}>Schedule conflict: {pickupSchedule.messages.join(' ')}</Text> : <Text style={styles.scheduleVerified}>Schedule verified for this fixed order · campus {formatEpochTime(pickupSchedule.campusEpoch)}.</Text>}
                </View>
              )}
              {!active && standaloneConfirmed && navigationRequest.status === 'READY' && navigationAvailability.status === 'READY' && (
                <AppButton disabled={routeLoading || locationLoading || navigationLaunching} label={navigationLaunching ? 'Opening navigation…' : 'Start navigation'} onPress={startGoogleNavigation} />
              )}
              {!active && standaloneConfirmed && navigationRequest.status === 'READY' && (
                <AppButton disabled={routeLoading || locationLoading || navigationLaunching} label={navigationLaunching ? 'Opening navigation…' : 'Start basic navigation'} onPress={startBasicNavigation} variant="secondary" />
              )}
              {!active && standaloneConfirmed && navigationRequest.status === 'BLOCKED' && <Text style={styles.navigationWarning}>{navigationRequest.message}</Text>}
              {!active && standaloneConfirmed && navigationAvailability.status !== 'READY' && (
                <View style={styles.navigationSetup}>
                  <Text style={styles.navigationSetupTitle}>Google Navigation setup required</Text>
                  <Text style={styles.smallText}>{navigationAvailability.message}</Text>
                </View>
              )}
              {displayedRoute && !active && <AppButton disabled={routeLoading || (pickupRouteTrip !== null && navigationRequest.status !== 'READY')} label="Start preview route session" onPress={startRide} variant="secondary" />}
              {active && (
                <><Text style={styles.activeNote}>Route guidance only. No live ETA, automatic rerouting, or turn-by-turn navigation.</Text><AppButton label="End route" onPress={endRide} variant="secondary" /></>
              )}
              {displayedRoute && <Text style={styles.snapNote}>Pins may be snapped to nearby routable roads. Orange markers show the provider-snapped points.</Text>}
            </ScrollView>
          )}
        </View>
      </View>

      {mapExpanded && (
        <Modal animationType="fade" hardwareAccelerated onRequestClose={() => void closeExpandedMap()} presentationStyle="fullScreen" visible>
          <View style={styles.expandedMapContainer}>
            <MapView initialCamera={expandedInitialCamera ?? undefined} initialRegion={expandedInitialCamera ? undefined : STONY_BROOK_REGION} onPress={handleMapPress} ref={expandedMapRef} style={styles.map}>
              {renderMapLayers()}
            </MapView>
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              <Pressable accessibilityLabel="Minimize map" accessibilityRole="button" onPress={() => void closeExpandedMap()} style={({ pressed }) => [styles.mapMinimizeButton, { top: insets.top + spacing.md, right: insets.right + spacing.md }, pressed && styles.mapControlPressed]}>
                <Ionicons color={colors.text} name="contract-outline" size={23} />
              </Pressable>
              {selectedRiderId && (
                <View pointerEvents="none" style={[styles.selectedRiderLabel, { top: insets.top + spacing.md }]}>
                  <Ionicons color={colors.accent} name="person" size={16} />
                  <Text numberOfLines={1} style={styles.selectedRiderLabelText}>{riders.find((rider) => rider.id === selectedRiderId)?.name}</Text>
                </View>
              )}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function EndpointSummary({ endpoint, label, onPress, selected }: { endpoint: RouteEndpoint | null; label: string; onPress: () => void; selected: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.endpoint, selected && styles.endpointSelected]}>
      <Ionicons color={label === 'Start' ? colors.success : colors.error} name="location" size={19} />
      <View style={styles.endpointCopy}>
        <Text style={styles.endpointLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.endpointValue}>{endpoint?.label ?? 'Not selected'}</Text>
        {endpoint && <Text style={styles.endpointSource}>{routeEndpointSourceLabels[endpoint.source]}</Text>}
      </View>
      {endpoint?.locked && <Ionicons accessibilityLabel="Locked ride endpoint" color={colors.textMuted} name="lock-closed" size={16} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, map: { flex: 1 },
  expandedMapContainer: { backgroundColor: colors.background, flex: 1 },
  mapExpandButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.pill, borderWidth: 1, elevation: 5, height: 48, justifyContent: 'center', position: 'absolute', right: spacing.md, shadowColor: '#17212b', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 5, width: 48, zIndex: 5 },
  mapMinimizeButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.pill, borderWidth: 1, elevation: 5, height: 48, justifyContent: 'center', position: 'absolute', shadowColor: '#17212b', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 5, width: 48 },
  mapControlPressed: { opacity: 0.72 },
  selectedRiderLabel: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.pill, borderWidth: 1, elevation: 4, flexDirection: 'row', gap: spacing.xs, left: spacing.xl, maxWidth: '60%', minHeight: 42, paddingHorizontal: spacing.md, position: 'absolute' },
  selectedRiderLabelText: { color: colors.text, flexShrink: 1, fontSize: 13, fontWeight: '800' },
  panel: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, elevation: 4, left: spacing.md, maxHeight: '76%', position: 'absolute', right: spacing.md, shadowColor: '#17212b', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 12 },
  panelHeader: { alignItems: 'center', flexDirection: 'row', minHeight: 54, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  panelHeaderCopy: { flex: 1 }, panelTitle: { color: colors.text, fontSize: 17, fontWeight: '800' }, panelSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  panelScroll: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, panelBody: { gap: spacing.sm, padding: spacing.md },
  rideNotice: { backgroundColor: colors.accentSoft, borderRadius: radii.md, gap: spacing.sm, padding: spacing.md }, rideNoticeHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, rideNoticeTitle: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '800' }, smallText: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  developerTools: { borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' }, developerToolsHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: spacing.md }, developerToolsTitle: { color: colors.text, fontSize: 13, fontWeight: '800' }, developerToolsBody: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.sm, padding: spacing.md },
  fridayTestTool: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, gap: spacing.sm, padding: spacing.md },
  endpoint: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 56, padding: spacing.sm }, endpointSelected: { borderColor: colors.accent, borderWidth: 2 }, endpointCopy: { flex: 1 }, endpointLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }, endpointValue: { color: colors.text, fontSize: 13, fontWeight: '700' }, endpointSource: { color: colors.textMuted, fontSize: 10, marginTop: 1 },
  queensStartAction: { gap: spacing.xs }, disabledReason: { color: colors.warning, fontSize: 11, lineHeight: 16, paddingHorizontal: spacing.xs }, sourceActions: { flexDirection: 'row', gap: spacing.sm }, sourceButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.sm }, currentLocationButton: { flex: 2 }, sourceButtonText: { color: colors.accent, fontSize: 13, fontWeight: '800' }, pressed: { backgroundColor: colors.accentSoft }, disabled: { opacity: 0.45 },
  searchInput: { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, color: colors.text, fontSize: 14, minHeight: 44, paddingHorizontal: spacing.md }, searchResult: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2, paddingVertical: spacing.sm }, resultLabel: { color: colors.text, fontSize: 13, fontWeight: '800' }, resultContext: { color: colors.textMuted, fontSize: 11, lineHeight: 15 }, errorText: { color: colors.error, fontSize: 12, lineHeight: 17 }, attribution: { color: colors.textMuted, fontSize: 10 },
  presets: { flexDirection: 'row', gap: spacing.sm }, preset: { borderColor: colors.border, borderRadius: radii.pill, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: spacing.md }, presetText: { color: colors.text, fontSize: 12, fontWeight: '700' }, notice: { color: colors.textMuted, fontSize: 12, lineHeight: 17 }, previewLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }, metrics: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, flexDirection: 'row', justifyContent: 'space-between', padding: spacing.sm }, metric: { color: colors.text, fontSize: 12, fontWeight: '800' }, navigationSetup: { backgroundColor: colors.warningSoft, borderRadius: radii.md, gap: spacing.xs, padding: spacing.sm }, navigationSetupTitle: { color: colors.warning, fontSize: 12, fontWeight: '800' }, navigationWarning: { color: colors.error, fontSize: 12, lineHeight: 17 }, activeNote: { color: colors.warning, fontSize: 12, lineHeight: 17 }, snapNote: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  riderMarker: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.accent, borderRadius: radii.pill, borderWidth: 2, elevation: 2, height: 34, justifyContent: 'center', width: 34 },
  selectedRiderMarker: { backgroundColor: colors.accent, borderColor: colors.surface, height: 42, width: 42 },
  pickupMarker: { alignItems: 'center', backgroundColor: colors.accent, borderColor: colors.surface, borderRadius: radii.pill, borderWidth: 2, height: 38, justifyContent: 'center', width: 38 }, pickupMarkerText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
  tripRouteCard: { backgroundColor: colors.accentSoft, borderRadius: radii.md, gap: spacing.sm, padding: spacing.md }, privacyNote: { color: colors.textMuted, fontSize: 11, lineHeight: 16 }, pickupRouteSummary: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, gap: spacing.sm, padding: spacing.md }, pickupOrderRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, profilePressed: { opacity: 0.62 }, pickupNumber: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.pill, height: 26, justifyContent: 'center', width: 26 }, pickupNumberText: { color: colors.surface, fontSize: 12, fontWeight: '900' }, confirmedOrder: { color: colors.success, fontSize: 12, fontWeight: '800', lineHeight: 17 }, scheduleIncomplete: { backgroundColor: colors.warningSoft, borderRadius: radii.sm, color: colors.warning, fontSize: 12, fontWeight: '700', lineHeight: 18, padding: spacing.sm }, scheduleConflict: { backgroundColor: colors.errorSoft, borderRadius: radii.sm, color: colors.error, fontSize: 12, fontWeight: '700', lineHeight: 18, padding: spacing.sm }, scheduleVerified: { backgroundColor: colors.successSoft, borderRadius: radii.sm, color: colors.success, fontSize: 12, fontWeight: '800', lineHeight: 18, padding: spacing.sm },
});
