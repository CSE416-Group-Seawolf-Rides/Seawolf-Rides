import { forwardRef, useImperativeHandle, type PropsWithChildren } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing } from '../theme';

export type { Camera, MapPressEvent } from 'react-native-maps';

// Temporary browser stand-in for react-native-maps (web spike). It keeps every screen
// usable on the web by drawing a labelled placeholder where the map would be. The
// planned replacement is a Leaflet + OpenStreetMap map (docs/web-app-plan.md, section 4.1).

interface Region {
  latitude: number;
  longitude: number;
}

interface MapViewProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  region?: Region;
  initialCamera?: { center: Region };
  camera?: { center: Region };
}

// Accept every other react-native-maps prop (onPress, showsUserLocation, …) and ignore it.
const MapView = forwardRef<unknown, object>(function WebMapPlaceholder(rawProps, ref) {
  const props = rawProps as MapViewProps;
  const center = props.region ??
    props.initialRegion ??
    props.camera?.center ??
    props.initialCamera?.center ?? { latitude: 40.9126, longitude: -73.1234 };

  useImperativeHandle(ref, () => ({
    animateCamera: () => undefined,
    animateToRegion: () => undefined,
    fitToCoordinates: () => undefined,
    getCamera: async () => ({ center, heading: 0, pitch: 0, zoom: 12, altitude: 0 }),
  }));

  return (
    <View style={[styles.placeholder, props.style]}>
      <Text style={styles.title}>Map preview</Text>
      <Text style={styles.detail}>Interactive maps are coming to the web version.</Text>
    </View>
  );
});

export default MapView;

// Overlays draw nothing until the web map lands.
export function Marker(_props: PropsWithChildren<Record<string, unknown>>) {
  return null;
}
export function Circle(_props: Record<string, unknown>) {
  return null;
}
export function Polyline(_props: Record<string, unknown>) {
  return null;
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 160,
    padding: spacing.lg,
  },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  detail: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
});
