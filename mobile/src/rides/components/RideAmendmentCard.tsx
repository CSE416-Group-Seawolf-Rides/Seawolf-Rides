import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '../../components/AppButton';
import { Card } from '../../components/Card';
import type { RideRequest } from '../../mvp/rideRequestModel';
import { partnerName, rideDate, rideTime } from '../../mvp/ridePresentation';
import {
  formatTimeDelta,
  type RideAmendmentDecision,
  type RideAmendmentType,
} from '../../mvp/rideAmendmentModel';
import { colors, radii, spacing } from '../../theme';
import {
  newAmendmentProposalId,
  proposeRideAmendment,
  respondToRideAmendment,
} from '../rideAmendmentClient';

const CAMPUS_PICKUP_PRESETS = [
  'SAC Loop',
  'Student Union',
  'Lot 40',
  'South P Lot',
  'West Apartments',
  'Tabler Community',
  'Roth Cafe',
  'Stony Brook Station',
];

export function RideAmendmentCard({
  ride,
  uid,
  reviewOnly = false,
}: {
  ride: RideRequest;
  uid: string;
  reviewOnly?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [amendmentType, setAmendmentType] = useState<RideAmendmentType>('TIME');
  const [draftDeparture, setDraftDeparture] = useState(ride.plan.departure);
  const [draftPickupLabel, setDraftPickupLabel] = useState(ride.pickupLabel);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const attempt = useRef<{
    id: string;
    type: RideAmendmentType;
    departure?: number;
    pickupLabel?: string;
  } | null>(null);

  if (
    ride.status !== 'ACCEPTED' ||
    (uid !== ride.driverId && uid !== ride.riderId) ||
    ride.cancellation ||
    ride.settledAt !== undefined
  ) {
    return null;
  }

  const amendment = ride.amendment;
  const pending = amendment?.status === 'PENDING';
  if (reviewOnly && !pending) return null;

  const name = partnerName(ride, uid);

  const send = async () => {
    if (lock.current) return;
    const timeChanged = amendmentType === 'TIME' || amendmentType === 'BOTH';
    const locationChanged = amendmentType === 'LOCATION' || amendmentType === 'BOTH';

    if (timeChanged && draftDeparture === ride.plan.departure && !locationChanged) return;
    if (locationChanged && draftPickupLabel.trim() === ride.pickupLabel && !timeChanged) return;

    lock.current = true;
    setBusy(true);
    setError('');

    try {
      const proposalId = newAmendmentProposalId();
      await proposeRideAmendment(ride.id, proposalId, {
        type: amendmentType,
        ...(timeChanged ? { proposedDeparture: draftDeparture } : {}),
        ...(locationChanged ? { proposedPickupLabel: draftPickupLabel.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Couldn’t send trip change request.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const respond = async (decision: RideAmendmentDecision) => {
    if (lock.current || !amendment) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await respondToRideAmendment(ride.id, amendment.id, decision);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Couldn’t save response.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const deltaSeconds = draftDeparture - ride.plan.departure;

  return (
    <View style={styles.content}>
      {pending && (
        <Card style={styles.card}>
          <Text style={styles.heading}>Trip change request · {rideDate(ride.localDate)}</Text>
          <Text style={styles.subheading}>
            {amendment.proposerId === uid
              ? `You proposed a trip change to ${name}`
              : `${amendment.proposerName} proposed a trip change`}
          </Text>

          <View style={styles.changeDetails}>
            {(amendment.type === 'TIME' || amendment.type === 'BOTH') && amendment.originalDeparture && amendment.proposedDeparture && (
              <View style={styles.detailRow}>
                <Text style={styles.label}>Departure</Text>
                <Text style={styles.value}>
                  {rideTime(amendment.originalDeparture)} → {rideTime(amendment.proposedDeparture)}{' '}
                  <Text style={styles.highlight}>({formatTimeDelta(amendment.deltaSeconds ?? 0)})</Text>
                </Text>
              </View>
            )}

            {(amendment.type === 'LOCATION' || amendment.type === 'BOTH') && amendment.originalPickupLabel && amendment.proposedPickupLabel && (
              <View style={styles.detailRow}>
                <Text style={styles.label}>Pickup</Text>
                <Text style={styles.value}>
                  {amendment.originalPickupLabel} →{' '}
                  <Text style={styles.highlight}>{amendment.proposedPickupLabel}</Text>
                </Text>
              </View>
            )}

            {amendment.note && (
              <View style={styles.noteBox}>
                <Text style={styles.noteText}>{`"${amendment.note}"`}</Text>
              </View>
            )}
          </View>

          {amendment.recipientId === uid ? (
            <View style={styles.buttonGroup}>
              <AppButton
                disabled={busy}
                label={busy ? 'Saving…' : 'Accept change'}
                onPress={() => void respond('ACCEPTED')}
              />
              <AppButton
                disabled={busy}
                label="Decline change"
                onPress={() => void respond('DECLINED')}
                variant="secondary"
              />
            </View>
          ) : (
            <View style={styles.buttonGroup}>
              <Text style={styles.detail}>Waiting for {name} to accept or decline.</Text>
              <AppButton
                disabled={busy}
                label={busy ? 'Cancelling…' : 'Cancel change request'}
                onPress={() => void respond('CANCELLED')}
                variant="secondary"
              />
            </View>
          )}
        </Card>
      )}

      {!pending && !reviewOnly && (
        <View style={styles.triggerContainer}>
          {amendment && (
            <Text style={styles.detail}>
              Last trip change {amendment.status.toLowerCase()} · {rideDate(ride.localDate)}
            </Text>
          )}
          <AppButton
            label="Request trip change"
            onPress={() => {
              setDraftDeparture(ride.plan.departure);
              setDraftPickupLabel(ride.pickupLabel);
              setNote('');
              setAmendmentType('TIME');
              setError('');
              attempt.current = null;
              setOpen(true);
            }}
            variant="secondary"
          />
        </View>
      )}

      {!!error && !open && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      {open && (
        <Modal
          animationType="slide"
          onRequestClose={() => {
            if (!busy) setOpen(false);
          }}
          transparent
          visible
        >
          <View style={styles.backdrop}>
            <ScrollView
              contentContainerStyle={[
                styles.sheetContent,
                { paddingBottom: insets.bottom + spacing.lg },
              ]}
              style={styles.sheet}
            >
              <Text accessibilityRole="header" style={styles.heading}>
                Propose a trip change
              </Text>
              <Text style={styles.detail}>
                {name} · {rideDate(ride.localDate)}
              </Text>

              {/* Segmented Type Picker */}
              <View style={styles.segmentedRow}>
                <Pressable
                  onPress={() => setAmendmentType('TIME')}
                  style={[
                    styles.segmentButton,
                    amendmentType === 'TIME' && styles.segmentButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      amendmentType === 'TIME' && styles.segmentTextActive,
                    ]}
                  >
                    Time
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setAmendmentType('LOCATION')}
                  style={[
                    styles.segmentButton,
                    amendmentType === 'LOCATION' && styles.segmentButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      amendmentType === 'LOCATION' && styles.segmentTextActive,
                    ]}
                  >
                    Location
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setAmendmentType('BOTH')}
                  style={[
                    styles.segmentButton,
                    amendmentType === 'BOTH' && styles.segmentButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      amendmentType === 'BOTH' && styles.segmentTextActive,
                    ]}
                  >
                    Both
                  </Text>
                </Pressable>
              </View>

              {/* Timing Controls */}
              {(amendmentType === 'TIME' || amendmentType === 'BOTH') && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Adjust Departure Time</Text>
                  <Text style={styles.previewTime}>{rideTime(draftDeparture)}</Text>
                  <Text style={styles.previewDelta}>
                    {deltaSeconds === 0
                      ? 'Same as scheduled'
                      : `${formatTimeDelta(deltaSeconds)} from original (${rideTime(ride.plan.departure)})`}
                  </Text>

                  <View style={styles.stepperRow}>
                    <Pressable
                      disabled={busy}
                      onPress={() => setDraftDeparture((d) => d - 15 * 60)}
                      style={styles.stepPill}
                    >
                      <Text style={styles.stepPillText}>-15m</Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() => setDraftDeparture((d) => d - 5 * 60)}
                      style={styles.stepPill}
                    >
                      <Text style={styles.stepPillText}>-5m</Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() => setDraftDeparture(ride.plan.departure)}
                      style={[styles.stepPill, styles.stepPillReset]}
                    >
                      <Text style={styles.stepPillText}>Reset</Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() => setDraftDeparture((d) => d + 5 * 60)}
                      style={styles.stepPill}
                    >
                      <Text style={styles.stepPillText}>+5m</Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() => setDraftDeparture((d) => d + 15 * 60)}
                      style={styles.stepPill}
                    >
                      <Text style={styles.stepPillText}>+15m</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Location Controls */}
              {(amendmentType === 'LOCATION' || amendmentType === 'BOTH') && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Change Pickup Location</Text>
                  <TextInput
                    editable={!busy}
                    onChangeText={setDraftPickupLabel}
                    placeholder="Enter pickup spot"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                    value={draftPickupLabel}
                  />

                  <Text style={styles.chipHeader}>Suggested Stony Brook spots:</Text>
                  <View style={styles.chipRow}>
                    {CAMPUS_PICKUP_PRESETS.map((preset) => (
                      <Pressable
                        key={preset}
                        onPress={() => setDraftPickupLabel(preset)}
                        style={[
                          styles.presetChip,
                          draftPickupLabel === preset && styles.presetChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.presetChipText,
                            draftPickupLabel === preset && styles.presetChipTextActive,
                          ]}
                        >
                          {preset}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {/* Explanatory Note */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Optional Note</Text>
                <TextInput
                  editable={!busy}
                  maxLength={300}
                  multiline
                  onChangeText={setNote}
                  placeholder="e.g. Lab ends 10 mins late, can we meet slightly later?"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, styles.textArea]}
                  value={note}
                />
              </View>

              <Text style={styles.detail}>
                {name} must accept before the trip details change. Rejecting keeps your confirmed
                trip schedule.
              </Text>

              {!!error && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
              )}

              <View style={styles.buttonGroup}>
                <AppButton
                  disabled={
                    busy ||
                    (amendmentType === 'TIME' && draftDeparture === ride.plan.departure) ||
                    (amendmentType === 'LOCATION' && draftPickupLabel.trim() === ride.pickupLabel) ||
                    (amendmentType === 'BOTH' &&
                      draftDeparture === ride.plan.departure &&
                      draftPickupLabel.trim() === ride.pickupLabel)
                  }
                  label={busy ? 'Sending…' : 'Send change request'}
                  onPress={() => void send()}
                />
                <AppButton
                  disabled={busy}
                  label="Cancel"
                  onPress={() => setOpen(false)}
                  variant="secondary"
                />
              </View>
            </ScrollView>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm },
  card: { gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radii.md },
  heading: { color: colors.text, fontSize: 16, fontWeight: '800' },
  subheading: { color: colors.text, fontSize: 14, fontWeight: '600' },
  detail: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  error: { color: colors.error, fontSize: 13 },
  changeDetails: {
    backgroundColor: 'rgba(153,0,0,0.04)',
    borderRadius: radii.sm,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  value: { color: colors.text, fontSize: 13, fontWeight: '700' },
  highlight: { color: colors.accent, fontWeight: '800' },
  noteBox: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  noteText: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic' },
  buttonGroup: { gap: spacing.sm, marginTop: spacing.xs },
  triggerContainer: { gap: spacing.xs },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23,33,43,0.4)' },
  sheet: {
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  sheetContent: { gap: spacing.md, padding: spacing.lg },
  segmentedRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: radii.md,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: radii.sm,
  },
  segmentButtonActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: colors.accent,
    fontWeight: '800',
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  previewTime: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginVertical: 4,
  },
  previewDelta: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  stepPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(153,0,0,0.08)',
    alignItems: 'center',
  },
  stepPillReset: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  stepPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  chipHeader: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  presetChipActive: {
    backgroundColor: colors.accent,
  },
  presetChipText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
  presetChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
