import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '../../components/Avatar';
import { describeWeekdays, formatTime } from '../../commute/commuteModel';
import { colors, radii, spacing } from '../../theme';
import { Carpool } from '../rideModel';
import { StatusPill } from './StatusPill';

interface CarpoolCardProps {
  carpool: Carpool;
  onOpen?: () => void;
  onWithdraw?: () => void;
}

// One person you share rides with: who, which days, and where you meet. Pending asks
// sit inline so the whole relationship is in one place.
export function CarpoolCard({ carpool, onOpen, onWithdraw }: CarpoolCardProps) {
  const driving = carpool.kind === 'driver';
  const name = driving ? carpool.offer.driverName : carpool.rider.riderName;
  const waitingOnly = driving && carpool.days.length === 0;

  let relation: string;
  let meeting: string;
  if (carpool.kind === 'driver') {
    relation = waitingOnly
      ? `Requested · ${describeWeekdays(carpool.pendingDays)}`
      : `Drives you · ${describeWeekdays(carpool.days)}`;
    meeting = waitingOnly
      ? 'Pickup spot shared once they accept'
      : `${carpool.offer.pickupSpot} · ~${formatTime(carpool.offer.pickupTime)}`;
  } else {
    relation = `Rides with you · ${describeWeekdays(carpool.days)}`;
    meeting = `${carpool.rider.pickupSpot} · +${carpool.rider.addedMinutes} min`;
  }

  return (
    <Pressable
      accessibilityLabel={`${name}. ${relation}. ${meeting}`}
      accessibilityRole="button"
      disabled={!onOpen}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <Avatar name={name} />
        <View style={styles.copy}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{name}</Text>
            {waitingOnly && <StatusPill label="Waiting" tone="warning" />}
          </View>
          <Text style={styles.relation}>{relation}</Text>
          <View style={styles.meetingRow}>
            <Ionicons
              color={colors.textMuted}
              name={waitingOnly ? 'lock-closed-outline' : 'location-outline'}
              size={14}
            />
            <Text numberOfLines={1} style={styles.meeting}>
              {meeting}
            </Text>
          </View>
        </View>
        {onOpen && <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />}
      </View>

      {carpool.kind === 'driver' && !waitingOnly && carpool.pendingDays.length > 0 && (
        <View style={styles.pending}>
          <View style={styles.pendingDot} />
          <Text style={styles.pendingText}>
            {describeWeekdays(carpool.pendingDays)} requested · waiting for {name}
          </Text>
          {onWithdraw && (
            <Pressable accessibilityRole="button" hitSlop={10} onPress={onWithdraw}>
              <Text style={styles.withdraw}>Withdraw</Text>
            </Pressable>
          )}
        </View>
      )}
      {waitingOnly && onWithdraw && (
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onWithdraw} style={styles.withdrawOnly}>
          <Text style={styles.withdraw}>Withdraw request</Text>
        </Pressable>
      )}
    </Pressable>
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
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  name: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  relation: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  meetingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  meeting: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 13,
  },
  pending: {
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pendingDot: {
    backgroundColor: colors.warning,
    borderRadius: radii.pill,
    height: 7,
    width: 7,
  },
  pendingText: {
    color: colors.warning,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  withdraw: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  withdrawOnly: {
    alignSelf: 'flex-start',
  },
});
