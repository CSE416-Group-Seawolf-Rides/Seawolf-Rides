import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '../../components/AppButton';
import { colors, radii, spacing } from '../../theme';
import { acceptedRideCanCancel, cancellationReason, MAX_CANCELLATION_REASON_LENGTH } from '../rideCancellation';
import { cancelAcceptedRide } from '../rideRequestClient';
import type { RideRequest } from '../rideRequestModel';
import { partnerName, rideDate } from '../ridePresentation';
import { friendlyRideError } from '../rideErrors';

/** Shared by every confirmed-trip detail surface. Opening the sheet never changes the ride. */
export function CancelRideButton({ ride, uid, now, disabled = false }: {
  ride: RideRequest; uid: string; now: number; disabled?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [target, setTarget] = useState<RideRequest | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  if (!acceptedRideCanCancel(ride, uid, now)) return null;
  const close = () => { if (!lock.current) setTarget(null); };
  const confirm = async () => {
    const trimmed = cancellationReason(reason);
    if (!target || !trimmed || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      // Use the proposal reviewed when opening, so a resend cannot be cancelled by an old sheet.
      await cancelAcceptedRide(target, trimmed);
      setTarget(null);
    } catch (failure) {
      setError(friendlyRideError(failure, 'cancel', partnerName(target, uid)).message);
    } finally { lock.current = false; setBusy(false); }
  };
  return <View style={styles.content}>
    <AppButton label="Cancel Ride" variant="destructive" disabled={disabled || busy}
      onPress={() => { setReason(''); setError(''); setTarget(ride); }} />
    {target && <Modal transparent visible animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable accessibilityRole="button" accessibilityLabel="Keep ride" disabled={busy}
          style={StyleSheet.absoluteFill} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text accessibilityRole="header" style={styles.title}>Are you sure?</Text>
            <Text style={styles.message}>Cancel your ride with {partnerName(target, uid)} on {rideDate(target.localDate)}?</Text>
            <Text style={styles.message}>Please explain why. Your reason will be sent to {partnerName(target, uid)} in your shared chat. This cancels only this ride and releases both reservations.</Text>
            <Text style={styles.label}>Reason for cancelling</Text>
            <TextInput accessibilityLabel="Reason for cancelling" multiline
              placeholder="Please explain a reason why…" placeholderTextColor={colors.textMuted}
              value={reason} onChangeText={setReason} editable={!busy}
              maxLength={MAX_CANCELLATION_REASON_LENGTH} style={styles.input} textAlignVertical="top" />
            <Text style={styles.counter}>{reason.length}/{MAX_CANCELLATION_REASON_LENGTH}</Text>
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <AppButton label={busy ? 'Cancelling…' : 'Yes, Cancel Ride'} variant="destructive"
              disabled={busy || !cancellationReason(reason)} onPress={() => void confirm()} />
            <AppButton label="Keep ride" variant="secondary" disabled={busy} onPress={close} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>}
  </View>;
}

export function RideCancellationNotice({ ride, uid }: { ride: RideRequest; uid: string }) {
  if (ride.status !== 'CANCELLED' || !ride.cancellation) return null;
  const name = ride.cancellation.cancelledBy === uid ? 'You' : partnerName(ride, uid);
  return <View style={styles.notice} accessibilityLiveRegion="polite">
    <Text style={styles.label}>{name} cancelled this ride</Text>
    <Text style={styles.message}>Reason: {ride.cancellation.reason}</Text>
    <Text style={styles.message}>Both reservations were released. No gas share is due for this cancelled ride.</Text>
  </View>;
}
const styles = StyleSheet.create({
  content: { gap: spacing.md },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23,33,43,0.4)' },
  sheet: { maxHeight: '90%', padding: spacing.xl, backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: radii.pill, backgroundColor: colors.border, marginBottom: spacing.lg },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  message: { fontSize: 14, lineHeight: 21, color: colors.textMuted },
  label: { fontSize: 15, fontWeight: '700', color: colors.text },
  input: { minHeight: 110, maxHeight: 180, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.md, fontSize: 16, color: colors.text, backgroundColor: colors.background },
  counter: { textAlign: 'right', fontSize: 12, color: colors.textMuted },
  error: { color: colors.error, fontSize: 14 },
  notice: { gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.errorSoft, borderRadius: radii.md },
});
