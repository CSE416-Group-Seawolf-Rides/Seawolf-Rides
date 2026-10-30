import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radii, spacing } from '../theme';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'destructive';
}

export function AppButton({
  label,
  onPress,
  accessibilityLabel,
  disabled = false,
  variant = 'primary',
}: AppButtonProps) {
  const secondary = variant === 'secondary';

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary ? styles.secondary : styles.primary,
        variant === 'destructive' && styles.destructive,
        pressed && !disabled && (secondary ? styles.secondaryPressed : styles.primaryPressed),
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, secondary && styles.secondaryLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  primary: {
    backgroundColor: colors.accent,
  },
  primaryPressed: {
    backgroundColor: colors.accentDark,
  },
  destructive: {
    backgroundColor: colors.error,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1,
  },
  secondaryPressed: {
    backgroundColor: colors.accentSoft,
  },
  disabled: {
    opacity: 0.58,
  },
  label: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryLabel: {
    color: colors.accent,
  },
});
