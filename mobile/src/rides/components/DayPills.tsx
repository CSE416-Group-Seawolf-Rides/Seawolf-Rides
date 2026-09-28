import { StyleSheet, Text, View } from 'react-native';

import { Weekday, weekdays } from '../../commute/commuteModel';
import { colors, radii } from '../../theme';

interface DayPillsProps {
  days: Weekday[];
  highlighted?: Weekday[];
}

// Compact "M T W T F" row: the days someone commutes, with shared days highlighted.
export function DayPills({ days, highlighted = [] }: DayPillsProps) {
  const label = weekdays
    .filter((weekday) => days.includes(weekday.value))
    .map((weekday) => weekday.name)
    .join(', ');

  return (
    <View accessibilityLabel={`Commutes ${label}`} accessible style={styles.row}>
      {weekdays
        .filter((weekday) => days.includes(weekday.value))
        .map((weekday) => {
          const shared = highlighted.includes(weekday.value);
          return (
            <View key={weekday.value} style={[styles.pill, shared && styles.pillShared]}>
              <Text style={[styles.text, shared && styles.textShared]}>{weekday.short}</Text>
            </View>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillShared: {
    backgroundColor: colors.accentSoft,
  },
  text: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  textShared: {
    color: colors.accent,
  },
});
