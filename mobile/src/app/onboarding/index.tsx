import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import { RouteIllustration } from '../../components/RouteIllustration';
import { colors, spacing } from '../../theme';

export default function OnboardingIntroRoute() {
  return (
    <View style={styles.container}>
      <RouteIllustration />
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>
          Let’s get you moving.
        </Text>
        <Text style={styles.subtitle}>
          A few quick questions to get you matched with people who share your commute.
        </Text>
      </View>
      <View style={styles.footer}>
        <AppButton label="Let’s go" onPress={() => router.push('/onboarding/role')} />
        <Text style={styles.note}>Takes about 2 minutes. You can update your commute later.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  copy: {
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
  },
  footer: {
    gap: spacing.md,
  },
  note: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
});
