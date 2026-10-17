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
import { participantIdForOffer, participantIdForRequest, resolvePublicProfile } from '../profiles/publicProfiles';
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
  onOpenRider: (participantId: string, displayName: string) => void;
  onMessage?: () => void;
  onViewPickupRoute?: () => void;
}

export function TripDetailScreen({
  trip,
  bookedDays,
  onBack,
  onSkip,
  onUndoSkip,
  onStopRiding,
  onOpenDriver,
  onOpenRider,
  onMessage,
  onViewPickupRoute,
}: TripDetailScreenProps) {
  const [confirming, setConfirming] = useState(false);
  const riding = trip.kind === 'ride';
  const driver = trip.offer?.driverName ?? 'your driver';
  const riders = trip.riders ?? [];
  const riderNames = riders.map((rider) => rider.riderName).join(' and ');
  const proposal = trip.proposal;
  const driverParticipantId = trip.offer ? participantIdForOffer(trip.offer) : null;
  const driverProfile = driverParticipantId ? resolvePublicProfile(driverParticipantId, driver) : null;
  const proposalTime = (epoch: number, timeZone: string) => new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone,
  }).format(new Date(epoch * 1000));

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
              note={proposal ? 'Confirmed in the accepted dated proposal.' : `Suggested by ${driver}. Need a different spot? Sort it out in chat.`}
              spot={proposal?.agreed.pickup.label ?? trip.offer.pickupSpot}
              time={trip.pickupTime !== undefined ? `~${formatTime(trip.pickupTime)}` : undefined}
            />
          )}

          <Pressable
            accessibilityHint="Opens the driver’s commute"
            accessibilityRole="button"
            onPress={onOpenDriver}
            style={({ pressed }) => [styles.person, pressed && styles.pressed]}
          >
            <Avatar name={driver} participantId={driverParticipantId ?? undefined} sampleAvatar={driverProfile?.sampleAvatar} size={52} />
            <View style={styles.personCopy}>
              <Text style={styles.personName}>{driver}</Text>
              <Text style={styles.personMeta}>{trip.offer.vehicle}</Text>
              <Text style={styles.personMeta}>Stony Brook verified</Text>
            </View>
          </Pressable>

          <Card style={styles.details}>
            {proposal && <DetailRow label="Proposal" value={`${proposal.occurrence.localDate} · TO CAMPUS only`} />}
            {!proposal && <DetailRow label="Request type" value="Legacy recurring · not a dated evaluation" />}
            {proposal && <DetailRow label="Seats requested" value={String(proposal.agreed.requestedSeats)} />}
            {trip.pickupTime !== undefined && (
              <DetailRow label="Pickup" value={`Around ${formatTime(trip.pickupTime)}`} />
            )}
            {trip.arriveBy !== null && (
              <DetailRow
                label="Arrives on campus"
                value={`${formatTime(trip.arriveBy)} · ${lotTitle(trip.campusLot)}`}
              />
            )}
            {proposal && <DetailRow label="Evaluated times" value={`Pickup ${proposalTime(proposal.routingEstimates.plan.pickup, proposal.occurrence.timeZone)} · campus ${proposalTime(proposal.routingEstimates.plan.vehicleCampusArrival, proposal.occurrence.timeZone)}`} />}
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
            <DetailRow label="Seats" value={`${riders.reduce((total, rider) => total + (rider.proposal?.agreed.requestedSeats ?? 1), 0)} of ${trip.seats ?? riders.length} filled`} />
          </Card>

          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Pickups
          </Text>
          {riders.map((rider) => (
            <Card key={rider.id} style={styles.rider}>
              <Pressable accessibilityLabel={`View ${rider.riderName}'s profile`} accessibilityRole="button" onPress={() => onOpenRider(participantIdForRequest(rider), rider.riderName)} style={({ pressed }) => [styles.riderHeader, pressed && styles.pressed]}>
                <Avatar name={rider.riderName} participantId={participantIdForRequest(rider)} sampleAvatar={resolvePublicProfile(participantIdForRequest(rider), rider.riderName).sampleAvatar} />
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>{rider.riderName}</Text>
                  <Text style={styles.personMeta}>{rider.proposal ? `${rider.proposal.occurrence.localDate} · ${rider.proposal.agreed.requestedSeats} seat${rider.proposal.agreed.requestedSeats === 1 ? '' : 's'}` : `Legacy recurring · needs to arrive by ${formatTime(rider.arriveBy)}`}</Text>
                </View>
                <Text style={styles.added}>+{rider.proposal ? Math.round(rider.proposal.routingEstimates.metrics.driverExtraDurationSeconds / 60) : rider.addedMinutes} min</Text>
              </Pressable>
              {!trip.skipped && <Text style={styles.riderSpot}>{rider.proposal?.agreed.pickup.label ?? rider.pickupSpot}</Text>}
            </Card>
          ))}
        </>
      )}

      {!trip.skipped && (
        <View style={styles.actions}>
          {onViewPickupRoute && <AppButton label="View pickup route" onPress={onViewPickupRoute} />}
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
