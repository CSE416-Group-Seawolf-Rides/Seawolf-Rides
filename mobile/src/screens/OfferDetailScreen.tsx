import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Avatar } from '../components/Avatar';
import { Card } from '../components/Card';
import { ChoiceSheet } from '../components/ChoiceSheet';
import { DetailRow } from '../components/DetailRow';
import { Screen } from '../components/Screen';
import { describeWeekdays, formatTime, lotTitle, Weekday } from '../commute/commuteModel';
import { DayPills } from '../rides/components/DayPills';
import { PickupSpotCard } from '../rides/components/PickupSpotCard';
import { RequestSheet } from '../rides/components/RequestSheet';
import { StatusPill } from '../rides/components/StatusPill';
import { describeArrivalFit, DriverMatch, RequestStatus } from '../rides/rideModel';
import { colors, spacing } from '../theme';

interface OfferDetailScreenProps {
  match: DriverMatch;
  requestStatus?: RequestStatus;
  requestedDays: Weekday[];
  // Shared days not yet requested from anyone; what a new request can ask for.
  requestableDays: Weekday[];
  hasCommute: boolean;
  canRequest: boolean;
  onBack: () => void;
  onSendRequest: (days: Weekday[]) => void;
  onCancelRequest: () => void;
  onMessage?: () => void;
  onSetUpCommute: () => void;
}

export function OfferDetailScreen({
  match,
  requestStatus,
  requestedDays,
  requestableDays,
  hasCommute,
  canRequest,
  onBack,
  onSendRequest,
  onCancelRequest,
  onMessage,
  onSetUpCommute,
}: OfferDetailScreenProps) {
  const [requesting, setRequesting] = useState(false);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const { offer, sharedDays, arrivalGap } = match;
  const fit = describeArrivalFit(arrivalGap);

  return (
    <Screen onBack={onBack} title={offer.driverName}>
      <Card style={styles.profile}>
        <Avatar name={offer.driverName} size={64} />
        <View style={styles.profileCopy}>
          <Text style={styles.area}>{offer.startAreaLabel}</Text>
          <Text style={styles.verified}>Stony Brook verified · {offer.vehicle}</Text>
        </View>
      </Card>

      <Card style={styles.details}>
        <Text style={styles.cardTitle}>Their commute</Text>
        <DetailRow label="Heading to" value={lotTitle(offer.campusLot)} />
        <DetailRow label="Pickup" value={`Around ${formatTime(offer.pickupTime)}`} />
        <DetailRow label="Arrives on campus" value={formatTime(offer.arriveBy)} />
        {offer.leaveAt !== null && (
          <DetailRow label="Leaves campus" value={formatTime(offer.leaveAt)} />
        )}
        <DetailRow label="Seats open" value={String(offer.seatsLeft)} />
        <View style={styles.days}>
          <Text style={styles.daysLabel}>Days</Text>
          <DayPills days={offer.days} highlighted={sharedDays} />
          {sharedDays.length > 0 && (
            <Text style={styles.hint}>Highlighted days match your commute.</Text>
          )}
        </View>
        {fit && <Text style={[styles.fit, !fit.good && styles.fitLate]}>{fit.label}</Text>}
      </Card>

      {requestStatus === 'accepted' ? (
        <PickupSpotCard
          note={`Suggested by ${offer.driverName}. Need a different spot? Sort it out in chat.`}
          spot={offer.pickupSpot}
          time={`~${formatTime(offer.pickupTime)}`}
        />
      ) : (
        <Text style={styles.privacy}>
          {offer.driverName} shares an exact pickup spot after accepting. Neither of you sees the
          other’s address.
        </Text>
      )}

      {requestStatus === undefined &&
        (canRequest ? (
          <AppButton label="Request a ride" onPress={() => setRequesting(true)} />
        ) : hasCommute ? (
          <Text style={styles.noOverlap}>
            {offer.driverName} doesn’t commute on any of your days.
          </Text>
        ) : (
          <AppButton label="Set up your commute to request" onPress={onSetUpCommute} />
        ))}

      {requestStatus === 'pending' && (
        <View style={styles.status}>
          <StatusPill label={`Requested · waiting for ${offer.driverName}`} tone="warning" />
          <AppButton label="Cancel request" onPress={onCancelRequest} variant="secondary" />
        </View>
      )}

      {requestStatus === 'accepted' && (
        <View style={styles.status}>
          <StatusPill label={`Confirmed · ${describeWeekdays(requestedDays)}`} tone="success" />
          {onMessage && <AppButton label={`Message ${offer.driverName}`} onPress={onMessage} />}
          {requestableDays.length > 0 && (
            <AppButton
              label={`Also ride ${describeWeekdays(requestableDays)}`}
              onPress={() => setRequesting(true)}
              variant="secondary"
            />
          )}
          <AppButton
            label={`Stop riding with ${offer.driverName}`}
            onPress={() => setConfirmingStop(true)}
            variant="secondary"
          />
        </View>
      )}

      {confirmingStop && (
        <ChoiceSheet
          cancelLabel="Keep my rides"
          choices={[
            {
              label: `Stop riding with ${offer.driverName}`,
              description: `Cancels every day you booked (${describeWeekdays(requestedDays)}). ${offer.driverName} will be notified.`,
              destructive: true,
              onPress: () => {
                setConfirmingStop(false);
                onCancelRequest();
              },
            },
          ]}
          message="Only missing one day? Open that trip in Rides and skip just that date."
          onClose={() => setConfirmingStop(false)}
          title={`Stop riding with ${offer.driverName}?`}
        />
      )}

      {requesting && (
        <RequestSheet
          offer={offer}
          onClose={() => setRequesting(false)}
          onSend={(days) => {
            onSendRequest(days);
            setRequesting(false);
          }}
          sharedDays={requestableDays}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  profileCopy: {
    flex: 1,
    gap: 4,
  },
  area: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  verified: {
    color: colors.textMuted,
    fontSize: 14,
  },
  details: {
    gap: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  days: {
    gap: spacing.sm,
  },
  daysLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  fit: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '700',
  },
  fitLate: {
    color: colors.warning,
  },
  privacy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: spacing.sm,
    textAlign: 'center',
  },
  noOverlap: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  status: {
    gap: spacing.md,
  },
});
