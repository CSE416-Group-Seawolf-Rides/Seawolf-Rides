import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import { Avatar } from '../../components/Avatar';
import { formatTime, lotTitle, Weekday, weekdays } from '../../commute/commuteModel';
import { participantIdForRequest, resolvePublicProfile } from '../../profiles/publicProfiles';
import { colors, radii, spacing } from '../../theme';
import { IncomingRequest } from '../rideModel';
import { DayPills } from './DayPills';
import { StatusPill } from './StatusPill';

interface IncomingRequestCardProps {
  request: IncomingRequest;
  sharedDays: Weekday[];
  fullDay?: Weekday;
  conflictDay?: Weekday;
  onAccept: () => void;
  onDecline: () => void;
  onOpenProfile: (participantId: string, displayName: string) => void;
  checking?: boolean;
}

// Drivers decide on every request themselves, so the card leads with what that costs
// them (extra minutes) and when the rider needs to arrive.
export function IncomingRequestCard({
  request,
  sharedDays,
  fullDay,
  conflictDay,
  onAccept,
  onDecline,
  onOpenProfile,
  checking = false,
}: IncomingRequestCardProps) {
  const fullDayName = fullDay && weekdays.find((weekday) => weekday.value === fullDay)?.name;
  const conflictDayName =
    conflictDay && weekdays.find((weekday) => weekday.value === conflictDay)?.name;
  const proposalTime = (epoch: number) => new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: request.proposal?.occurrence.timeZone,
  }).format(new Date(epoch * 1000));
  const participantId = participantIdForRequest(request);
  const profile = resolvePublicProfile(participantId, request.riderName);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={`View ${request.riderName}'s profile`} accessibilityRole="button" onPress={() => onOpenProfile(participantId, request.riderName)} style={({ pressed }) => [styles.identity, pressed && styles.pressed]}>
          <Avatar name={profile.displayName} participantId={participantId} sampleAvatar={profile.sampleAvatar} />
          <View style={styles.headerCopy}>
            <Text style={styles.name}>{request.riderName}</Text>
            <Text style={styles.meta}>{request.startAreaLabel}</Text>
          </View>
        </Pressable>
        <View style={styles.detour}>
          <Text style={styles.detourValue}>+{request.proposal ? Math.round(request.proposal.routingEstimates.metrics.driverExtraDurationSeconds / 60) : request.addedMinutes} min</Text>
          <Text style={styles.detourLabel}>to your drive</Text>
        </View>
      </View>

      <Text style={styles.times}>
        {request.proposal
          ? `Estimated pickup ${proposalTime(request.proposal.routingEstimates.plan.pickup)} · campus ${proposalTime(request.proposal.routingEstimates.plan.vehicleCampusArrival)} at ${request.proposal.agreed.campusDropoff.label}`
          : `Needs to arrive by ${formatTime(request.arriveBy)} · ${lotTitle(request.campusLot)}`}
      </Text>
      <Text style={styles.compatibility}>{request.proposal ? `${request.proposal.occurrence.localDate} · dated TO CAMPUS proposal · ${request.proposal.agreed.requestedSeats} seat${request.proposal.agreed.requestedSeats === 1 ? '' : 's'}` : 'Legacy recurring request · no dated evaluated proposal'}</Text>
      <DayPills days={request.days} highlighted={sharedDays} />
      {request.note && <Text style={styles.note}>“{request.note}”</Text>}

      {request.status === 'accepted' ? (
        <StatusPill label="Riding with you" tone="success" />
      ) : (
        <>
          {fullDayName && (
            <Text style={styles.full}>
              Your car is full on {fullDayName}. Add a seat in Account to accept.
            </Text>
          )}
          {conflictDayName && (
            <Text style={styles.full}>
              You already have a driver on {conflictDayName}. Cancel that ride before accepting a
              rider.
            </Text>
          )}
          <View style={styles.actions}>
            <View style={styles.action}>
              <AppButton
                accessibilityLabel={`Decline ${request.riderName}`}
                label="Decline"
                disabled={checking}
                onPress={onDecline}
                variant="secondary"
              />
            </View>
            <View style={styles.action}>
              <AppButton
                accessibilityLabel={`Accept ${request.riderName}`}
                disabled={checking || Boolean(fullDay || conflictDay)}
                label={checking ? 'Checking…' : 'Accept'}
                onPress={onAccept}
              />
            </View>
          </View>
          {checking && <Text style={styles.checking}>Verifying the complete group route before accepting…</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  identity: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md, minHeight: 48 },
  pressed: { opacity: 0.62 },
  name: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 14,
  },
  detour: {
    alignItems: 'flex-end',
  },
  detourValue: {
    color: colors.text,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  detourLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
  times: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  compatibility: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  note: {
    color: colors.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  full: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '600',
  },
  checking: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  action: {
    flex: 1,
  },
});
