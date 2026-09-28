import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../../theme';

type Tone = 'success' | 'warning' | 'neutral';

interface StatusPillProps {
  label: string;
  tone: Tone;
}

export function StatusPill({ label, tone }: StatusPillProps) {
  return (
    <View style={[styles.pill, styles[tone]]}>
      <Text style={[styles.text, styles[`${tone}Text`]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
  },
  success: {
    backgroundColor: colors.successSoft,
  },
  successText: {
    color: colors.success,
  },
  warning: {
    backgroundColor: colors.warningSoft,
  },
  warningText: {
    color: colors.warning,
  },
  neutral: {
    backgroundColor: colors.surfaceMuted,
  },
  neutralText: {
    color: colors.textMuted,
  },
});
