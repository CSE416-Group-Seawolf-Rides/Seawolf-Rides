import { StyleSheet, Text, View } from 'react-native';
import MapView, { Circle } from 'react-native-maps';

import { colors, radii, spacing } from '../../theme';
import { METERS_PER_MILE, PrivacyArea } from '../commuteModel';

interface PrivacyAreaMapProps {
  area: PrivacyArea;
  height?: number;
}

const MILES_PER_DEGREE_LATITUDE = 69;

// Read-only map of the 2-mile area other people will see. There is deliberately no
// pin: the circle is the only location information we ever show.
export function PrivacyAreaMap({ area, height = 220 }: PrivacyAreaMapProps) {
  const latitudeDelta = (area.radiusMiles * 2 * 1.35) / MILES_PER_DEGREE_LATITUDE;
  const longitudeDelta = latitudeDelta / Math.cos((area.center.latitude * Math.PI) / 180);

  return (
    <View
      accessibilityLabel={`Map showing a ${area.radiusMiles}-mile area around ${area.label}`}
      accessibilityRole="image"
      pointerEvents="none"
      style={[styles.frame, { height }]}
    >
      <MapView
        pitchEnabled={false}
        region={{ ...area.center, latitudeDelta, longitudeDelta }}
        rotateEnabled={false}
        scrollEnabled={false}
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}
        zoomEnabled={false}
      >
        <Circle
          center={area.center}
          fillColor="rgba(153, 0, 0, 0.14)"
          radius={area.radiusMiles * METERS_PER_MILE}
          strokeColor={colors.accent}
          strokeWidth={2}
        />
      </MapView>
      <View style={styles.label}>
        <Text style={styles.labelText}>{area.label}</Text>
        <Text style={styles.labelMeta}>{area.radiusMiles}-mile area</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  label: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    bottom: spacing.md,
    left: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'absolute',
    shadowColor: '#17212b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  labelText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  labelMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
