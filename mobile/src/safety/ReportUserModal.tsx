import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { colors, radii, spacing } from '../theme';
import { submitReport } from './safetyClient';
import { REPORT_REASONS, type ReportReason } from './safetyModel';

interface ReportUserModalProps {
  visible: boolean;
  reporterId: string;
  targetId: string;
  targetName: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

export function ReportUserModal({
  visible,
  reporterId,
  targetId,
  targetName,
  onClose,
  onSubmitted,
}: ReportUserModalProps) {
  const insets = useSafeAreaInsets();
  const [selectedReason, setSelectedReason] = useState<ReportReason>('inappropriate_behavior');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await submitReport(reporterId, {
        targetId,
        targetName,
        reason: selectedReason,
        details: details.trim() || undefined,
      });
      setSubmitted(true);
      if (onSubmitted) onSubmitted();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit report. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = () => {
    setError(null);
    setDetails('');
    setSubmitted(false);
    onClose();
  };

  return (
    <Modal animationType="slide" onRequestClose={handleDismiss} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close report modal" onPress={handleDismiss} style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons color={colors.error} name="flag" size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={styles.title}>
                Report {targetName}
              </Text>
              <Text style={styles.subtitle}>
                Reports are reviewed privately to maintain campus safety.
              </Text>
            </View>
            <Pressable accessibilityLabel="Cancel" onPress={handleDismiss} style={styles.closeBtn}>
              <Ionicons color={colors.textMuted} name="close" size={22} />
            </Pressable>
          </View>

          {submitted ? (
            <View style={styles.submittedContainer}>
              <Ionicons color={colors.success} name="checkmark-circle" size={54} />
              <Text style={styles.submittedTitle}>Report Submitted</Text>
              <Text style={styles.submittedCopy}>
                Thank you for looking out for the Stony Brook carpool community. We will review the details promptly.
              </Text>
              <View style={{ marginTop: spacing.md, width: '100%' }}>
                <AppButton label="Done" onPress={handleDismiss} variant="primary" />
              </View>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 420 }}
            >
              <Text style={styles.sectionHeader}>What is the issue?</Text>
              {REPORT_REASONS.map((option) => {
                const selected = selectedReason === option.key;
                return (
                  <Pressable
                    key={option.key}
                    accessibilityLabel={option.label}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedReason(option.key)}
                    style={[styles.reasonOption, selected && styles.reasonOptionSelected]}
                  >
                    <View style={styles.radioRow}>
                      <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
                        {selected && <View style={styles.radioDot} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.reasonLabel, selected && styles.reasonLabelSelected]}>
                          {option.label}
                        </Text>
                        <Text style={styles.reasonDesc}>{option.description}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}

              <Text style={styles.sectionHeader}>Additional details (optional)</Text>
              <TextInput
                accessibilityLabel="Additional report details"
                maxLength={500}
                multiline
                numberOfLines={3}
                onChangeText={setDetails}
                placeholder="Briefly describe what happened..."
                placeholderTextColor={colors.textMuted}
                style={styles.detailsInput}
                value={details}
              />
              <Text style={styles.charCount}>{details.length}/500</Text>

              {error && (
                <Text accessibilityRole="alert" style={styles.errorText}>
                  {error}
                </Text>
              )}

              <View style={styles.actionRow}>
                <View style={{ flex: 1 }}>
                  <AppButton label="Cancel" onPress={handleDismiss} variant="secondary" />
                </View>
                <View style={{ flex: 1 }}>
                  {submitting ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator color={colors.accent} />
                    </View>
                  ) : (
                    <AppButton
                      label="Submit Report"
                      onPress={handleSubmit}
                      variant="destructive"
                    />
                  )}
                </View>
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(10, 14, 18, 0.65)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    gap: spacing.md,
    maxHeight: '85%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    height: 4,
    marginBottom: spacing.xs,
    width: 44,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(217, 72, 72, 0.12)',
    borderRadius: radii.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  sectionHeader: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  reasonOption: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  reasonOptionSelected: {
    borderColor: colors.error,
    backgroundColor: 'rgba(217, 72, 72, 0.05)',
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  radioCircle: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    marginTop: 2,
    width: 20,
  },
  radioCircleSelected: {
    borderColor: colors.error,
  },
  radioDot: {
    backgroundColor: colors.error,
    borderRadius: radii.pill,
    height: 10,
    width: 10,
  },
  reasonLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  reasonLabelSelected: {
    color: colors.error,
  },
  reasonDesc: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  detailsInput: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    minHeight: 80,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  charCount: {
    alignSelf: 'flex-end',
    color: colors.textMuted,
    fontSize: 12,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  submittedContainer: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  submittedTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  submittedCopy: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
});
