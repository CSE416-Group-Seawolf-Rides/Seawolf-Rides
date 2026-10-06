import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import type { CommuteSchedule, Weekday } from '../commute/commuteModel';
import { dayModeLabels, formatTime, weekdays } from '../commute/commuteModel';
import { colors, radii, spacing } from '../theme';

interface MapScreenProps {
  commute: CommuteSchedule | null;
  today: Weekday;
}

type MapStatus = 'loading' | 'ready' | 'denied' | 'error';

const LOCATION_DELTA = 0.02;

function regionAround(latitude: number, longitude: number): Region {
  return {
    latitude,
    longitude,
    latitudeDelta: LOCATION_DELTA,
    longitudeDelta: LOCATION_DELTA,
  };
}

function TodayCommuteCard({ commute, today }: MapScreenProps) {
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
    </View>
  );
}

export function MapScreen({ commute, today }: MapScreenProps) {
  const mapRef = useRef<MapView>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);

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
      <MapView initialRegion={initialRegion} ref={mapRef} style={styles.map}>
        <Marker
          accessibilityLabel="Your location"
          coordinate={initialRegion}
          title="Your location"
        >
          <Ionicons color={colors.accent} name="location" size={44} />
        </Marker>
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
});
