import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { formatManeuver } from '../navigation/basicNavigationProgress';
import type { RouteNavigationRequest } from '../navigation/routeNavigationRequest';
import { useBasicNavigationSession } from '../navigation/useBasicNavigationSession';
import { colors, radii, spacing } from '../theme';

interface BasicNavigationScreenProps {
  onClose: () => void;
  request: RouteNavigationRequest;
}

function formatDistance(meters: number): string {
  return meters < 1_000 ? `${Math.max(0, Math.round(meters))} m` : `${(meters / 1_609.344).toFixed(1)} mi`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

export function BasicNavigationScreen({ onClose, request }: BasicNavigationScreenProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [following, setFollowing] = useState(true);
  const session = useBasicNavigationSession(request);

  useEffect(() => {
    if (!following || !session.currentFix) return;
    mapRef.current?.animateCamera({
      center: session.currentFix.coordinate,
      heading: 0,
      pitch: 45,
      zoom: 17,
    }, { duration: 500 });
  }, [following, session.currentFix]);

  const end = () => {
    session.end();
    onClose();
  };

  const instruction = session.nextInstruction?.instruction.step;
  const starting = session.status === 'STARTING';
  return (
    <View style={styles.container}>
      <MapView
        initialRegion={{ latitude: 40.9128, longitude: -73.1235, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
        onPanDrag={() => setFollowing(false)}
        ref={mapRef}
        style={styles.map}
      >
        {session.preparedRoute && (
          <Polyline coordinates={session.preparedRoute.route.geometry} strokeColor={colors.accent} strokeWidth={6} />
        )}
        {session.currentFix && (
          <Marker accessibilityLabel="Live current position" coordinate={session.currentFix.coordinate} title={session.simulationLabel ?? 'Current position'}>
            <View style={[styles.positionMarker, session.simulationLabel && styles.simulatedMarker]}>
              <Ionicons color={colors.surface} name={session.simulationLabel ? 'flask' : 'navigate'} size={18} />
            </View>
          </Marker>
        )}
      </MapView>

      <View style={[styles.guidance, { top: insets.top + spacing.sm }]}>
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <Text accessibilityRole="header" style={styles.title}>Basic navigation</Text>
            <Text numberOfLines={1} style={styles.destination}>{request.destinationLabel}</Text>
          </View>
          {starting && <ActivityIndicator color={colors.accent} />}
        </View>
        {session.simulationLabel && <Text style={styles.simulation}>DEVELOPMENT SIMULATION · {session.simulationLabel}</Text>}
        {instruction && session.nextInstruction && (
          <View style={styles.maneuver}>
            <Ionicons color={colors.accent} name="navigate-circle" size={34} />
            <View style={styles.maneuverCopy}>
              <Text style={styles.maneuverDistance}>In {formatDistance(session.nextInstruction.distanceMeters)}</Text>
              <Text style={styles.maneuverTitle}>{formatManeuver(instruction)}</Text>
              <Text numberOfLines={1} style={styles.roadName}>{instruction.name || instruction.reference || 'Unnamed road'}</Text>
            </View>
          </View>
        )}
        <Text accessibilityLiveRegion="polite" style={styles.notice}>{session.notice}</Text>
        {session.error && <Text style={styles.error}>{session.error}</Text>}
        {session.remainingDistanceMeters !== null && session.remainingDurationSeconds !== null && (
          <View style={styles.metrics}>
            <Text style={styles.metric}>{formatDistance(session.remainingDistanceMeters)} remaining</Text>
            <Text style={styles.metric}>Est. {formatDuration(session.remainingDurationSeconds)}</Text>
            <Text style={styles.provider}>OSRM · no live traffic</Text>
          </View>
        )}
        {session.status === 'ARRIVED' && <Text style={styles.arrived}>Arrival confirmed by two on-route fixes.</Text>}
        {__DEV__ && session.preparedRoute && session.status !== 'ENDED' && (
          <AppButton label="Run simulated GPS playback" onPress={session.startSimulation} variant="secondary" />
        )}
        <AppButton label={session.status === 'ARRIVED' ? 'End navigation' : 'End basic navigation'} onPress={end} variant="secondary" />
        <Text style={styles.disclaimer}>Foreground guidance only. This does not update requests, seats, riders, or trip completion.</Text>
      </View>

      <Pressable
        accessibilityLabel="Recenter and follow current position"
        accessibilityRole="button"
        onPress={() => setFollowing(true)}
        style={[styles.recenter, { bottom: insets.bottom + spacing.xl }]}
      >
        <Ionicons color={colors.accent} name={following ? 'navigate' : 'locate'} size={24} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1 },
  map: { flex: 1 },
  guidance: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, elevation: 5, gap: spacing.sm, left: spacing.md, maxHeight: '68%', padding: spacing.md, position: 'absolute', right: spacing.md },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  titleCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  destination: { color: colors.textMuted, fontSize: 12 },
  simulation: { backgroundColor: colors.warningSoft, borderRadius: radii.sm, color: colors.warning, fontSize: 11, fontWeight: '900', padding: spacing.sm },
  maneuver: { alignItems: 'center', backgroundColor: colors.accentSoft, borderRadius: radii.md, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  maneuverCopy: { flex: 1 },
  maneuverDistance: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  maneuverTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  roadName: { color: colors.textMuted, fontSize: 13 },
  notice: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.error, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  metrics: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, gap: spacing.xs, padding: spacing.sm },
  metric: { color: colors.text, fontSize: 13, fontWeight: '800' },
  provider: { color: colors.textMuted, fontSize: 11 },
  arrived: { color: colors.success, fontSize: 13, fontWeight: '800' },
  disclaimer: { color: colors.textMuted, fontSize: 10, lineHeight: 14 },
  positionMarker: { alignItems: 'center', backgroundColor: colors.accent, borderColor: colors.surface, borderRadius: radii.pill, borderWidth: 3, height: 38, justifyContent: 'center', width: 38 },
  simulatedMarker: { backgroundColor: colors.warning },
  recenter: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.pill, borderWidth: 1, elevation: 4, height: 50, justifyContent: 'center', position: 'absolute', right: spacing.lg, width: 50 },
});
