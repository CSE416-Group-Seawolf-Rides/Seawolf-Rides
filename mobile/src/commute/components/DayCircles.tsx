import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../../theme';
import { Weekday, weekdays } from '../commuteModel';

interface DayCirclesProps {
  selected: Weekday[];
  onToggle: (day: Weekday) => void;
}

export function DayCircles({ selected, onToggle }: DayCirclesProps) {
  return (
    <View style={styles.row}>
      {weekdays.map((weekday) => {
        const active = selected.includes(weekday.value);
        return (
          <Pressable
            accessibilityLabel={weekday.name}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
            hitSlop={4}
            key={weekday.value}
            onPress={() => {
              Haptics.selectionAsync();
              onToggle(weekday.value);
            }}
            style={({ pressed }) => [
              styles.circle,
              active && styles.circleActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.letter, active && styles.letterActive]}>{weekday.letter}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  circle: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 2,
    justifyContent: 'center',
    maxWidth: 46,
    width: '12.5%',
  },
  circleActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pressed: {
    opacity: 0.7,
  },
  letter: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  letterActive: {
    color: colors.surface,
  },
});
