import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import { Avatar } from '../../components/Avatar';
import { formatTime, lotTitle } from '../../commute/commuteModel';
import { colors, radii, spacing } from '../../theme';
import { describeArrivalFit, DriverMatch, RequestStatus } from '../rideModel';
import { DayPills } from './DayPills';
import { StatusPill } from './StatusPill';

interface OfferCardProps {
  match: DriverMatch;
  requestStatus?: RequestStatus;
  canRequest: boolean;
  onOpen: () => void;
  onRequest: () => void;
}

export function OfferCard({ match, requestStatus, canRequest, onOpen, onRequest }: OfferCardProps) {
  const { offer, sharedDays, arrivalGap } = match;
  const fit = describeArrivalFit(arrivalGap);

  return (
    <Pressable
      accessibilityHint="Opens the driver’s commute"
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Avatar name={offer.driverName} />
        <View style={styles.headerCopy}>
          <Text style={styles.name}>{offer.driverName}</Text>
          <Text style={styles.meta}>
            {offer.startAreaLabel} → {lotTitle(offer.campusLot)}
          </Text>
        </View>
        <Text style={styles.seats}>
          {offer.seatsLeft} seat{offer.seatsLeft === 1 ? '' : 's'}
        </Text>
      </View>

      <Text style={styles.times}>
        Pickup ~{formatTime(offer.pickupTime)} · Arrives {formatTime(offer.arriveBy)}
      </Text>
      <DayPills days={offer.days} highlighted={sharedDays} />
      {fit && <Text style={[styles.fit, !fit.good && styles.fitLate]}>{fit.label}</Text>}

      {requestStatus === 'pending' && <StatusPill label="Requested · waiting" tone="warning" />}
      {requestStatus === 'accepted' && <StatusPill label="Confirmed" tone="success" />}
      {requestStatus === undefined && canRequest && (
        <AppButton
          accessibilityLabel={`Request a ride with ${offer.driverName}`}
          label="Request"
          onPress={onRequest}
          variant="secondary"
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 14,
  },
  seats: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  times: {
    color: colors.text,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  fit: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '700',
  },
  fitLate: {
    color: colors.warning,
  },
});
