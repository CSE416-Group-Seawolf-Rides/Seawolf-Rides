import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, Polyline, type Camera, type MapPressEvent } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '../../theme';
import type { RoadRoute, RouteCoordinate } from '../types';
import { SCENARIO_MAP_PIN_COLORS, SCENARIO_MAP_PIN_DIMENSIONS, scenarioMapPinAccessibilityLabel, type ScenarioMapPinRole } from '../scenarioMapPinModel';

export type EndpointSelection = 'start' | 'destination';

interface RouteMapProps {
  destination: RouteCoordinate | null;
  onSelectCoordinate: (coordinate: RouteCoordinate) => void;
  route: RoadRoute | null;
  selection: EndpointSelection;
  start: RouteCoordinate | null;
}

interface RoadRouteLayersProps {
  destination: RouteCoordinate | null;
  destinationTitle?: string;
  route: RoadRoute | null;
  start: RouteCoordinate | null;
  startTitle?: string;
}

export interface RiderComparisonMarker {
  id: string;
  coordinate: RouteCoordinate;
  title: string;
  subtitle: string;
  confirmed: boolean;
}

interface RiderComparisonMapProps {
  baselineRoute: RoadRoute | null;
  campus: RouteCoordinate;
  campusTitle: string;
  driverStart: RouteCoordinate;
  driverTitle: string;
  fitKey: number;
  onSelectCandidate: (candidateId: string) => void;
  riders: readonly RiderComparisonMarker[];
  selectedCandidateId: string | null;
  selectedRoute: RoadRoute | null;
}

export interface MultiCarMapActor {
  id: string;
  coordinate: RouteCoordinate;
  title: string;
  subtitle: string;
  color: string;
  identityLetter: string;
  role: 'DRIVER' | 'RIDER';
  approximate?: boolean;
}

export interface MultiCarMapRoute {
  id: string;
  coordinates: readonly RouteCoordinate[];
  color: string;
  label: string;
  kind: 'ACCEPTED' | 'PROPOSED';
}

interface MultiCarScenarioMapProps {
  campus: RouteCoordinate;
  drivers: readonly MultiCarMapActor[];
  fitKey: number;
  onSelectDriver: (id: string) => void;
  onSelectRider: (id: string) => void;
  riders: readonly MultiCarMapActor[];
  routes: readonly MultiCarMapRoute[];
  selectedDriverId: string;
  selectedRiderId: string | null;
  soloBaseline: readonly RouteCoordinate[] | null;
}

const STONY_BROOK_REGION = {
  latitude: 40.9128,
  longitude: -73.1235,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export function RouteMap({
  destination,
  onSelectCoordinate,
  route,
  selection,
  start,
}: RouteMapProps) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!route) return;
    mapRef.current?.fitToCoordinates(route.geometry, {
      animated: true,
      edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
    });
  }, [route]);

  const handlePress = (event: MapPressEvent) => {
    onSelectCoordinate(event.nativeEvent.coordinate);
  };

  return (
    <View
      accessibilityLabel={`Route map. Tap to choose the ${selection}.`}
      style={styles.frame}
    >
      <MapView
        initialRegion={STONY_BROOK_REGION}
        onPress={handlePress}
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}
      >
        <RoadRouteLayers destination={destination} route={route} start={start} />
      </MapView>
    </View>
  );
}

export function RoadRouteLayers({
  destination,
  destinationTitle = 'Selected destination',
  route,
  start,
  startTitle = 'Selected start',
}: RoadRouteLayersProps) {
  return (
    <>
      {route && (
        <Polyline
          coordinates={route.geometry}
          lineCap="round"
          lineJoin="round"
          strokeColor={colors.accent}
          strokeWidth={5}
        />
      )}
      {start && <Marker coordinate={start} pinColor={colors.success} title={startTitle} />}
      {destination && <Marker coordinate={destination} pinColor={colors.error} title={destinationTitle} />}
      {route?.snappedWaypoints.map((waypoint, index) => (
        <Marker
          coordinate={waypoint.snapped}
          description={`${waypoint.distanceMeters.toFixed(1)} m from the selected point`}
          key={`snapped-${index}`}
          pinColor={colors.warning}
          title={`Snapped ${index === 0 ? 'start' : index === route.snappedWaypoints.length - 1 ? 'destination' : `waypoint ${index + 1}`}`}
        />
      ))}
    </>
  );
}

