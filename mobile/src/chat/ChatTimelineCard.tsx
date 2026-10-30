import { useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppButton } from '../components/AppButton';
import { ChatRequestCard } from './ChatContextCard';
import { partnerName } from '../mvp/ridePresentation';
import type { RideRequest } from '../mvp/rideRequestModel';
import { formatCents } from '../payments/pricing';
import { respondToRidePriceChange } from '../payments/paymentsClient';
import type { PriceChangeDecision } from '../payments/priceChanges';
import { colors } from '../theme';
import { chatContext, type ChatMessage } from './chatModel';
import { priceChangeLabel, timelinePriceActions, timelineRideStatus } from './chatTimeline';

/** A persisted conversation entry; status updates never change its identity or timestamp. */
export function ChatTimelineCard({ entry, uid, now, onViewRide }: {
  entry: ChatMessage; uid: string; now: number; onViewRide: (ride: RideRequest) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const { ride, priceChange } = entry;
  if (!ride || (entry.type !== 'RIDE_REQUEST' && entry.type !== 'PRICE_CHANGE')) return null;
  const priceCard = entry.type === 'PRICE_CHANGE' && !!priceChange;
  const status = priceCard ? priceChangeLabel(priceChange.status) : timelineRideStatus(ride, now);
  const actions = timelinePriceActions(entry, uid);
  const name = entry.senderId === uid ? 'You' : partnerName(ride, uid);
  const respond = async (decision: PriceChangeDecision) => {
    if (!priceChange || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await respondToRidePriceChange(ride.id, priceChange.id, decision); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update this price change. Try again.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const thread = { names: { [ride.driverId]: ride.driverName, [ride.riderId]: ride.riderName } };
  const context = chatContext(thread, uid, ride);
  return <ChatRequestCard title={priceCard
    ? `${name} proposed a price change` : context.title} status={status} trip={context.trip}
    localDate={ride.localDate} campusLabel={ride.campusLabel} onViewTrip={() => onViewRide(ride)}>
    {priceCard ? <>
      <Text style={styles.amount}>{formatCents(priceChange.fromCents)} → {formatCents(priceChange.toCents)}</Text>
      {priceChange.status === 'PENDING' && <Text style={styles.detail}>The agreed price stays {formatCents(priceChange.fromCents)} until accepted.</Text>}
      {priceChange.status === 'DECLINED' && <Text style={styles.detail}>This proposal was rejected. The ride stayed booked at its previous price.</Text>}
    </> : <>
      {ride.price && <Text style={styles.amount}>{ride.status === 'ACCEPTED' ? 'Agreed gas share' : 'Gas share'} · {formatCents(ride.price.cents)}</Text>}
      {ride.cancellation && <Text style={styles.detail}>Reason: {ride.cancellation.reason}</Text>}
    </>}
    {actions === 'RESPOND' && <>
      <AppButton label={busy ? 'Saving…' : `Accept ${formatCents(priceChange!.toCents)}`} disabled={busy} onPress={() => void respond('ACCEPTED')} />
      <AppButton label="Reject price change" variant="secondary" disabled={busy} onPress={() => void respond('DECLINED')} />
    </>}
    {actions === 'WITHDRAW' && <AppButton label={busy ? 'Withdrawing…' : 'Withdraw price change'} variant="secondary" disabled={busy} onPress={() => void respond('CANCELLED')} />}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Text style={styles.timestamp}>{new Date(entry.sentAt).toLocaleString()}</Text>
  </ChatRequestCard>;
}
const styles = StyleSheet.create({
  detail: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  amount: { color: colors.text, fontSize: 16, fontWeight: '700' },
  timestamp: { color: colors.textMuted, fontSize: 11 },
  error: { color: colors.error, fontSize: 13 },
});
