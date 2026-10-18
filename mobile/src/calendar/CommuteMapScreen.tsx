import { router } from 'expo-router';
import { useState } from 'react';
import { CommuteCalendarSheet } from './CommuteCalendarSheet';
import { useCalendarOverrides } from './calendarClient';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { useSession } from '../auth/SessionProvider';
import { useRideRequests } from '../mvp/rideRequestClient';
import { useAcceptedPickup } from './acceptedPickups';
import { localDateAt, CAMPUS_POINTS } from '../mvp/settings';
import { METERS_PER_MILE } from '../commute/commuteModel';
import { AppButton } from '../components/AppButton';
import { useHomeClock } from '../rides/useHomeClock';
import { colors, spacing, radii } from '../theme';
export function CommuteMapScreen() {
  const { commute, user, profile } = useSession();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const overrides = useCalendarOverrides(user?.id);
  const requests = useRideRequests(user?.id);
  const { now } = useHomeClock();
  const ride = requests.items
    .filter((r) => r.status === 'ACCEPTED' && (selectedDate ? r.localDate === selectedDate : r.localDate >= localDateAt(now.getTime() / 1000)))
    .sort((a, b) => a.localDate.localeCompare(b.localDate))[0];
  const pickup = useAcceptedPickup(ride);
  if (!commute)
    return (
      <View style={styles.empty}>
        <Text>Save your commute to see it on the map.</Text>
        <AppButton label="Set up commute" onPress={() => router.push('/commute-setup')} />
      </View>
    );
  const campus = CAMPUS_POINTS.find((p) => p.id === commute.campusLot);
  const points = [
    commute.startPoint ?? commute.startArea.center,
    ...(campus ? [campus.coordinate] : []),
    ...(pickup.pickup ? [pickup.pickup.driverStart, pickup.pickup.riderPickup] : []),
  ];
  const latitudes = points.map((p) => p.latitude),
    longitudes = points.map((p) => p.longitude);
  const minLat = Math.min(...latitudes),
    maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes),
    maxLng = Math.max(...longitudes);
  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        key={JSON.stringify(points)}
        initialRegion={{
          latitude: (minLat + maxLat) / 2,
          longitude: (minLng + maxLng) / 2,
          latitudeDelta: Math.max(0.09, (maxLat - minLat) * 1.5),
          longitudeDelta: Math.max(0.09, (maxLng - minLng) * 1.5),
        }}
      >
        <Circle
          center={commute.startArea.center}
          radius={commute.startArea.radiusMiles * METERS_PER_MILE}
          fillColor="rgba(153,0,0,0.12)"
          strokeColor={colors.accent}
        />
        {commute.startPoint && (
          <Marker
            coordinate={commute.startPoint}
            title="Your private starting point"
            description="Other users see your approximate area until acceptance"
            pinColor={colors.accent}
          />
        )}
        {campus && (
          <Marker coordinate={campus.coordinate} title={campus.label} pinColor={colors.success} />
        )}
        {pickup.pickup && (
          <>
            <Marker
              coordinate={pickup.pickup.riderPickup}
              title="Accepted ride pickup"
              description={ride?.localDate}
              pinColor={colors.success}
            />
            <Marker
              coordinate={pickup.pickup.driverStart}
              title="Accepted driver starting point"
              description={ride?.localDate}
              pinColor={colors.success}
            />
          </>
        )}
      </MapView>
      <View style={styles.card}>
        <Text style={styles.title}>Your commute</Text>
        {selectedDate && <Text>{selectedDate}</Text>}
        <Text>
          {commute.startArea.label} → {campus?.label ?? 'Campus'}
        </Text>
        <Text style={styles.muted}>
          The shaded area is what others see before acceptance. Your exact pin is private.
        </Text>
        {ride && (
          <Text>
            {selectedDate ? 'Confirmed ride' : 'Next accepted ride'}: {ride.localDate} ·{' '}
            {ride.driverId === user?.id ? ride.riderName : ride.driverName}
          </Text>
        )}
        {pickup.error && <Text>{pickup.error}</Text>}
        <AppButton
          label="Open my calendar"
          variant="secondary"
          onPress={() => setCalendarOpen(true)}
        />
      </View>
      {calendarOpen && user && profile && (
        <CommuteCalendarSheet
          initialDate={selectedDate ?? ride?.localDate ?? localDateAt(now.getTime() / 1000)}
          today={localDateAt(now.getTime() / 1000)}
          commute={commute}
          role={profile.role}
          uid={user.id}
          overrides={overrides.days}
          requests={requests.items}
          ready={overrides.loaded && requests.loaded}
          onClose={() => setCalendarOpen(false)}
          onSelect={(date) => {
            setSelectedDate(date);
            setCalendarOpen(false);
          }}
          onEditCommute={() => {
            setCalendarOpen(false);
            router.push('/commute-setup');
          }}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, padding: spacing.xl, gap: spacing.lg },
  card: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { color: colors.text, fontWeight: '800', fontSize: 20 },
  muted: { color: colors.textMuted, lineHeight: 20 },
});
