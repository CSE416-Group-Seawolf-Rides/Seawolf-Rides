import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Region } from 'react-native-maps';

import { colors, spacing } from '../theme';

type MapStatus = 'loading' | 'ready' | 'denied' | 'error';

const LOCATION_DELTA = 0.02;

export function MapScreen() {
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
          setInitialRegion({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            latitudeDelta: LOCATION_DELTA,
            longitudeDelta: LOCATION_DELTA,
          });
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
    <MapView
      initialRegion={initialRegion}
      showsMyLocationButton
      showsUserLocation
      style={styles.map}
    />
  );
}

const styles = StyleSheet.create({
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
});
