import { useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import * as Linking from 'expo-linking';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { getFirebaseFunctions } from '../firebase/firebase';
import { AppButton } from '../components/AppButton';
import type { RideRequest } from '../mvp/rideRequestModel';
import type { RoadRoute, RoutingResult } from '../routing/types';
import { CAMPUS_POINTS } from '../mvp/settings';
import { useAcceptedPickup } from './acceptedPickups';
import { tripDirectionsUrl } from './tripDirections';
import { useSession } from '../auth/SessionProvider';
import { colors, radii, spacing } from '../theme';

/** Exact points are read only from participant-protected, accepted-trip snapshots. */
export function AcceptedTripMap({ ride, routePreview = false }: {
  ride: RideRequest;
  routePreview?: boolean;
}) {
  const { pickup, error } = useAcceptedPickup(ride);
  const { user } = useSession();
  const driving = user?.id === ride.driverId;
  const [route, setRoute] = useState<RoadRoute | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  if (ride.status !== 'ACCEPTED') return null;
  if (ride.source !== 'CALENDAR') return <Text>Exact pickup is unavailable for this older trip.</Text>;
  if (!pickup) return <Text>{error ?? 'Loading the confirmed pickup…'}</Text>;
  const campus = pickup.campus ?? CAMPUS_POINTS.find((p) => p.label === ride.campusLabel)?.coordinate;
  const points = routePreview
    ? [pickup.driverStart, pickup.riderPickup, ...(campus ? [campus] : [])]
    : [pickup.riderPickup];
  const fitPoints = route?.geometry.length ? [...points, ...route.geometry] : points;
  const latitudes = fitPoints.map((p) => p.latitude), longitudes = fitPoints.map((p) => p.longitude);
  const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes), maxLng = Math.max(...longitudes);
  const preview = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      const result = (await httpsCallable<{ requestId: string }, RoutingResult>(
        getFirebaseFunctions(), 'previewAcceptedRide', { timeout: 120000 },
      )({ requestId: ride.id })).data;
      if (result.status === 'SUCCESS') setRoute(result.route);
      else setMessage(result.message);
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'Route unavailable. Retry when connected.');
    } finally { inFlight.current = false; setBusy(false); }
  };
  // The whole trip in one handoff: current location → pickup(s) in order → campus lot.
  const openDirections = async () => {
    const destination = campus ?? pickup.riderPickup;
    const stops = campus ? [pickup.riderPickup] : [];
    try { await Linking.openURL(tripDirectionsUrl(Platform.OS, stops, destination)); }
    catch { setMessage('Could not open Maps. The confirmed pickup pin is shown above.'); }
  };
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{routePreview ? 'Your trip route' : 'Confirmed pickup'}</Text>
      <Text style={styles.detail}>{ride.pickupLabel} · Exact pickup pin shared after acceptance</Text>
      <MapView
        key={JSON.stringify(fitPoints)}
        style={styles.map}
        initialRegion={{ latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2,
          latitudeDelta: Math.max(0.008, (maxLat - minLat) * 1.4),
          longitudeDelta: Math.max(0.008, (maxLng - minLng) * 1.4) }}
        accessibilityLabel="Confirmed pickup and trip map"
      >
        <Marker coordinate={pickup.riderPickup} title="Confirmed pickup" description={ride.pickupLabel} pinColor={colors.accent} />
        {routePreview && <Marker coordinate={pickup.driverStart} title="Driver departure" />}
        {routePreview && campus && <Marker coordinate={campus} title={ride.campusLabel} pinColor={colors.success} />}
        {route && <Polyline coordinates={route.geometry} strokeColor={colors.accent} strokeWidth={5} />}
      </MapView>
      {routePreview && <>
        <AppButton label={busy ? 'Loading road route…' : route ? 'Refresh road route' : 'Show road route'}
          disabled={busy} variant="secondary" onPress={() => void preview()} />
        <Text style={styles.detail}>{route
          ? `${route.provider.name} · ${(route.distanceMeters / 1000).toFixed(1)} km · ${Math.ceil(route.durationSeconds / 60)} min driving. ${route.estimate?.model === 'TRAFFIC_FORECAST' ? 'Traffic forecast.' : 'Excludes traffic.'}`
          : 'Load the road route when needed. The pins show confirmed locations.'} Route previews do not change agreed times or include pickup waiting.</Text>
      </>}
      <AppButton
        label={driving ? `Directions: pick up ${ride.riderName}, then ${ride.campusLabel}` : `Directions to ${ride.campusLabel} via your pickup`}
        variant="secondary"
        onPress={() => void openDirections()}
      />
      {message ? <Text accessibilityRole="alert">{message}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: spacing.md },
  heading: { fontSize: 20, fontWeight: '800', color: colors.text },
  detail: { color: colors.textMuted, lineHeight: 21 },
  map: { height: 270, borderRadius: radii.lg },
});
