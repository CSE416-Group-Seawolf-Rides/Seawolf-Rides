import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../../theme';
import { formatTime } from '../commuteModel';

interface TimeFieldProps {
  label: string;
  minutes: number | null;
  defaultMinutes: number;
  expanded: boolean;
  noneLabel: string;
  addLabel: string;
  onToggle: () => void;
  onChange: (minutes: number | null) => void;
}

const isIOS = process.env.EXPO_OS === 'ios';

function toDate(minutes: number): Date {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

function fromDate(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

// Tap the row to reveal the system time wheel right beneath it (like the Calendar and
// Clock apps on iPhone). Android uses its native time picker dialog instead.
export function TimeField({
  label,
  minutes,
  defaultMinutes,
  expanded,
  noneLabel,
  addLabel,
  onToggle,
  onChange,
}: TimeFieldProps) {
  const value = minutes === null ? 'Not needed' : formatTime(minutes);

  function openAndroidPicker(current: number) {
    DateTimePickerAndroid.open({
      is24Hour: false,
      mode: 'time',
      onValueChange: (_, date) => onChange(fromDate(date)),
      value: toDate(current),
    });
  }

  return (
    <View>
      <Pressable
        accessibilityHint={expanded ? 'Hides the time picker' : 'Shows a time picker'}
        accessibilityLabel={`${label}, ${value}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.row}
      >
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.pill, expanded && styles.pillExpanded]}>
          <Text
            style={[
              styles.pillText,
              minutes === null && styles.pillTextNone,
              expanded && styles.pillTextExpanded,
            ]}
          >
            {value}
          </Text>
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.panel}>
          {minutes !== null &&
            (isIOS ? (
              <DateTimePicker
                display="spinner"
                minuteInterval={5}
                mode="time"
                onValueChange={(_, date) => onChange(fromDate(date))}
                style={styles.wheel}
                textColor={colors.text}
                themeVariant="light"
                value={toDate(minutes)}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => openAndroidPicker(minutes)}
                style={({ pressed }) => [styles.androidButton, pressed && styles.pressed]}
              >
                <Text style={styles.androidButtonText}>Change time</Text>
              </Pressable>
            ))}
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onChange(minutes === null ? defaultMinutes : null)}
            style={({ pressed }) => [styles.toggleLeg, pressed && styles.pressed]}
          >
            <Text style={styles.toggleLegText}>{minutes === null ? addLabel : noneLabel}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  label: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
  },
  pill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  pillExpanded: {
    backgroundColor: colors.accentSoft,
  },
  pillText: {
    color: colors.text,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  pillTextNone: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  pillTextExpanded: {
    color: colors.accent,
  },
  panel: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  wheel: {
    alignSelf: 'stretch',
    height: 180,
  },
  androidButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 44,
  },
  androidButtonText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  toggleLeg: {
    minHeight: 36,
    justifyContent: 'center',
  },
  toggleLegText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.6,
  },
});
