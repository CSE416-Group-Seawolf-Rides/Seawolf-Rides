import { useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '../../components/AppButton';
import { Card } from '../../components/Card';
import type { RideRequest } from '../../mvp/rideRequestModel';
import { partnerName, rideDate } from '../../mvp/ridePresentation';
import { colors, radii, spacing } from '../../theme';
import { newPriceProposalId, proposeRidePriceChange, respondToRidePriceChange } from '../paymentsClient';
import { formatCents } from '../pricing';
import { maximumAgreedPrice, type PriceChangeDecision } from '../priceChanges';

/** Each proposal changes one confirmed ride. The current price remains payable until accepted. */
export function RidePriceChange({ ride, uid, reviewOnly = false }: {
  ride: RideRequest; uid: string; reviewOnly?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(ride.price?.cents ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const attempt = useRef<{ id: string; cents: number; expectedCents: number } | null>(null);
  const price = ride.price;
  if (ride.status !== 'ACCEPTED' || !price
      || (uid !== ride.driverId && uid !== ride.riderId)) return null;
  if (ride.settledAt !== undefined) return reviewOnly ? null : <Text style={styles.detail}>
    {rideDate(ride.localDate)} · Paid gas share {formatCents(price.cents)}
  </Text>;
  const change = ride.priceChange;
  const pending = change?.status === 'PENDING';
  if (reviewOnly && !pending) return null;
  const name = partnerName(ride, uid);
  const maximum = maximumAgreedPrice(price);
  const send = async () => {
    if (lock.current || draft === price.cents) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (!attempt.current || attempt.current.cents !== draft || attempt.current.expectedCents !== price.cents)
        attempt.current = { id: newPriceProposalId(), cents: draft, expectedCents: price.cents };
      await proposeRidePriceChange(ride.id, attempt.current.id, draft, price.cents);
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Couldn’t send the price change. Try again.');
    } finally { lock.current = false; setBusy(false); }
  };
  const respond = async (decision: PriceChangeDecision) => {
    if (lock.current || !change) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try { await respondToRidePriceChange(ride.id, change.id, decision); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Couldn’t save your response. Try again.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={styles.content}>
    {pending && <Card style={styles.content}>
      <Text style={styles.heading}>Price change · {rideDate(ride.localDate)}</Text>
      <Text>{change.proposerId === uid ? `You proposed ${formatCents(change.toCents)} to ${name}` : `${name} proposed ${formatCents(change.toCents)}`}</Text>
      <Text style={styles.detail}>Current {formatCents(change.fromCents)} → Proposed {formatCents(change.toCents)}. The current price stays until accepted.</Text>
      {change.recipientId === uid ? <>
        <AppButton label={busy ? 'Saving…' : `Accept ${formatCents(change.toCents)}`} disabled={busy} onPress={() => void respond('ACCEPTED')} />
        <AppButton label="Reject price change" variant="secondary" disabled={busy} onPress={() => void respond('DECLINED')} />
      </> : <>
        <Text style={styles.detail}>Waiting for {name} to accept or reject.</Text>
        <AppButton label={busy ? 'Cancelling…' : 'Cancel price change'} variant="secondary" disabled={busy} onPress={() => void respond('CANCELLED')} />
      </>}
    </Card>}
    {!pending && !reviewOnly && <>
      <Text style={styles.detail}>
        {rideDate(ride.localDate)} · Agreed gas share {formatCents(price.cents)}
        {change ? ` · Price change ${change.status === 'ACCEPTED' ? 'accepted' : change.status === 'DECLINED' ? 'rejected' : change.status === 'CANCELLED' ? 'cancelled' : 'expired'}` : ''}
      </Text>
      <AppButton label="Request a price change" variant="secondary" onPress={() => {
        setDraft(price.cents); attempt.current = null; setError(''); setOpen(true);
      }} />
    </>}
    {!!error && !open && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {open && <Modal visible transparent animationType="slide" onRequestClose={() => { if (!busy) setOpen(false); }}>
      <View style={styles.backdrop}>
        <ScrollView style={styles.sheet} contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text accessibilityRole="header" style={styles.heading}>Propose a gas share</Text>
          <Text>{name} · {rideDate(ride.localDate)}</Text>
          <Text style={styles.detail}>Currently agreed: {formatCents(price.cents)}</Text>
          <Text style={styles.amount}>{formatCents(draft)}</Text>
          <View style={styles.stepper}>
            <View style={styles.step}><AppButton label="− $0.25" variant="secondary" disabled={busy || draft === 0} onPress={() => setDraft(Math.max(0, draft - 25))} /></View>
            <View style={styles.step}><AppButton label="+ $0.25" variant="secondary" disabled={busy || draft >= maximum} onPress={() => setDraft(Math.min(maximum, draft + 25))} /></View>
          </View>
          <Text style={styles.detail}>Up to {formatCents(maximum)} for this ride. {name} must accept before the agreed price changes. Rejecting keeps your ride and its original price.</Text>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <AppButton label={busy ? 'Sending…' : 'Send price-change request'} disabled={busy || draft === price.cents} onPress={() => void send()} />
          <AppButton label="Cancel" variant="secondary" disabled={busy} onPress={() => setOpen(false)} />
        </ScrollView>
      </View>
    </Modal>}
  </View>;
}

export function PriceChangeInbox({ rides, uid }: { rides: RideRequest[]; uid: string }) {
  const incoming = rides.filter((ride) => ride.status === 'ACCEPTED' && ride.priceChange?.status === 'PENDING' && ride.settledAt === undefined
    && (ride.driverId === uid || ride.riderId === uid));
  if (!incoming.length) return null;
  return <View style={styles.content}>
    <Text accessibilityRole="header" style={styles.heading}>Price-change requests</Text>
    {incoming.map((ride) => <RidePriceChange key={ride.id} ride={ride} uid={uid} reviewOnly />)}
  </View>;
}
const styles = StyleSheet.create({
  content: { gap: spacing.md },
  heading: { color: colors.text, fontSize: 18, fontWeight: '800' },
  detail: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  error: { color: colors.error },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23,33,43,0.4)' },
  sheet: { maxHeight: '90%', backgroundColor: colors.surface, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg },
  sheetContent: { gap: spacing.md, padding: spacing.lg },
  amount: { color: colors.text, fontSize: 32, fontWeight: '800', textAlign: 'center' },
  stepper: { flexDirection: 'row', gap: spacing.md },
  step: { flex: 1 },
});
