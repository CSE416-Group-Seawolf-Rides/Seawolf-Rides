import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../../theme';

interface ChoiceCardProps {
  title: string;
  description?: string;
  trailing?: string;
  selected: boolean;
  multiple?: boolean;
  onPress: () => void;
}

export function ChoiceCard({
  title,
  description,
  trailing,
  selected,
  multiple = false,
  onPress,
}: ChoiceCardProps) {
  const [scale] = useState(() => new Animated.Value(1));

  function pressTo(value: number) {
    Animated.spring(scale, { speed: 40, bounciness: 6, toValue: value, useNativeDriver: true }).start();
  }

  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={title}
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={multiple ? { checked: selected } : { selected }}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      onPressIn={() => pressTo(0.97)}
      onPressOut={() => pressTo(1)}
    >
      <Animated.View
        style={[styles.card, selected && styles.cardSelected, { transform: [{ scale }] }]}
      >
        <View style={styles.copy}>
          <Text style={[styles.title, selected && styles.titleSelected]}>{title}</Text>
          {description && <Text style={styles.description}>{description}</Text>}
        </View>
        {trailing && <Text style={styles.trailing}>{trailing}</Text>}
        <View
          style={[
            styles.marker,
            multiple ? styles.markerSquare : styles.markerRound,
            selected && styles.markerSelected,
          ]}
        >
          {selected && <View style={[styles.markerDot, multiple && styles.markerDotSquare]} />}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  cardSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  titleSelected: {
    color: colors.accentDark,
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 19,
  },
  trailing: {
    color: colors.textMuted,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  marker: {
    alignItems: 'center',
    borderColor: colors.border,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  markerRound: {
    borderRadius: radii.pill,
  },
  markerSquare: {
    borderRadius: 7,
  },
  markerSelected: {
    borderColor: colors.accent,
  },
  markerDot: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 12,
    width: 12,
  },
  markerDotSquare: {
    borderRadius: 3,
  },
});
