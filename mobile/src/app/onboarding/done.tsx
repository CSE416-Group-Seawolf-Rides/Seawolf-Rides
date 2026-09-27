import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSession } from '../../auth/SessionProvider';
import { AppButton } from '../../components/AppButton';
import { Card } from '../../components/Card';
import { describeDays, lotTitle } from '../../commute/commuteModel';
import { buildOnboardingProfile, roleLabels } from '../../onboarding/onboardingModel';
import { useOnboarding } from '../../onboarding/OnboardingProvider';
import { colors, radii, spacing } from '../../theme';

export default function OnboardingDoneRoute() {
  const { draft } = useOnboarding();
  const { commute, completeOnboarding } = useSession();
  const profile = useMemo(() => buildOnboardingProfile(draft), [draft]);
  const [pop] = useState(() => new Animated.Value(0));

  // Finishing onboarding is a rare, first-time moment, so it earns a little delight.
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.spring(pop, {
      damping: 10,
      stiffness: 160,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [pop]);

  const rows = [{ label: 'Getting around', value: roleLabels[profile.role] }];
  if (commute) {
    rows.push(
      { label: 'Starting from', value: commute.startArea.label },
      { label: 'On campus', value: lotTitle(commute.campusLot) },
      { label: 'Days', value: describeDays(commute.days) },
    );
    if (commute.seats !== undefined) {
      rows.push({ label: 'Seats to offer', value: String(commute.seats) });
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.badge, { opacity: pop, transform: [{ scale: pop }] }]}>
          <Ionicons color={colors.surface} name="checkmark" size={40} />
        </Animated.View>

        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            You’re all set, {profile.firstName}.
          </Text>
          <Text style={styles.subtitle}>
            {commute ? 'Your commute is saved. Let’s find your matches.' : 'Welcome to Seawolf Rides.'}
          </Text>
        </View>

        <Card style={styles.summary}>
          {rows.map((row, index) => (
            <View key={row.label} style={[styles.row, index > 0 && styles.rowDivider]}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue}>{row.value}</Text>
            </View>
          ))}
        </Card>

        {!commute && (
          <Text style={styles.nudge}>
            Add your commute from Home whenever you’re ready. It’s how we find your matches.
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <AppButton label="Start exploring" onPress={() => completeOnboarding(profile)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: spacing.xl,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  badge: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  heading: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 16,
    textAlign: 'center',
  },
  summary: {
    paddingVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  rowDivider: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: 15,
  },
  rowValue: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  nudge: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  footer: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
});
