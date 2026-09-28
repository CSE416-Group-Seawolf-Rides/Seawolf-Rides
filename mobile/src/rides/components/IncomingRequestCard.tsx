import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import { Avatar } from '../../components/Avatar';
import { formatTime, lotTitle, Weekday, weekdays } from '../../commute/commuteModel';
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
}: IncomingRequestCardProps) {
  const fullDayName = fullDay && weekdays.find((weekday) => weekday.value === fullDay)?.name;
  const conflictDayName =
    conflictDay && weekdays.find((weekday) => weekday.value === conflictDay)?.name;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar name={request.riderName} />
        <View style={styles.headerCopy}>
          <Text style={styles.name}>{request.riderName}</Text>
          <Text style={styles.meta}>{request.startAreaLabel}</Text>
        </View>
        <View style={styles.detour}>
          <Text style={styles.detourValue}>+{request.addedMinutes} min</Text>
          <Text style={styles.detourLabel}>to your drive</Text>
        </View>
      </View>

      <Text style={styles.times}>
        Needs to arrive by {formatTime(request.arriveBy)} · {lotTitle(request.campusLot)}
      </Text>
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
                onPress={onDecline}
                variant="secondary"
              />
            </View>
            <View style={styles.action}>
              <AppButton
                accessibilityLabel={`Accept ${request.riderName}`}
                disabled={Boolean(fullDay || conflictDay)}
                label="Accept"
                onPress={onAccept}
              />
            </View>
          </View>
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
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  action: {
    flex: 1,
  },
});
