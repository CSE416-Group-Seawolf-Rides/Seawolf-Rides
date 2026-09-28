import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatTime, lotTitle, weekdays } from '../../commute/commuteModel';
import { colors, radii, spacing } from '../../theme';
import { UpcomingItem } from '../rideModel';

interface AgendaListProps {
  items: UpcomingItem[];
  onOpenTrip: (tripId: string) => void;
  onFindDriver: (item: UpcomingItem) => void;
}

// A week of commutes as one grouped list: compact rows with hairline dividers read as
// a single schedule and fit a whole week on screen.
export function AgendaList({ items, onOpenTrip, onFindDriver }: AgendaListProps) {
  return (
    <View style={styles.group}>
      {items.map((item, index) => (
        <AgendaRow
          item={item}
          key={item.id}
          last={index === items.length - 1}
          onPress={() => (item.kind === 'open' ? onFindDriver(item) : onOpenTrip(item.id))}
        />
      ))}
    </View>
  );
}

function AgendaRow({ item, last, onPress }: { item: UpcomingItem; last: boolean; onPress: () => void }) {
  const weekday = weekdays.find((option) => option.value === item.day)!;
  const soon = item.whenLabel === 'Today' || item.whenLabel === 'Tomorrow';
  const skipped = item.kind !== 'open' && item.skipped;

  let headline: string;
  let detail: string;
  if (item.kind === 'open') {
    headline = item.pending ? 'Request sent' : 'No driver yet';
    detail = item.pending
      ? 'Waiting for a driver to accept'
      : item.arriveBy !== null
        ? `Arrive by ${formatTime(item.arriveBy)}`
        : `Leave campus at ${formatTime(item.leaveAt!)}`;
  } else if (item.kind === 'ride') {
    const time = item.pickupTime ?? item.leaveAt ?? item.arriveBy;
    headline = `${time === null ? 'Time TBD' : formatTime(time)} · ${item.offer?.driverName}`;
    detail = skipped
      ? 'Skipped'
      : item.arriveBy !== null
        ? `Ride to ${lotTitle(item.campusLot)}`
        : `Ride home from ${lotTitle(item.campusLot)}`;
  } else {
    const riders = item.riders ?? [];
    const time = item.arriveBy ?? item.leaveAt;
    headline = `${time === null ? 'Time TBD' : formatTime(time)} · You drive`;
    detail = skipped ? 'Skipped' : riders.map((rider) => rider.riderName).join(', ');
  }

  return (
    <Pressable
      accessibilityHint={item.kind === 'open' ? 'Shows drivers for this day' : 'Opens trip details'}
      accessibilityLabel={`${item.whenLabel}, ${headline}, ${detail}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}
    >
      <View style={styles.date}>
        <Text style={[styles.dayName, soon && styles.accent]}>{weekday.short.toUpperCase()}</Text>
        <Text style={[styles.dayNumber, soon && styles.accent]}>{Number(item.id.slice(8))}</Text>
      </View>

      <View style={styles.copy}>
        <Text
          style={[
            styles.headline,
            (item.kind === 'open' || skipped) && styles.muted,
            skipped && styles.struck,
          ]}
        >
          {headline}
        </Text>
        <Text numberOfLines={1} style={[styles.detail, item.kind === 'open' && item.pending && styles.warning]}>
          {soon ? `${item.whenLabel} · ` : ''}
          {detail}
        </Text>
      </View>

      {item.kind === 'open' && !item.pending ? (
        <Text style={styles.find}>Find</Text>
      ) : item.kind === 'drive' ? (
        <View style={styles.modeTag}>
          <Ionicons color={colors.textMuted} name="car-outline" size={14} />
          <Text style={styles.modeText}>{item.riders?.length}</Text>
        </View>
      ) : (
        <Ionicons color={colors.textMuted} name="chevron-forward" size={16} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  divider: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  date: {
    alignItems: 'center',
    width: 36,
  },
  dayName: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dayNumber: {
    color: colors.text,
    fontSize: 19,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  accent: {
    color: colors.accent,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  headline: {
    color: colors.text,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  muted: {
    color: colors.textMuted,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  detail: {
    color: colors.textMuted,
    fontSize: 13,
  },
  warning: {
    color: colors.warning,
  },
  find: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '800',
  },
  modeTag: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  modeText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
});
