import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../theme';
import { AppButton } from '../AppButton';
import { ProgressBar } from './ProgressBar';
import { ReactionBubble } from './ReactionBubble';

export interface FlowProgress {
  from: number;
  to: number;
}

interface FlowStepProps extends PropsWithChildren {
  progress: FlowProgress;
  title: string;
  subtitle?: string;
  reaction?: string | null;
  continueLabel?: string;
  canContinue: boolean;
  onContinue: () => void;
  // "close" dismisses a whole flow (e.g. the first step of a modal); "back" goes one step.
  leading?: 'back' | 'close';
  onLeadingPress?: () => void;
  footerNote?: ReactNode;
}

// Shared layout for one-question-per-screen flows (onboarding, commute setup):
// back/close, animated progress, the question, answers, a reaction, and a pinned CTA.
export function FlowStep({
  progress,
  title,
  subtitle,
  reaction = null,
  continueLabel = 'Continue',
  canContinue,
  onContinue,
  leading = 'back',
  onLeadingPress = () => router.back(),
  footerNote,
  children,
}: FlowStepProps) {
  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={leading === 'close' ? 'Close' : 'Go back'}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onLeadingPress}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Ionicons
            color={colors.textMuted}
            name={leading === 'close' ? 'close' : 'chevron-back'}
            size={28}
          />
        </Pressable>
        <ProgressBar from={progress.from} to={progress.to} />
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
        {footerNote}
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
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
});
