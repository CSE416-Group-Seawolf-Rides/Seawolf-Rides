import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import { Avatar } from '../../components/Avatar';
import { describeWeekdays, Weekday, weekdays } from '../../commute/commuteModel';
import { colors, radii, spacing } from '../../theme';
import { IncomingRequest } from '../rideModel';

interface RequestsSummaryCardProps {
  requests: IncomingRequest[];
  // The days each request overlaps with the user's drives.
  days: Weekday[];
  onReview: () => void;
}

// Riders waiting on a yes/no, summed up in one card. Deciding happens one request at a
// time on the review screen, so Home never grows into a long list of cards.
export function RequestsSummaryCard({ requests, days, onReview }: RequestsSummaryCardProps) {
  const count = requests.length;
  const shown = requests.slice(0, 3);
  const minutes = requests.map((request) => request.addedMinutes);
  const low = Math.min(...minutes);
  const high = Math.max(...minutes);
  const names =
    count <= 2
      ? requests.map((request) => request.riderName).join(' and ')
      : `${shown
          .slice(0, 2)
          .map((request) => request.riderName)
          .join(', ')}, and ${count - 2} more`;
  const orderedDays = weekdays.map((weekday) => weekday.value).filter((day) => days.includes(day));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatars}>
          {shown.map((request, index) => (
            <View key={request.id} style={[styles.avatarRing, index > 0 && styles.overlap]}>
              <Avatar name={request.riderName} size={40} />
            </View>
          ))}
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      </View>

      <View style={styles.copy}>
        <Text style={styles.title}>
          {count} rider{count === 1 ? '' : 's'} want{count === 1 ? 's' : ''} to join your drive
        </Text>
        <Text style={styles.detail}>
          {names} · {describeWeekdays(orderedDays)} · adds{' '}
          {low === high ? `${low}` : `${low}–${high}`} min
        </Text>
      </View>

      <AppButton label={count === 1 ? 'Review request' : `Review ${count} requests`} onPress={onReview} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  avatars: {
    flexDirection: 'row',
  },
  avatarRing: {
    borderColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 2,
  },
  overlap: {
    marginLeft: -12,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 26,
    justifyContent: 'center',
    minWidth: 26,
    paddingHorizontal: spacing.sm,
  },
  badgeText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '800',
  },
  copy: {
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  detail: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
