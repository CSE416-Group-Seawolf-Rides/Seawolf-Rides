import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import { formatTime, lotTitle } from '../../commute/commuteModel';
import { colors, radii, spacing } from '../../theme';
import { NextTrip } from '../rideModel';

interface NextTripCardProps {
  trip: NextTrip;
  onMessage?: () => void;
  onDetails?: () => void;
}

// The one thing someone most needs when they open the app: their next confirmed trip.
export function NextTripCard({ trip, onMessage, onDetails }: NextTripCardProps) {
  const riding = trip.kind === 'ride';
  const riders = trip.riders ?? [];

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>
        {riding ? 'NEXT RIDE' : 'NEXT DRIVE'} · {trip.whenLabel.toUpperCase()}
      </Text>

      {riding && trip.offer && trip.pickupTime !== undefined ? (
        <>
          <Text style={styles.headline}>{formatTime(trip.pickupTime)} pickup</Text>
          <Text style={styles.detail}>
            with {trip.offer.driverName} · {trip.offer.vehicle}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.headline}>
            {riders.length} rider{riders.length === 1 ? '' : 's'} to pick up
          </Text>
          <Text style={styles.detail}>
            {riders.map((rider) => rider.riderName).join(', ')} · {riders.length} of {trip.seats}{' '}
            seats filled
          </Text>
        </>
      )}
      <Text style={styles.detail}>
        Arrive {riding ? '~' : 'by '}
        {formatTime(trip.arriveBy)} at {lotTitle(trip.campusLot)}
      </Text>

      {(onMessage || onDetails) && (
        <View style={styles.actions}>
          {onDetails && (
            <View style={styles.action}>
              <AppButton label="Details" onPress={onDetails} variant="secondary" />
            </View>
          )}
          {onMessage && (
            <View style={styles.action}>
              <AppButton label="Message" onPress={onMessage} variant="secondary" />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  eyebrow: {
    color: colors.accentSoft,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: spacing.xs,
  },
  headline: {
    color: colors.surface,
    fontSize: 28,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  detail: {
    color: colors.accentSoft,
    fontSize: 15,
    lineHeight: 21,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  action: {
    flex: 1,
  },
});
