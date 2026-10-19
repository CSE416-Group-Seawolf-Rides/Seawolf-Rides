import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Platform, Text } from 'react-native';

import { AppButton } from '../components/AppButton';
import type { RideRequest } from '../mvp/rideRequestModel';
import { CAMPUS_POINTS } from '../mvp/settings';
import { colors } from '../theme';
import { useAcceptedPickup } from './acceptedPickups';
import { tripDirectionsUrl } from './tripDirections';

// On ride day, getting there is the main job, so Home offers the whole route in one tap:
// current location → pickup → campus lot (riders get pickup → campus).
export function RideDayDirections({ ride, uid }: { ride: RideRequest; uid: string }) {
  const { pickup } = useAcceptedPickup(ride);
  const [message, setMessage] = useState('');
  if (!pickup) return null;
  const campus = pickup.campus ?? CAMPUS_POINTS.find((p) => p.label === ride.campusLabel)?.coordinate;
  const driving = ride.driverId === uid;
  const open = async () => {
    try {
      await Linking.openURL(
        tripDirectionsUrl(Platform.OS, campus ? [pickup.riderPickup] : [], campus ?? pickup.riderPickup),
      );
    } catch {
      setMessage('Couldn’t open Maps. View the ride for the pickup pin.');
    }
  };
  return (
    <>
      <AppButton
        label={driving ? `Start directions · ${ride.riderName}, then ${ride.campusLabel}` : `Directions to ${ride.campusLabel}`}
        onPress={() => void open()}
      />
      {message ? <Text style={{ color: colors.error }}>{message}</Text> : null}
    </>
  );
}
