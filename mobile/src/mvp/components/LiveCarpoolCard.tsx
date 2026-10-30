import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../../components/AppButton';
import type { RideRequest } from '../rideRequestModel';
import { PublicProfileLink } from '../../profiles/PublicProfileLink';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { weekdays } from '../../commute/commuteModel';
import { weekdayForDate } from '../settings';
import { rideDate, rideTime, type LiveCarpool } from '../ridePresentation';
import { colors, spacing } from '../../theme';

export function LiveCarpoolCard({
  carpool,
  uid,
  onOpen,
  onCancel,
  busyId,
}: {
  carpool: LiveCarpool;
  uid: string;
  onOpen: () => void;
  onCancel: (ride: RideRequest) => void;
  busyId: string | null;
}) {
  const daysFor = (driving: boolean) =>
    weekdays
      .filter((day) =>
        carpool.accepted.some(
          (r) => (r.driverId === uid) === driving && weekdayForDate(r.localDate) === day.value,
        ),
      )
      .map((d) => d.short)
      .join(', ');
  const driving = daysFor(true),
    riding = daysFor(false);
  const next = carpool.accepted[0] ?? carpool.pending[0];
  return (
    <Card style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open carpool with ${carpool.name}`}
        onPress={onOpen}
      >
        <View style={styles.row}>
          <Avatar name={carpool.name} />
          <View style={styles.copy}>
            <Text style={styles.name}>{carpool.name}</Text>
            {riding ? <Text style={styles.relation}>Drives you · {riding}</Text> : null}
            {driving ? <Text style={styles.relation}>Rides with you · {driving}</Text> : null}
            {!carpool.accepted.length && (
              <Text style={styles.pending}>Waiting for their answer</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" color={colors.textMuted} size={18} />
        </View>
        <Text style={styles.detail}>
          {rideDate(next.localDate)} · {rideTime(next.plan.pickup)} pickup
        </Text>
        <Text style={styles.detail}>
          {next.pickupLabel} → {next.campusLabel}
        </Text>
        {!!carpool.pending.length && (
          <Text style={styles.pending}>
            {carpool.pending.length} pending request
            {carpool.pending.length === 1 ? '' : 's'} ·{' '}
            {carpool.pending.map((r) => rideDate(r.localDate)).join(', ')}
          </Text>
        )}
      </Pressable>
      <PublicProfileLink participantId={carpool.id} name={carpool.name} />
      {carpool.pending.map((request) => (
        <AppButton
          key={request.id}
          variant="secondary"
          label={busyId === request.id ? 'Cancelling…' : `Cancel request · ${rideDate(request.localDate)}`}
          disabled={!!busyId}
          onPress={() => onCancel(request)}
        />
      ))}
    </Card>
  );
}
const styles = StyleSheet.create({
  card: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  copy: { flex: 1, gap: spacing.xs },
  name: { fontSize: 17, fontWeight: '800', color: colors.text },
  relation: { fontSize: 14, fontWeight: '600', color: colors.text },
  detail: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  pending: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '600',
    lineHeight: 19,
  },
});
