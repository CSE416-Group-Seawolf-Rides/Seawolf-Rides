import { StyleSheet, Text, View } from 'react-native';
import { PublicProfileLink } from '../../profiles/PublicProfileLink';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { colors, spacing } from '../../theme';
import { AppButton } from '../../components/AppButton';
import { requestCanCancel, requestRecipient, type RideRequest } from '../rideRequestModel';
import { historyLabel, partnerId, partnerName, rideDate, rideEnd, rideTime } from '../ridePresentation';
import { adjustmentNote, formatCents } from '../../payments/pricing';
import { RideCancellationNotice } from './CancelRideButton';

export function LiveRequestCard({
  ride,
  uid,
  now,
  onCancel,
  busyId,
}: {
  ride: RideRequest;
  uid: string;
  now: number;
  onCancel?: (ride: RideRequest) => void;
  busyId?: string | null;
}) {
  const isReturn = ride.direction === 'FROM_CAMPUS';
  const status =
    ride.status === 'ACCEPTED' && rideEnd(ride) > now
      ? 'Confirmed'
      : ride.status === 'PENDING' && ride.plan.departure > now
        ? 'Pending'
        : historyLabel(ride);
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <PublicProfileLink participantId={partnerId(ride, uid)} name={partnerName(ride, uid)}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Avatar name={partnerName(ride, uid)} participantId={partnerId(ride, uid)} />
          <View style={styles.copy}>
            <Text style={styles.name}>{partnerName(ride, uid)}</Text>
            <Text style={styles.detail}>
              {ride.driverId === uid ? 'Rides with you' : 'Drives you'} · {rideDate(ride.localDate)}
            </Text>
          </View>
        </PublicProfileLink>
        <Text style={[styles.status, status === 'Confirmed' && { color: colors.success }]}>
          {status}
        </Text>
      </View>
      <Text style={styles.route}>
        {isReturn
          ? `${ride.campusLabel} → ${ride.dropoffLabel ?? (partnerId(ride, uid) === ride.riderId ? `${ride.riderName}’s area` : 'Home')}`
          : `${ride.pickupLabel} → ${ride.campusLabel}`}
      </Text>
      {ride.price && (
        <Text style={styles.price}>
          {ride.driverId === uid
            ? `Chips in ${formatCents(ride.price.cents)} for gas`
            : `Gas share ${formatCents(ride.price.cents)}`}
          {adjustmentNote(ride.price, ride.driverId === uid ? null : ride.driverName)
            ? ` · ${adjustmentNote(ride.price, ride.driverId === uid ? null : ride.driverName)}`
            : ''}
        </Text>
      )}
      {ride.driverId === uid && (
        <Text style={styles.detail}>
          Leave {isReturn ? ride.campusLabel : 'your starting point'} · {rideTime(ride.plan.departure)}
        </Text>
      )}
      <View style={styles.timing}>
        <View style={styles.copy}>
          <Text style={styles.caption}>PICKUP</Text>
          <Text style={styles.time}>{rideTime(ride.plan.pickup)}</Text>
        </View>
        <View style={styles.copy}>
          <Text style={styles.caption}>{isReturn ? 'DROP-OFF' : 'CAMPUS ARRIVAL'}</Text>
          <Text style={styles.time}>{rideTime(ride.plan.riderDestinationArrival)}</Text>
        </View>
      </View>
      <Text style={styles.detail}>
        Adds {Math.ceil(ride.metrics.driverExtraDurationSeconds / 60)} minutes driving · New York
        time
      </Text>
      {ride.status === 'PENDING' && status === 'Pending' && (
        <Text style={styles.detail}>
          {requestRecipient(ride) === uid
            ? 'Waiting for your answer.'
            : `Waiting for ${partnerName(ride, uid)}’s answer.`}{' '}
          No seat is reserved until acceptance.
        </Text>
      )}
      <RideCancellationNotice ride={ride} uid={uid} />
      {onCancel && requestCanCancel(ride, uid) && (
        <AppButton
          label={busyId === ride.id ? 'Cancelling…' : 'Cancel request'}
          variant="secondary"
          disabled={!!busyId}
          onPress={() => onCancel(ride)}
        />
      )}
    </Card>
  );
}
const styles = StyleSheet.create({
  price: { color: colors.success, fontSize: 14, fontWeight: '700' },
  card: { gap: spacing.md, padding: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  copy: { flex: 1, gap: spacing.xs },
  name: { fontSize: 18, fontWeight: '800', color: colors.text },
  detail: { fontSize: 14, lineHeight: 21, color: colors.textMuted },
  status: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  route: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 22,
  },
  timing: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  caption: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  time: { fontSize: 20, fontWeight: '800', color: colors.text },
});
