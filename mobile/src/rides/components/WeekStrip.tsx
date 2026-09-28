import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dayModeLabels, Weekday, weekdays } from '../../commute/commuteModel';
import { colors, radii, spacing } from '../../theme';
import { DayOverview, DayStatus } from '../rideModel';

interface WeekStripProps {
  overview: DayOverview[];
  dates: Record<Weekday, number>;
  today: Weekday;
  showModes: boolean;
  // Days with somewhere to go: a trip to open, or drivers to find.
  actionableDays: Weekday[];
  onPressDay: (day: Weekday) => void;
}

const statusCopy: Record<Exclude<DayStatus, 'off'>, string> = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  open: 'No ride yet',
  skipped: 'Skipped',
};

// The week at a glance: one column per day with a status dot. Tapping a day jumps
// straight to what matters for it: the trip, or drivers if it still needs one.
export function WeekStrip({
  overview,
  dates,
  today,
  showModes,
  actionableDays,
  onPressDay,
}: WeekStripProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {overview.map(({ day, status, mode }) => {
          const weekday = weekdays.find((option) => option.value === day)!;
          const off = status === 'off';
          const actionable = actionableDays.includes(day);
          const isToday = today === day;
          return (
            <Pressable
              accessibilityLabel={
                off
                  ? `${weekday.name}, no commute`
                  : `${weekday.name}, ${mode && showModes ? `${dayModeLabels[mode]}, ` : ''}${statusCopy[status]}`
              }
              accessibilityRole="button"
              accessibilityState={{ disabled: !actionable }}
              disabled={!actionable}
              key={day}
              onPress={() => {
                Haptics.selectionAsync();
                onPressDay(day);
              }}
              style={({ pressed }) => [
                styles.day,
                isToday && styles.dayToday,
                pressed && styles.dayPressed,
              ]}
            >
              <Text style={[styles.letter, isToday && styles.today, off && styles.muted]}>
                {weekday.short.slice(0, 2)}
              </Text>
              <Text style={[styles.date, isToday && styles.today, off && styles.muted]}>
                {dates[day]}
              </Text>
              <StatusDot status={status} />
              {showModes && mode && (
                <Text style={styles.mode}>{mode === 'drive' ? 'Drive' : mode === 'ride' ? 'Ride' : 'Either'}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legend}>
        {(
          overview.some((day) => day.status === 'skipped')
            ? (['confirmed', 'pending', 'open', 'skipped'] as const)
            : (['confirmed', 'pending', 'open'] as const)
        ).map((status) => (
          <View key={status} style={styles.legendItem}>
            <StatusDot status={status} />
            <Text style={styles.legendText}>{statusCopy[status]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StatusDot({ status }: { status: DayStatus }) {
  if (status === 'off') {
    return <View style={styles.dotSpacer} />;
  }
  return (
    <View
      style={[
        styles.dot,
        status === 'confirmed' && styles.dotConfirmed,
        status === 'pending' && styles.dotPending,
        status === 'open' && styles.dotOpen,
        status === 'skipped' && styles.dotSkipped,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  day: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radii.md,
    borderWidth: 2,
    gap: 4,
    minWidth: 42,
    paddingVertical: spacing.sm,
  },
  dayToday: {
    borderColor: colors.accentSoft,
  },
  dayPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  letter: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  date: {
    color: colors.text,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  today: {
    color: colors.accent,
  },
  muted: {
    color: colors.border,
  },
  mode: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  dot: {
    borderRadius: radii.pill,
    height: 10,
    width: 10,
  },
  dotSpacer: {
    height: 10,
  },
  dotConfirmed: {
    backgroundColor: colors.success,
  },
  dotPending: {
    backgroundColor: colors.warning,
  },
  dotSkipped: {
    backgroundColor: colors.border,
  },
  dotOpen: {
    borderColor: colors.textMuted,
    borderWidth: 2,
  },
  legend: {
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'center',
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  legendText: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
