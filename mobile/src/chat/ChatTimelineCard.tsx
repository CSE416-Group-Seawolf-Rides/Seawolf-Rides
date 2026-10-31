import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { ChatRequestCard } from './ChatContextCard';
import { partnerName, rideTime } from '../mvp/ridePresentation';
import type { RideRequest } from '../mvp/rideRequestModel';
import { formatTimeDelta, type RideAmendmentDecision } from '../mvp/rideAmendmentModel';
import { formatCents } from '../payments/pricing';
import { respondToRidePriceChange } from '../payments/paymentsClient';
import { respondToRideAmendment } from '../rides/rideAmendmentClient';
import type { PriceChangeDecision } from '../payments/priceChanges';
import { colors, spacing } from '../theme';
import { chatContext, type ChatMessage } from './chatModel';
import {
  amendmentStatusLabel,
  priceChangeLabel,
  timelineAmendmentActions,
  timelinePriceActions,
  timelineRideStatus,
} from './chatTimeline';

/** A persisted conversation entry; status updates never change its identity or timestamp. */
export function ChatTimelineCard({
  entry,
  uid,
  now,
  onViewRide,
}: {
  entry: ChatMessage;
  uid: string;
  now: number;
  onViewRide: (ride: RideRequest) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const { ride, priceChange, amendment } = entry;

  if (
    !ride ||
    (entry.type !== 'RIDE_REQUEST' &&
      entry.type !== 'PRICE_CHANGE' &&
      entry.type !== 'RIDE_AMENDMENT')
  ) {
    return null;
  }

  const priceCard = entry.type === 'PRICE_CHANGE' && !!priceChange;
  const amendmentCard = entry.type === 'RIDE_AMENDMENT' && !!amendment;

  const status = amendmentCard
    ? amendmentStatusLabel(amendment.status)
    : priceCard
      ? priceChangeLabel(priceChange.status)
      : timelineRideStatus(ride, now);

  const priceActions = timelinePriceActions(entry, uid);
  const amendmentActions = timelineAmendmentActions(entry, uid);

  const name = entry.senderId === uid ? 'You' : partnerName(ride, uid);

  const respondPrice = async (decision: PriceChangeDecision) => {
    if (!priceChange || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await respondToRidePriceChange(ride.id, priceChange.id, decision);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Could not update this price change. Try again.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const respondAmendmentAction = async (decision: RideAmendmentDecision) => {
    if (!amendment || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await respondToRideAmendment(ride.id, amendment.id, decision);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Could not update trip change. Try again.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const thread = { names: { [ride.driverId]: ride.driverName, [ride.riderId]: ride.riderName } };
  const context = chatContext(thread, uid, ride);

  const cardTitle = amendmentCard
    ? `${name} requested a trip change`
    : priceCard
      ? `${name} proposed a price change`
      : context.title;

  return (
    <ChatRequestCard
      campusLabel={ride.campusLabel}
      localDate={ride.localDate}
      onViewTrip={() => onViewRide(ride)}
      status={status}
      title={cardTitle}
      trip={context.trip}
    >
      {amendmentCard && (
        <View style={styles.detailsGroup}>
          {(amendment.type === 'TIME' || amendment.type === 'BOTH') &&
            amendment.originalDeparture &&
            amendment.proposedDeparture && (
              <Text style={styles.amount}>
                Departure · {rideTime(amendment.originalDeparture)} → {rideTime(amendment.proposedDeparture)}{' '}
                <Text style={styles.highlight}>({formatTimeDelta(amendment.deltaSeconds ?? 0)})</Text>
              </Text>
            )}
          {(amendment.type === 'LOCATION' || amendment.type === 'BOTH') &&
            amendment.originalPickupLabel &&
            amendment.proposedPickupLabel && (
              <Text style={styles.amount}>
                Pickup · {amendment.originalPickupLabel} →{' '}
                <Text style={styles.highlight}>{amendment.proposedPickupLabel}</Text>
              </Text>
            )}
          {amendment.note && <Text style={styles.note}>{`"${amendment.note}"`}</Text>}
          {amendment.status === 'PENDING' && (
            <Text style={styles.detail}>The original trip schedule stays until accepted.</Text>
          )}
          {amendment.status === 'DECLINED' && (
            <Text style={styles.detail}>This change was declined. Original schedule retained.</Text>
          )}
        </View>
      )}

      {priceCard && (
        <>
          <Text style={styles.amount}>
            {formatCents(priceChange.fromCents)} → {formatCents(priceChange.toCents)}
          </Text>
          {priceChange.status === 'PENDING' && (
            <Text style={styles.detail}>
              The agreed price stays {formatCents(priceChange.fromCents)} until accepted.
            </Text>
          )}
          {priceChange.status === 'DECLINED' && (
            <Text style={styles.detail}>
              This proposal was rejected. The ride stayed booked at its previous price.
            </Text>
          )}
        </>
      )}

      {!amendmentCard && !priceCard && (
        <>
          {ride.price && (
            <Text style={styles.amount}>
              {ride.status === 'ACCEPTED' ? 'Agreed gas share' : 'Gas share'} ·{' '}
              {formatCents(ride.price.cents)}
            </Text>
          )}
          {ride.cancellation && <Text style={styles.detail}>Reason: {ride.cancellation.reason}</Text>}
        </>
      )}

      {priceActions === 'RESPOND' && (
        <>
          <AppButton
            disabled={busy}
            label={busy ? 'Saving…' : `Accept ${formatCents(priceChange!.toCents)}`}
            onPress={() => void respondPrice('ACCEPTED')}
          />
          <AppButton
            disabled={busy}
            label="Reject price change"
            onPress={() => void respondPrice('DECLINED')}
            variant="secondary"
          />
        </>
      )}
      {priceActions === 'WITHDRAW' && (
        <AppButton
          disabled={busy}
          label={busy ? 'Withdrawing…' : 'Withdraw price change'}
          onPress={() => void respondPrice('CANCELLED')}
          variant="secondary"
        />
      )}

      {amendmentActions === 'RESPOND' && (
        <>
          <AppButton
            disabled={busy}
            label={busy ? 'Saving…' : 'Accept change'}
            onPress={() => void respondAmendmentAction('ACCEPTED')}
          />
          <AppButton
            disabled={busy}
            label="Decline change"
            onPress={() => void respondAmendmentAction('DECLINED')}
            variant="secondary"
          />
        </>
      )}
      {amendmentActions === 'WITHDRAW' && (
        <AppButton
          disabled={busy}
          label={busy ? 'Withdrawing…' : 'Withdraw change request'}
          onPress={() => void respondAmendmentAction('CANCELLED')}
          variant="secondary"
        />
      )}

      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <Text style={styles.timestamp}>{new Date(entry.sentAt).toLocaleString()}</Text>
    </ChatRequestCard>
  );
}

const styles = StyleSheet.create({
  detailsGroup: { gap: spacing.xs },
  detail: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  amount: { color: colors.text, fontSize: 15, fontWeight: '700' },
  highlight: { color: colors.accent, fontWeight: '800' },
  note: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic', marginVertical: 2 },
  timestamp: { color: colors.textMuted, fontSize: 11 },
  error: { color: colors.error, fontSize: 13 },
});
