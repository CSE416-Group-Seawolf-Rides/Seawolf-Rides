import * as Haptics from 'expo-haptics';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '../theme';

export interface Choice {
  label: string;
  description?: string;
  destructive?: boolean;
  onPress: () => void;
}

interface ChoiceSheetProps {
  title: string;
  message?: string;
  choices: Choice[];
  cancelLabel?: string;
  onClose: () => void;
}

// A bottom sheet for decisions with consequences: each choice says what will happen
// before the user commits, and backing out is always one tap away.
export function ChoiceSheet({
  title,
  message,
  choices,
  cancelLabel = 'Never mind',
  onClose,
}: ChoiceSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.grabber} />
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {message && <Text style={styles.message}>{message}</Text>}

          <View style={styles.choices}>
            {choices.map((choice) => (
              <Pressable
                accessibilityHint={choice.description}
                accessibilityLabel={choice.label}
                accessibilityRole="button"
                key={choice.label}
                onPress={() => {
                  Haptics.notificationAsync(
                    choice.destructive
                      ? Haptics.NotificationFeedbackType.Warning
                      : Haptics.NotificationFeedbackType.Success,
                  );
                  choice.onPress();
                }}
                style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}
              >
                <Text style={[styles.choiceLabel, choice.destructive && styles.destructive]}>
                  {choice.label}
                </Text>
                {choice.description && (
                  <Text style={styles.choiceDescription}>{choice.description}</Text>
                )}
              </Pressable>
            ))}
          </View>

          <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(23, 33, 43, 0.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    height: 5,
    marginBottom: spacing.sm,
    width: 36,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  message: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
    marginTop: -spacing.sm,
  },
  choices: {
    gap: spacing.sm,
  },
  choice: {
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 2,
    minHeight: 56,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  choicePressed: {
    backgroundColor: colors.surfaceMuted,
  },
  choiceLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  destructive: {
    color: colors.error,
  },
  choiceDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 19,
  },
  cancel: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
});