/** Shared map renderer for the independent-alternative rider comparison demo. */
export function RiderComparisonMap({
  baselineRoute,
  campus,
  campusTitle,
  driverStart,
  driverTitle,
  fitKey,
  onSelectCandidate,
  riders,
  selectedCandidateId,
  selectedRoute,
}: RiderComparisonMapProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const expandedMapRef = useRef<MapView>(null);
  const savedCamera = useRef<Camera | null>(null);
  const expandedVisible = useRef(false);
  const expansionTransition = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [expandedInitialCamera, setExpandedInitialCamera] = useState<Camera | null>(null);

  useEffect(() => {
    if (fitKey === 0) return;
    const activeMap = expandedVisible.current ? expandedMapRef.current : mapRef.current;
    activeMap?.fitToCoordinates(
      [driverStart, campus, ...riders.map((rider) => rider.coordinate)],
      {
        animated: true,
        edgePadding: { top: 52, right: 42, bottom: 52, left: 42 },
      },
    );
  }, [campus, driverStart, fitKey, riders]);

  const expandMap = async () => {
    if (expandedVisible.current || expansionTransition.current) return;
    expansionTransition.current = true;
    try {
      savedCamera.current = await mapRef.current?.getCamera() ?? savedCamera.current;
    } catch {
      // A native map can be briefly unavailable during a screen transition.
    }
    setExpandedInitialCamera(savedCamera.current);
    expandedVisible.current = true;
    setExpanded(true);
    expansionTransition.current = false;
  };

  const minimizeMap = async () => {
    if (!expandedVisible.current || expansionTransition.current) return;
    expansionTransition.current = true;
    try {
      savedCamera.current = await expandedMapRef.current?.getCamera() ?? savedCamera.current;
    } catch {
      // Retain the camera captured on expansion if native dismissal has begun.
    }
    const camera = savedCamera.current;
    expandedVisible.current = false;
    setExpanded(false);
    requestAnimationFrame(() => {
      if (camera) mapRef.current?.animateCamera(camera, { duration: 0 });
      expansionTransition.current = false;
    });
  };

  const renderComparisonLayers = () => (
    <>
      {baselineRoute && (
        <Polyline
          coordinates={baselineRoute.geometry}
          lineCap="round"
          lineJoin="round"
          strokeColor={colors.textMuted}
          strokeWidth={4}
        />
      )}
      {selectedRoute && (
        <Polyline
          coordinates={selectedRoute.geometry}
          lineCap="round"
          lineJoin="round"
          strokeColor={colors.accent}
          strokeWidth={6}
        />
      )}
      <Marker coordinate={driverStart} title={driverTitle}>
        <View style={[styles.endpointMarker, styles.driverMarker]}>
          <Text style={styles.endpointMarkerText}>Driver start</Text>
        </View>
      </Marker>
      <Marker coordinate={campus} title={campusTitle}>
        <View style={[styles.endpointMarker, styles.campusMarker]}>
          <Text style={styles.endpointMarkerText}>Campus</Text>
        </View>
      </Marker>
      {riders.map((rider) => {
        const selected = rider.id === selectedCandidateId;
        return (
          <Marker
            accessibilityLabel={`${rider.title}, ${rider.confirmed ? 'confirmed demo pickup' : 'unconfirmed demo pickup'}`}
            coordinate={rider.coordinate}
            description={rider.subtitle}
            key={rider.id}
            onPress={() => onSelectCandidate(rider.id)}
            title={rider.title}
          >
            <View
              style={[
                styles.candidateMarker,
                !rider.confirmed && styles.unconfirmedMarker,
                selected && styles.selectedCandidateMarker,
              ]}
            >
              <Text style={[styles.candidateMarkerText, selected && styles.selectedMarkerText]}>
                {rider.title}
              </Text>
            </View>
          </Marker>
        );
      })}
    </>
  );

  return (
    <View accessibilityLabel="Demo rider route comparison map" style={styles.comparisonFrame}>
      <MapView
        initialRegion={STONY_BROOK_REGION}
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}
      >
        {renderComparisonLayers()}
      </MapView>
      <Pressable accessibilityLabel="Expand map" accessibilityRole="button" onPress={() => void expandMap()} style={({ pressed }) => [styles.comparisonExpandButton, pressed && styles.mapControlPressed]}>
        <Ionicons color={colors.text} name="expand-outline" size={22} />
      </Pressable>
      {expanded && (
        <Modal animationType="fade" hardwareAccelerated onRequestClose={() => void minimizeMap()} presentationStyle="fullScreen" visible>
          <View style={styles.expandedComparisonContainer}>
            <MapView initialCamera={expandedInitialCamera ?? undefined} initialRegion={expandedInitialCamera ? undefined : STONY_BROOK_REGION} ref={expandedMapRef} style={StyleSheet.absoluteFill} toolbarEnabled={false}>
              {renderComparisonLayers()}
            </MapView>
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              <View pointerEvents="none" style={[styles.expandedLegend, { top: insets.top + spacing.md, left: insets.left + spacing.md }]}>
                <MapLegend color={colors.textMuted} label="Direct driver trip" />
                <MapLegend color={colors.accent} label="Trip through selected pickup" />
              </View>
              <Pressable accessibilityLabel="Minimize map" accessibilityRole="button" onPress={() => void minimizeMap()} style={({ pressed }) => [styles.comparisonMinimizeButton, { top: insets.top + spacing.md, right: insets.right + spacing.md }, pressed && styles.mapControlPressed]}>
                <Ionicons color={colors.text} name="contract-outline" size={22} />
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

/** Multi-car layer that preserves exact actor coordinates and authoritative route order. */
export function MultiCarScenarioMap({
  campus, drivers, fitKey, onSelectDriver, onSelectRider, riders, routes,
  selectedDriverId, selectedRiderId, soloBaseline,
}: MultiCarScenarioMapProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const expandedMapRef = useRef<MapView>(null);
  const savedCamera = useRef<Camera | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedCamera, setExpandedCamera] = useState<Camera | null>(null);

  useEffect(() => {
    if (!fitKey) return;
    const map = expanded ? expandedMapRef.current : mapRef.current;
    map?.fitToCoordinates([campus, ...drivers.map((item) => item.coordinate), ...riders.map((item) => item.coordinate)], {
      animated: true, edgePadding: { top: 50, right: 38, bottom: 50, left: 38 },
    });
  }, [campus, drivers, expanded, fitKey, riders]);

  const open = async () => {
    try { savedCamera.current = await mapRef.current?.getCamera() ?? savedCamera.current; } catch { /* native transition */ }
    setExpandedCamera(savedCamera.current);
    setExpanded(true);
  };
  const close = async () => {
    try { savedCamera.current = await expandedMapRef.current?.getCamera() ?? savedCamera.current; } catch { /* native transition */ }
    setExpanded(false);
    const camera = savedCamera.current;
    requestAnimationFrame(() => { if (camera) mapRef.current?.animateCamera(camera, { duration: 0 }); });
  };
  const layers = () => <>
    {soloBaseline && soloBaseline.length > 1 && <Polyline coordinates={[...soloBaseline]} strokeColor={colors.textMuted} strokeWidth={4} />}
    {routes.map((route) => route.coordinates.length > 1 && <Polyline coordinates={[...route.coordinates]} key={route.id} lineDashPattern={route.kind === 'PROPOSED' ? [10, 8] : undefined} strokeColor={route.color} strokeWidth={route.kind === 'PROPOSED' ? 6 : 5} />)}
    <Marker accessibilityLabel={scenarioMapPinAccessibilityLabel('Tabler', 'CAMPUS')} anchor={{ x: 0.5, y: 1 }} coordinate={campus} description="Shared confirmed campus drop-off" title="Tabler" zIndex={600}><ScenarioMapPin role="CAMPUS" /></Marker>
    {drivers.map((driver) => <Marker accessibilityLabel={scenarioMapPinAccessibilityLabel(driver.title, 'DRIVER')} anchor={{ x: 0.5, y: 1 }} coordinate={driver.coordinate} description={driver.subtitle} key={driver.id} onPress={() => onSelectDriver(driver.id)} title={driver.title} zIndex={driver.id === selectedDriverId ? 500 : 300}><ScenarioMapPin identityLetter={driver.identityLetter} role="DRIVER" selected={driver.id === selectedDriverId} /></Marker>)}
    {riders.filter((rider) => rider.approximate).map((rider) => <Circle center={rider.coordinate} fillColor="rgba(113, 79, 191, 0.10)" key={`area-${rider.id}`} radius={700} strokeColor={rider.color} />)}
    {riders.map((rider) => <Marker accessibilityLabel={scenarioMapPinAccessibilityLabel(rider.title, 'RIDER', rider.approximate)} anchor={{ x: 0.5, y: 1 }} coordinate={rider.coordinate} description={rider.subtitle} key={rider.id} onPress={() => onSelectRider(rider.id)} title={rider.title} zIndex={rider.id === selectedRiderId ? 500 : 200}><ScenarioMapPin identityLetter={rider.identityLetter} role="RIDER" selected={rider.id === selectedRiderId} /></Marker>)}
  </>;

  return <View accessibilityLabel="Three-car recommendation map" style={styles.comparisonFrame}>
    <MapView initialRegion={STONY_BROOK_REGION} ref={mapRef} style={StyleSheet.absoluteFill} toolbarEnabled={false}>{layers()}</MapView>
    <Pressable accessibilityLabel="Expand three-car map" accessibilityRole="button" onPress={() => void open()} style={styles.comparisonExpandButton}><Ionicons color={colors.text} name="expand-outline" size={22} /></Pressable>
    {expanded && <Modal animationType="fade" hardwareAccelerated onRequestClose={() => void close()} presentationStyle="fullScreen" visible>
      <View style={styles.expandedComparisonContainer}>
        <MapView initialCamera={expandedCamera ?? undefined} initialRegion={expandedCamera ? undefined : STONY_BROOK_REGION} ref={expandedMapRef} style={StyleSheet.absoluteFill} toolbarEnabled={false}>{layers()}</MapView>
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View pointerEvents="none" style={[styles.expandedLegend, { left: insets.left + spacing.md, top: insets.top + spacing.md }]}><MapLegend color={SCENARIO_MAP_PIN_COLORS.DRIVER} label="Driver pins" /><MapLegend color={SCENARIO_MAP_PIN_COLORS.RIDER} label="Rider pins" /><MapLegend color={SCENARIO_MAP_PIN_COLORS.CAMPUS} label="Campus pin" /><MapLegend color={colors.textMuted} label="Selected car solo baseline" />{routes.map((route) => <MapLegend color={route.color} key={route.id} label={route.label} />)}</View>
          <Pressable accessibilityLabel="Close full-screen map" accessibilityRole="button" onPress={() => void close()} style={[styles.comparisonMinimizeButton, { right: insets.right + spacing.md, top: insets.top + spacing.md }]}><Ionicons color={colors.text} name="close" size={24} /></Pressable>
        </View>
      </View>
    </Modal>}
  </View>;
}

function ScenarioMapPin({ identityLetter, role, selected = false }: { identityLetter?: string; role: ScenarioMapPinRole; selected?: boolean }) {
  const backgroundColor = SCENARIO_MAP_PIN_COLORS[role];
  return <View collapsable={false} style={styles.scenarioPinFrame}>
    <View style={[styles.scenarioPinTip, { borderTopColor: backgroundColor }]} />
    <View style={[styles.scenarioPinBody, { backgroundColor }, selected && styles.scenarioPinSelected]}>
      {role === 'CAMPUS' ? <Ionicons color={colors.surface} name="school" size={21} /> : <Text style={styles.scenarioPinLetter}>{identityLetter}</Text>}
    </View>
  </View>;
}

function MapLegend({ color, label }: { color: string; label: string }) {
  return <View style={styles.mapLegendItem}><View style={[styles.mapLegendLine, { backgroundColor: color }]} /><Text style={styles.mapLegendText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  frame: {
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    height: 340,
    overflow: 'hidden',
  },
  comparisonFrame: {
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    height: 360,
    overflow: 'hidden',
  },
  comparisonExpandButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    elevation: 5,
    height: 46,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    shadowColor: '#17212b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    top: spacing.sm,
    width: 46,
  },
  expandedComparisonContainer: {
    backgroundColor: colors.background,
    flex: 1,
  },
  comparisonMinimizeButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    elevation: 5,
    height: 48,
    justifyContent: 'center',
    position: 'absolute',
    shadowColor: '#17212b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    width: 48,
  },
  mapControlPressed: {
    opacity: 0.72,
  },
  expandedLegend: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    elevation: 4,
    gap: spacing.xs,
    maxWidth: '68%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'absolute',
  },
  mapLegendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  mapLegendLine: {
    borderRadius: radii.pill,
    height: 6,
    width: 22,
  },
  mapLegendText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
  },
  endpointMarker: {
    borderRadius: radii.pill,
    borderWidth: 2,
    minHeight: 36,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  driverMarker: {
    backgroundColor: colors.success,
    borderColor: colors.surface,
  },
  campusMarker: {
    backgroundColor: colors.error,
    borderColor: colors.surface,
  },
  endpointMarkerText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '900',
  },
  candidateMarker: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderRadius: radii.pill,
    borderWidth: 2,
    minHeight: 34,
    minWidth: 48,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  candidateMarkerText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '900',
  },
  selectedCandidateMarker: {
    backgroundColor: colors.accent,
    borderColor: colors.surface,
    minHeight: 42,
  },
  selectedMarkerText: {
    color: colors.surface,
  },
  unconfirmedMarker: {
    borderColor: colors.warning,
    borderStyle: 'dashed',
  },
  scenarioPinFrame: { alignItems: 'center', height: SCENARIO_MAP_PIN_DIMENSIONS.height, overflow: 'visible', width: SCENARIO_MAP_PIN_DIMENSIONS.width },
  scenarioPinBody: { alignItems: 'center', borderColor: colors.surface, borderRadius: 20, borderWidth: 2, height: 40, justifyContent: 'center', left: 0, position: 'absolute', top: 0, width: 40, zIndex: 2 },
  scenarioPinSelected: { borderColor: colors.text, borderWidth: 4 },
  scenarioPinTip: { borderLeftColor: 'transparent', borderLeftWidth: 9, borderRightColor: 'transparent', borderRightWidth: 9, borderTopWidth: 15, bottom: 0, height: 0, position: 'absolute', width: 0, zIndex: 1 },
  scenarioPinLetter: { color: colors.surface, fontSize: 18, fontWeight: '900', includeFontPadding: false, lineHeight: 22, textAlign: 'center', textAlignVertical: 'center' },
});
