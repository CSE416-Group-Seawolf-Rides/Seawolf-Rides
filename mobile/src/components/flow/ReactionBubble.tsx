import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { colors, radii, spacing } from '../../theme';

interface ReactionBubbleProps {
  text: string | null;
}

// Immediate, friendly feedback on each answer. Re-animates whenever the text changes.
export function ReactionBubble({ text }: ReactionBubbleProps) {
  const [appear] = useState(() => new Animated.Value(0));

  useEffect(() => {
    appear.setValue(0);
    if (text) {
      Animated.spring(appear, {
        damping: 16,
        mass: 0.7,
        stiffness: 180,
        toValue: 1,
        useNativeDriver: true,
      }).start();
    }
  }, [appear, text]);

  if (!text) {
    return null;
  }

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.bubble,
        {
          opacity: appear,
          transform: [
            { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        },
      ]}
    >
      <Text style={styles.text}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.lg,
    borderTopLeftRadius: radii.sm / 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  text: {
    color: colors.accentDark,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
});
