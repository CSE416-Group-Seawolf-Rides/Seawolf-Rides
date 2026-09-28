import { StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../theme';

interface AvatarProps {
  name: string;
  size?: number;
}

export function Avatar({ name, size = 44 }: AvatarProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.avatar, { height: size, width: size }]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    justifyContent: 'center',
  },
  initial: {
    color: colors.accent,
    fontWeight: '800',
  },
});
