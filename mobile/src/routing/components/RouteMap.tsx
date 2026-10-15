import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, type MapPressEvent } from 'react-native-maps';

import { colors, radii } from '../../theme';
import type { RoadRoute, RouteCoordinate } from '../types';

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
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (fitKey === 0) return;
    mapRef.current?.fitToCoordinates(
      [driverStart, campus, ...riders.map((rider) => rider.coordinate)],
      {
        animated: true,
        edgePadding: { top: 52, right: 42, bottom: 52, left: 42 },
      },
    );
  }, [campus, driverStart, fitKey, riders]);

  return (
    <View accessibilityLabel="Demo rider route comparison map" style={styles.comparisonFrame}>
      <MapView
        initialRegion={STONY_BROOK_REGION}
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}
      >
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
      </MapView>
    </View>
  );
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
});
