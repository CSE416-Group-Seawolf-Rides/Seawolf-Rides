import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { Fragment, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';

import type { CommuteSchedule, Weekday } from '../commute/commuteModel';
import {
  dayModeLabels,
  formatTime,
  lotTitle,
  METERS_PER_MILE,
  weekdays,
} from '../commute/commuteModel';
import { getCampusDestinationMapLocation } from '../map/campusDestinations';
import type { RiderMapCandidate } from '../map/riderMapModel';
import { colors, radii, spacing } from '../theme';

interface MapScreenProps {
  commute: CommuteSchedule | null;
  riders: RiderMapCandidate[];
  today: Weekday;
}

type MapStatus = 'loading' | 'ready' | 'denied' | 'error';

const LOCATION_DELTA = 0.02;
const OVERVIEW_HOLD_MS = 1500;
const USER_FOCUS_DURATION_MS = 900;

function regionAround(latitude: number, longitude: number): Region {
  return {
    latitude,
    longitude,
    latitudeDelta: LOCATION_DELTA,
    longitudeDelta: LOCATION_DELTA,
  };
}

function TodayCommuteCard({
  commute,
  today,
}: Pick<MapScreenProps, 'commute' | 'today'>) {
  const dayName = weekdays.find((weekday) => weekday.value === today)?.name ?? today;
  const schedule = commute?.days.find((day) => day.day === today);

  return (
    <View accessibilityLabel="Today's commute" style={styles.scheduleCard}>
      <Text style={styles.scheduleDay}>{dayName.toUpperCase()}</Text>
      {!commute ? (
        <Text style={styles.scheduleEmpty}>No commute set up</Text>
      ) : !schedule ? (
        <Text style={styles.scheduleEmpty}>No commute today</Text>
      ) : (
        <>
          <Text style={styles.scheduleMode}>{dayModeLabels[schedule.mode]}</Text>
          <Text style={styles.scheduleTime}>
            {schedule.arriveBy === null
              ? 'No ride there'
              : `Arrive ${formatTime(schedule.arriveBy)}`}
          </Text>
          <Text style={styles.scheduleTime}>
            {schedule.leaveAt === null ? 'No ride back' : `Leave ${formatTime(schedule.leaveAt)}`}
          </Text>
        </>
      )}
      {commute ? (
        <View style={styles.scheduleDestination}>
          <Text style={styles.scheduleDestinationLabel}>Destination</Text>
          <Text style={styles.scheduleDestinationValue}>{lotTitle(commute.campusLot)}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function MapScreen({ commute, riders, today }: MapScreenProps) {
  const mapRef = useRef<MapView>(null);
  const hasPresentedInitialOverview = useRef(false);
  const userFocusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const campusDestination = commute
    ? getCampusDestinationMapLocation(commute.campusLot)
    : null;

  useEffect(() => {
    let active = true;

    async function loadCurrentLocation() {
      try {
        const existingPermission = await Location.getForegroundPermissionsAsync();
        const permission =
          existingPermission.status === 'granted'
            ? existingPermission
            : await Location.requestForegroundPermissionsAsync();

        if (permission.status !== 'granted') {
          if (active) {
            setStatus('denied');
          }
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (active) {
          setInitialRegion(regionAround(position.coords.latitude, position.coords.longitude));
          setStatus('ready');
        }
      } catch {
        if (active) {
          setStatus('error');
        }
      }
    }

    loadCurrentLocation();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (userFocusTimer.current) {
        clearTimeout(userFocusTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !initialRegion || riders.length === 0 || hasPresentedInitialOverview.current) {
      return;
    }

    hasPresentedInitialOverview.current = true;
    mapRef.current?.fitToCoordinates(
      [initialRegion, ...riders.map((rider) => rider.approximateArea.center)],
      {
        animated: false,
        edgePadding: { top: 200, right: 80, bottom: 160, left: 80 },
      },
    );

    userFocusTimer.current = setTimeout(() => {
      mapRef.current?.animateToRegion(initialRegion, USER_FOCUS_DURATION_MS);
      userFocusTimer.current = null;
    }, OVERVIEW_HOLD_MS);
  }, [initialRegion, mapReady, riders]);

  async function recenterMap() {
    if (!initialRegion) {
      return;
    }

    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const nextRegion = regionAround(position.coords.latitude, position.coords.longitude);
      setInitialRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 300);
    } catch {
      mapRef.current?.animateToRegion(initialRegion, 300);
    }
  }

  if (status === 'loading') {
    return (
      <View style={styles.messageContainer}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.message}>Finding your location…</Text>
      </View>
    );
  }

  if (status === 'denied') {
    return (
      <View style={styles.messageContainer}>
        <Text style={styles.message}>
          Location permission is required to show your position on the map.
        </Text>
      </View>
    );
  }

  if (status === 'error' || !initialRegion) {
    return (
      <View style={styles.messageContainer}>
        <Text style={styles.message}>
          We couldn’t find your location. Make sure location services are turned on and try again.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        initialRegion={initialRegion}
        onMapReady={() => setMapReady(true)}
        ref={mapRef}
        style={styles.map}
      >
        <Marker
          accessibilityLabel="Your location"
          coordinate={initialRegion}
          title="Your location"
        >
          <Ionicons color={colors.accent} name="location" size={44} />
        </Marker>
        {campusDestination ? (
          <Marker
            accessibilityLabel={`${campusDestination.title}, your destination`}
            coordinate={campusDestination.coordinate}
            description="Your destination"
            title={campusDestination.title}
          >
            <View style={styles.destinationMarker}>
              <Ionicons color={colors.surface} name="flag" size={18} />
            </View>
          </Marker>
        ) : null}
        {riders.map((rider) => (
          <Fragment key={rider.id}>
            <Circle
              center={rider.approximateArea.center}
              fillColor="rgba(153, 0, 0, 0.14)"
              radius={rider.approximateArea.radiusMiles * METERS_PER_MILE}
              strokeColor={colors.accent}
              strokeWidth={2}
            />
            <Marker
              accessibilityLabel={`${rider.name}, approximate area`}
              coordinate={rider.approximateArea.center}
              description="Approximate area"
              title={rider.name}
            >
              <View style={styles.riderMarker}>
                <Ionicons color={colors.accent} name="person" size={18} />
              </View>
            </Marker>
          </Fragment>
        ))}
      </MapView>

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View pointerEvents="none" style={styles.schedulePosition}>
          <TodayCommuteCard commute={commute} today={today} />
        </View>
        <Pressable
          accessibilityLabel="Recenter map on your location"
          accessibilityRole="button"
          onPress={recenterMap}
          style={({ pressed }) => [styles.recenterButton, pressed && styles.recenterPressed]}
        >
          <Ionicons color={colors.accent} name="locate" size={24} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  messageContainer: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  message: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  schedulePosition: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
  },
  scheduleCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    elevation: 2,
    minWidth: 152,
    padding: spacing.md,
    shadowColor: '#17212b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  scheduleDay: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: spacing.xs,
  },
  scheduleMode: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  scheduleTime: {
    color: colors.text,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 19,
  },
  scheduleEmpty: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  scheduleDestination: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  scheduleDestinationLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  scheduleDestinationValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    maxWidth: 150,
  },
  recenterButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    bottom: spacing.lg,
    elevation: 2,
    height: 48,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.lg,
    shadowColor: '#17212b',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    width: 48,
  },
  recenterPressed: {
    opacity: 0.7,
  },
  destinationMarker: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 2,
    elevation: 3,
    height: 36,
    justifyContent: 'center',
    shadowColor: '#17212b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    width: 36,
  },
  riderMarker: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderRadius: radii.pill,
    borderWidth: 2,
    elevation: 2,
    height: 34,
    justifyContent: 'center',
    shadowColor: '#17212b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
    width: 34,
  },
});
