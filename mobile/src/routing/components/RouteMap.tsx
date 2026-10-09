import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
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

const styles = StyleSheet.create({
  frame: {
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    height: 340,
    overflow: 'hidden',
  },
});
