import { StyleSheet, Text } from 'react-native';

import { colors, spacing } from '../theme';
import { AppButton } from './AppButton';
import { Card } from './Card';

interface SetUpCommuteCardProps {
  onPress: () => void;
}

// The re-entry point for people who chose "I'll do it later" during onboarding.
export function SetUpCommuteCard({ onPress }: SetUpCommuteCardProps) {
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Add your weekly commute</Text>
      <Text style={styles.body}>
        Tell us where you start, where you park, and your week. It takes about 2 minutes and
        it’s how we find your matches.
      </Text>
      <AppButton label="Set up my commute" onPress={onPress} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: colors.accent,
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  body: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
});
