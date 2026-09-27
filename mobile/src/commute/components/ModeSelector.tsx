import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../../theme';
import { DayMode, dayModeLabels } from '../commuteModel';

interface ModeSelectorProps {
  value: DayMode;
  onChange: (mode: DayMode) => void;
  accessibilityLabel: string;
}

const modes: DayMode[] = ['drive', 'ride', 'either'];

// For people who both drive and ride: which one they're doing on a given day.
export function ModeSelector({ value, onChange, accessibilityLabel }: ModeSelectorProps) {
  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="radiogroup" style={styles.track}>
      {modes.map((mode) => {
        const selected = mode === value;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            key={mode}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(mode);
            }}
            style={[styles.option, selected && styles.optionSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{dayModeLabels[mode]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    flexDirection: 'row',
    padding: 3,
  },
  option: {
    alignItems: 'center',
    borderRadius: radii.sm - 3,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing.sm,
  },
  optionSelected: {
    backgroundColor: colors.surface,
    shadowColor: '#17212b',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  labelSelected: {
    color: colors.text,
  },
});
