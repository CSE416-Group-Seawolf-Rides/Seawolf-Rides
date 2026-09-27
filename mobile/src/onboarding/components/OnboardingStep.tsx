import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import { colors, spacing } from '../../theme';
import { getStepProgress, onboardingSteps, OnboardingStepId } from '../onboardingModel';
import { ProgressBar } from './ProgressBar';
import { ReactionBubble } from './ReactionBubble';

interface OnboardingStepProps extends PropsWithChildren {
  step: OnboardingStepId;
  title: string;
  subtitle?: string;
  reaction?: string | null;
  continueLabel?: string;
  canContinue: boolean;
  onContinue: () => void;
}

export function OnboardingStep({
  step,
  title,
  subtitle,
  reaction = null,
  continueLabel = 'Continue',
  canContinue,
  onContinue,
  children,
}: OnboardingStepProps) {
  const progress = getStepProgress(step);
  const previousProgress = onboardingSteps.indexOf(step) / (onboardingSteps.length + 1);

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => router.back()}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Ionicons color={colors.textMuted} name="chevron-back" size={28} />
        </Pressable>
        <ProgressBar from={previousProgress} to={progress} />
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {children}
        <ReactionBubble text={reaction} />
      </ScrollView>

      <View style={styles.footer}>
        <AppButton disabled={!canContinue} label={continueLabel} onPress={onContinue} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  pressed: {
    opacity: 0.5,
  },
  headerSpacer: {
    width: 28,
  },
  content: {
    flexGrow: 1,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  heading: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
  },
  footer: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
});
