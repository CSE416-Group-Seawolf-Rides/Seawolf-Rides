import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors, radii } from '../../theme';

interface ProgressBarProps {
  from: number;
  to: number;
}

// Animates from the previous step's progress so each Continue visibly moves the bar.
export function ProgressBar({ from, to }: ProgressBarProps) {
  const [progress] = useState(() => new Animated.Value(from));

  useEffect(() => {
    Animated.timing(progress, {
      duration: 450,
      toValue: to,
      useNativeDriver: false,
    }).start();
  }, [progress, to]);

  return (
    <View
      accessibilityLabel={`Step progress ${Math.round(to * 100)} percent`}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: Math.round(to * 100) }}
      style={styles.track}
    >
      <Animated.View
        style={[
          styles.fill,
          { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    flex: 1,
    height: 10,
    overflow: 'hidden',
  },
  fill: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: '100%',
  },
});
