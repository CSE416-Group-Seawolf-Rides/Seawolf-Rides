import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Circle, Marker, type MapPressEvent } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CommuteSchedule } from '../commute/commuteModel';
import { METERS_PER_MILE } from '../commute/commuteModel';
import { AppButton } from '../components/AppButton';
import { LatestGeocodingSearch } from '../geocoding/latestGeocodingSearch';
import { createPhotonGeocodingAdapter } from '../geocoding/photonAdapter';
import type { GeocodingResult } from '../geocoding/types';
import { getCampusDestinationMapLocation } from '../map/campusDestinations';
import type { RiderMapCandidate } from '../map/riderMapModel';
import {
  buildRouteNavigationRequest,
  type RouteNavigationRequest,
} from '../navigation/routeNavigationRequest';
import { getRuntimeGoogleNavigationAvailability } from '../navigation/googleNavigationRuntime';
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
import type { RoadRoute, RoutingResult } from '../routing/types';
import { colors, radii, spacing } from '../theme';

interface MapScreenProps {
  commute: CommuteSchedule | null;
  currentTrip: Trip | null;
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

export function MapScreen({ commute, currentTrip, onStartBasicNavigation, onStartNavigation, riders }: MapScreenProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const routeAdapter = useMemo(() => createOsrmRoutingAdapter(), []);
  const geocodingAdapter = useMemo(() => createPhotonGeocodingAdapter(), []);
  const latestRoute = useRef(new LatestRouteRequest());
  const latestSearch = useRef(new LatestGeocodingSearch());
  const locationRequestGeneration = useRef(0);
  const navigationLaunchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rideContext = useMemo(() => getRideRouteContext(currentTrip), [currentTrip]);
  const initialCampus = commute ? getCampusDestinationMapLocation(commute.campusLot) : null;

  const [selection, setSelection] = useState<EndpointSelection>('start');
  const [start, setStart] = useState<RouteEndpoint | null>(() =>
    rideContext.status === 'LOCKED' ? rideContext.start : null,
  );
  const [destination, setDestination] = useState<RouteEndpoint | null>(() =>
    rideContext.status === 'LOCKED'
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
  const [standaloneConfirmed, setStandaloneConfirmed] = useState(rideContext.status !== 'UNCONFIRMED');
  const [locationLoading, setLocationLoading] = useState(false);
  const [navigationLaunching, setNavigationLaunching] = useState(false);
  const [currentLocationState, setCurrentLocationState] = useState<CurrentLocationState>('IDLE');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [session, setSession] = useState<LocalRouteSession>(idleRouteSession);

  const active = session.status === 'ACTIVE';
  const displayedRoute: RoadRoute | null = active
    ? session.route
    : routeResult?.status === 'SUCCESS'
      ? routeResult.route
      : null;
  const displayedStart = active ? session.start : start;
  const displayedDestination = active ? session.destination : destination;
  const selectedEndpoint = selection === 'start' ? start : destination;
  const selectedEndpointEditable = canEditEndpoint(selectedEndpoint) && !active && standaloneConfirmed;
  const startEndpointEditable = canEditEndpoint(start) && !active && standaloneConfirmed;
  const navigationAvailability = getRuntimeGoogleNavigationAvailability();
  const navigationRequest = buildRouteNavigationRequest(
    destination ? { label: destination.label, coordinate: destination.coordinate } : null,
    rideContext,
    currentTrip,
  );

  useEffect(() => () => {
    latestRoute.current.cancel();
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
    setRouteLoading(false);
    setRouteResult(null);
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

  return (
    <View style={styles.container}>
      <MapView initialRegion={STONY_BROOK_REGION} onPress={handleMapPress} ref={mapRef} style={styles.map}>
        <RoadRouteLayers
          destination={displayedDestination?.coordinate ?? null}
          destinationTitle={displayedDestination?.label}
          route={displayedRoute}
          start={displayedStart?.coordinate ?? null}
          startTitle={displayedStart?.label}
        />
        {riders.map((rider) => (
          <Fragment key={rider.id}>
            <Circle center={rider.approximateArea.center} fillColor="rgba(153, 0, 0, 0.14)" radius={rider.approximateArea.radiusMiles * METERS_PER_MILE} strokeColor={colors.accent} strokeWidth={2} />
            <Marker accessibilityLabel={`${rider.name}, approximate area`} coordinate={rider.approximateArea.center} description="Approximate area" title={rider.name}>
              <View style={styles.riderMarker}><Ionicons color={colors.accent} name="person" size={18} /></View>
            </Marker>
          </Fragment>
        ))}
      </MapView>

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
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
              {rideContext.status !== 'NONE' && (
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
              <EndpointSummary endpoint={displayedDestination} label="Destination" selected={selection === 'destination'} onPress={() => !active && chooseSelection('destination')} />

              {!active && standaloneConfirmed && (
                <>
                  <View style={styles.sourceActions}>
                    <Pressable accessibilityHint="Uses a fresh foreground GPS fix as the route start" accessibilityRole="button" disabled={!startEndpointEditable || locationLoading} onPress={useCurrentLocation} style={({ pressed }) => [styles.sourceButton, styles.currentLocationButton, pressed && styles.pressed, (!startEndpointEditable || locationLoading) && styles.disabled]}>
                      {locationLoading ? <ActivityIndicator color={colors.accent} size="small" /> : <Ionicons color={colors.accent} name="locate-outline" size={17} />}
                      <Text style={styles.sourceButtonText}>{currentLocationButtonLabel}</Text>
                    </Pressable>
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
                  <AppButton disabled={!start || !destination || routeLoading} label={routeResult?.status === 'FAILURE' ? 'Retry route' : 'Get route'} onPress={getRoute} />
                </>
              )}

              {routeLoading && <ActivityIndicator color={colors.accent} />}
              <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>
              {displayedRoute && (
                <><Text style={styles.previewLabel}>Preview route</Text><View style={styles.metrics}><Text style={styles.metric}>{formatDistance(displayedRoute.distanceMeters)}</Text><Text style={styles.metric}>{formatDuration(displayedRoute.durationSeconds)}</Text><Text style={styles.metric}>{displayedRoute.provider.name}</Text></View></>
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
              {displayedRoute && !active && <AppButton disabled={routeLoading} label="Start preview route session" onPress={startRide} variant="secondary" />}
              {active && (
                <><Text style={styles.activeNote}>Route guidance only. No live ETA, automatic rerouting, or turn-by-turn navigation.</Text><AppButton label="End route" onPress={endRide} variant="secondary" /></>
              )}
              {displayedRoute && <Text style={styles.snapNote}>Pins may be snapped to nearby routable roads. Orange markers show the provider-snapped points.</Text>}
            </ScrollView>
          )}
        </View>
      </View>
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
  panel: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, elevation: 4, left: spacing.md, maxHeight: '76%', position: 'absolute', right: spacing.md, shadowColor: '#17212b', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 12 },
  panelHeader: { alignItems: 'center', flexDirection: 'row', minHeight: 54, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  panelHeaderCopy: { flex: 1 }, panelTitle: { color: colors.text, fontSize: 17, fontWeight: '800' }, panelSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  panelScroll: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, panelBody: { gap: spacing.sm, padding: spacing.md },
  rideNotice: { backgroundColor: colors.accentSoft, borderRadius: radii.md, gap: spacing.sm, padding: spacing.md }, rideNoticeHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, rideNoticeTitle: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '800' }, smallText: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  endpoint: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 56, padding: spacing.sm }, endpointSelected: { borderColor: colors.accent, borderWidth: 2 }, endpointCopy: { flex: 1 }, endpointLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }, endpointValue: { color: colors.text, fontSize: 13, fontWeight: '700' }, endpointSource: { color: colors.textMuted, fontSize: 10, marginTop: 1 },
  sourceActions: { flexDirection: 'row', gap: spacing.sm }, sourceButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 40, paddingHorizontal: spacing.sm }, currentLocationButton: { flex: 2 }, sourceButtonText: { color: colors.accent, fontSize: 13, fontWeight: '800' }, pressed: { backgroundColor: colors.accentSoft }, disabled: { opacity: 0.45 },
  searchInput: { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, color: colors.text, fontSize: 14, minHeight: 44, paddingHorizontal: spacing.md }, searchResult: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2, paddingVertical: spacing.sm }, resultLabel: { color: colors.text, fontSize: 13, fontWeight: '800' }, resultContext: { color: colors.textMuted, fontSize: 11, lineHeight: 15 }, errorText: { color: colors.error, fontSize: 12, lineHeight: 17 }, attribution: { color: colors.textMuted, fontSize: 10 },
  presets: { flexDirection: 'row', gap: spacing.sm }, preset: { borderColor: colors.border, borderRadius: radii.pill, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: spacing.md }, presetText: { color: colors.text, fontSize: 12, fontWeight: '700' }, notice: { color: colors.textMuted, fontSize: 12, lineHeight: 17 }, previewLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }, metrics: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, flexDirection: 'row', justifyContent: 'space-between', padding: spacing.sm }, metric: { color: colors.text, fontSize: 12, fontWeight: '800' }, navigationSetup: { backgroundColor: colors.warningSoft, borderRadius: radii.md, gap: spacing.xs, padding: spacing.sm }, navigationSetupTitle: { color: colors.warning, fontSize: 12, fontWeight: '800' }, navigationWarning: { color: colors.error, fontSize: 12, lineHeight: 17 }, activeNote: { color: colors.warning, fontSize: 12, lineHeight: 17 }, snapNote: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  riderMarker: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.accent, borderRadius: radii.pill, borderWidth: 2, elevation: 2, height: 34, justifyContent: 'center', width: 34 },
});
