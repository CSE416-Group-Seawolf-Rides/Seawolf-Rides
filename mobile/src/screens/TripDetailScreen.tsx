import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Avatar } from '../components/Avatar';
import { Card } from '../components/Card';
import { ChoiceSheet } from '../components/ChoiceSheet';
import { DetailRow } from '../components/DetailRow';
import { Screen } from '../components/Screen';
import { describeWeekdays, formatTime, lotTitle, Weekday } from '../commute/commuteModel';
import { PickupSpotCard } from '../rides/components/PickupSpotCard';
import { Trip } from '../rides/rideModel';
import { colors, radii, spacing } from '../theme';

interface TripDetailScreenProps {
  trip: Trip;
  // The recurring days booked with this driver; used to spell out what "stop riding" cancels.
  bookedDays: Weekday[];
  onBack: () => void;
  onSkip: () => void;
  onUndoSkip: () => void;
  onStopRiding: () => void;
  onOpenDriver: () => void;
  onMessage?: () => void;
}

export function TripDetailScreen({
  trip,
  bookedDays,
  onBack,
  onSkip,
  onUndoSkip,
  onStopRiding,
  onOpenDriver,
  onMessage,
}: TripDetailScreenProps) {
  const [confirming, setConfirming] = useState(false);
  const riding = trip.kind === 'ride';
  const driver = trip.offer?.driverName ?? 'your driver';
  const riders = trip.riders ?? [];
  const riderNames = riders.map((rider) => rider.riderName).join(' and ');

  return (
    <Screen
      eyebrow={`${riding ? 'RIDE' : 'DRIVE'} · ${trip.whenLabel.toUpperCase()}`}
      onBack={onBack}
      subtitle={
        trip.arriveBy !== null
          ? `Arrive ${riding ? '~' : 'by '}${formatTime(trip.arriveBy)} at ${lotTitle(trip.campusLot)}`
          : `Leave campus at ${formatTime(trip.leaveAt!)} from ${lotTitle(trip.campusLot)}`
      }
      title={trip.dateLabel}
    >
      {trip.skipped && (
        <View style={styles.skipped}>
          <Text style={styles.skippedTitle}>You’re skipping this {riding ? 'ride' : 'drive'}</Text>
          <Text style={styles.skippedBody}>
            {riding
              ? `${driver} knows you won’t need a seat. Your other days are still booked.`
              : `${riderNames} ${riders.length === 1 ? 'was' : 'were'} told to find another ride for this day.`}
          </Text>
          <AppButton label="Undo skip" onPress={onUndoSkip} variant="secondary" />
        </View>
      )}

      {riding && trip.offer && (
        <>
          {!trip.skipped && trip.pickupTime !== undefined && (
            <PickupSpotCard
              note={`Suggested by ${driver}. Need a different spot? Sort it out in chat.`}
              spot={trip.offer.pickupSpot}
              time={trip.pickupTime !== undefined ? `~${formatTime(trip.pickupTime)}` : undefined}
            />
          )}

          <Pressable
            accessibilityHint="Opens the driver’s commute"
            accessibilityRole="button"
            onPress={onOpenDriver}
            style={({ pressed }) => [styles.person, pressed && styles.pressed]}
          >
            <Avatar name={driver} size={52} />
            <View style={styles.personCopy}>
              <Text style={styles.personName}>{driver}</Text>
              <Text style={styles.personMeta}>{trip.offer.vehicle}</Text>
              <Text style={styles.personMeta}>Stony Brook verified</Text>
            </View>
          </Pressable>

          <Card style={styles.details}>
            {trip.pickupTime !== undefined && (
              <DetailRow label="Pickup" value={`Around ${formatTime(trip.pickupTime)}`} />
            )}
            {trip.arriveBy !== null && (
              <DetailRow
                label="Arrives on campus"
                value={`${formatTime(trip.arriveBy)} · ${lotTitle(trip.campusLot)}`}
              />
            )}
            {trip.leaveAt !== null && (
              <DetailRow label="Ride home" value={`Leaves campus ${formatTime(trip.leaveAt)}`} />
            )}
          </Card>
        </>
      )}

      {!riding && (
        <>
          <Card style={styles.details}>
            {trip.arriveBy !== null && (
              <DetailRow
                label="Arrive by"
                value={`${formatTime(trip.arriveBy)} · ${lotTitle(trip.campusLot)}`}
              />
            )}
            {trip.leaveAt !== null && (
              <DetailRow label="Leave campus" value={formatTime(trip.leaveAt)} />
            )}
            <DetailRow label="Seats" value={`${riders.length} of ${trip.seats ?? riders.length} filled`} />
          </Card>

          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Pickups
          </Text>
          {riders.map((rider) => (
            <Card key={rider.id} style={styles.rider}>
              <View style={styles.riderHeader}>
                <Avatar name={rider.riderName} />
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>{rider.riderName}</Text>
                  <Text style={styles.personMeta}>Needs to arrive by {formatTime(rider.arriveBy)}</Text>
                </View>
                <Text style={styles.added}>+{rider.addedMinutes} min</Text>
              </View>
              {!trip.skipped && <Text style={styles.riderSpot}>{rider.pickupSpot}</Text>}
            </Card>
          ))}
        </>
      )}

      {!trip.skipped && (
        <View style={styles.actions}>
          {onMessage && <AppButton label={`Message ${driver}`} onPress={onMessage} />}
          <AppButton label="Can’t make it" onPress={() => setConfirming(true)} variant="secondary" />
        </View>
      )}

      {confirming && (
        <ChoiceSheet
          choices={
            riding
              ? [
                  {
                    label: `Skip ${trip.dateLabel} only`,
                    description: `${driver} gets your seat back for that day. Your other days stay booked.`,
                    onPress: () => {
                      setConfirming(false);
                      onSkip();
                    },
                  },
                  {
                    label: `Stop riding with ${driver}`,
                    description: `Cancels every day you booked (${describeWeekdays(bookedDays)}). ${driver} will be notified.`,
                    destructive: true,
                    onPress: () => {
                      setConfirming(false);
                      onStopRiding();
                    },
                  },
                ]
              : [
                  {
                    label: `Skip driving on ${trip.dateLabel}`,
                    description: `${riderNames} will be told to find another ride that day. Your other days aren’t affected.`,
                    destructive: true,
                    onPress: () => {
                      setConfirming(false);
                      onSkip();
                    },
                  },
                ]
          }
          message={
            riding
              ? 'Let your driver know early so they can plan their morning.'
              : 'Your riders are counting on you, so tell them as early as you can.'
          }
          onClose={() => setConfirming(false)}
          title={`Can’t make it on ${trip.whenLabel === 'Today' || trip.whenLabel === 'Tomorrow' ? trip.whenLabel.toLowerCase() : trip.dateLabel}?`}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  skipped: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  skippedTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  skippedBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  person: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  personCopy: {
    flex: 1,
    gap: 2,
  },
  personName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  personMeta: {
    color: colors.textMuted,
    fontSize: 14,
  },
  details: {
    gap: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  rider: {
    gap: spacing.md,
  },
  riderHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  added: {
    color: colors.text,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  riderSpot: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    overflow: 'hidden',
    padding: spacing.md,
  },
  actions: {
    gap: spacing.md,
  },
});
