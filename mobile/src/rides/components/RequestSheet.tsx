import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../../components/AppButton';
import { formatTime, lotTitle, Weekday, weekdays } from '../../commute/commuteModel';
import { colors, radii, spacing } from '../../theme';
import type { DatedRideProposalV1 } from '../datedRideProposal';
import { DriverOffer } from '../rideModel';

interface RequestSheetProps {
  offer: DriverOffer;
  sharedDays: Weekday[];
  // Pre-selected days; defaults to every shared day.
  initialDays?: Weekday[];
  proposal?: DatedRideProposalV1;
  onSend: (days: Weekday[]) => void;
  onClose: () => void;
}

// A short confirmation, sized to its content: which of your shared days to request.
export function RequestSheet({
  offer,
  sharedDays,
  initialDays,
  proposal,
  onSend,
  onClose,
}: RequestSheetProps) {
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<Weekday[]>(initialDays ?? sharedDays);
  const proposalTime = (epoch: number) => new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: proposal?.occurrence.timeZone,
  }).format(new Date(epoch * 1000));
  const proposalDate = proposal && new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${proposal.occurrence.localDate}T12:00:00Z`));

  function toggle(day: Weekday) {
    Haptics.selectionAsync();
    setDays((current) =>
      current.includes(day) ? current.filter((selected) => selected !== day) : [...current, day],
    );
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.grabber} />
          <Text accessibilityRole="header" style={styles.title}>
            Ride with {offer.driverName}
          </Text>
          {proposal ? (
            <View style={styles.proposalSummary}>
              <Text style={styles.proposalLabel}>DATED TO CAMPUS PROPOSAL</Text>
              <Text style={styles.subtitle}>{proposalDate} · {proposal.occurrence.timeZone}</Text>
              <Text style={styles.proposalFact}>{proposal.agreed.pickup.label}</Text>
              <Text style={styles.proposalFact}>{proposal.agreed.requestedSeats} passenger seat{proposal.agreed.requestedSeats === 1 ? '' : 's'} · {proposal.agreed.campusDropoff.label}</Text>
              <Text style={styles.proposalFact}>Estimated pickup {proposalTime(proposal.routingEstimates.plan.pickup)} · campus {proposalTime(proposal.routingEstimates.plan.vehicleCampusArrival)}</Text>
              <Text style={styles.proposalNote}>Only this date and TO CAMPUS trip were evaluated. This does not request other weekdays or a return ride.</Text>
            </View>
          ) : (
            <Text style={styles.subtitle}>
              Pickup ~{formatTime(offer.pickupTime)} · Arrive {formatTime(offer.arriveBy)} at{' '}
              {lotTitle(offer.campusLot)} ·{' '}
              {offer.leaveAt === null ? 'No ride home' : `Leave ${formatTime(offer.leaveAt)}`}
            </Text>
          )}

          {!proposal && <><Text style={styles.label}>Which days?</Text>
          <View style={styles.days}>
            {weekdays
              .filter((weekday) => sharedDays.includes(weekday.value))
              .map((weekday) => {
                const selected = days.includes(weekday.value);
                return (
                  <Pressable
                    accessibilityLabel={weekday.name}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    key={weekday.value}
                    onPress={() => toggle(weekday.value)}
                    style={[styles.day, selected && styles.daySelected]}
                  >
                    <Text style={[styles.dayText, selected && styles.dayTextSelected]}>
                      {weekday.short}
                    </Text>
                  </Pressable>
                );
              })}
          </View></>}

          <Text style={styles.privacy}>
            {proposal
              ? 'Local prototype: this exact public pickup and dated schedule are included in the request so the driver can accept the evaluated proposal.'
              : `${offer.driverName} will see your first name, area, and schedule. The exact pickup spot is shared only after they accept.`}
          </Text>

          <AppButton
            disabled={!proposal && days.length === 0}
            label={proposal ? 'Send dated request' : `Send request${days.length > 0 ? ` for ${days.length} day${days.length === 1 ? '' : 's'}` : ''}`}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onSend(days);
            }}
          />
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(23, 33, 43, 0.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    height: 5,
    marginBottom: spacing.sm,
    width: 36,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
    marginTop: -spacing.sm,
  },
  proposalSummary: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    gap: spacing.xs,
    padding: spacing.md,
  },
  proposalLabel: {
    color: colors.accentDark,
    fontSize: 11,
    fontWeight: '900',
  },
  proposalFact: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  proposalNote: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  day: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  daySelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  dayText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  dayTextSelected: {
    color: colors.accentDark,
  },
  privacy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  cancel: {
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
});
