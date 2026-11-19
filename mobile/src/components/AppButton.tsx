import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radii, spacing } from '../theme';
import { isWeb, useIsDesktopWeb, webRadii } from '../web/webLayout';

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
  const desktop = useIsDesktopWeb();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={(state) => {
        const { pressed } = state;
        // React Native Web adds `hovered`; native never sets it.
        const hovered = (state as { hovered?: boolean }).hovered && !disabled;
        return [
          styles.button,
          secondary ? styles.secondary : styles.primary,
          variant === 'destructive' && styles.destructive,
          isWeb && styles.webButton,
          isWeb && secondary && styles.webSecondary,
          desktop && styles.desktopButton,
          (pressed || hovered) &&
            !disabled &&
            (secondary
              ? isWeb
                ? styles.webSecondaryPressed
                : styles.secondaryPressed
              : styles.primaryPressed),
          disabled && styles.disabled,
        ];
      }}
    >
      <Text style={[styles.label, secondary && (isWeb ? styles.webSecondaryLabel : styles.secondaryLabel)]}>
        {label}
      </Text>
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
  // Web (docs/web-app-plan.md, section 11.4): smaller corners, and secondary actions are a
  // light gray fill with dark text instead of a red outline, so red marks only the main action.
  webButton: {
    borderRadius: webRadii.control,
  },
  webSecondary: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 0,
  },
  webSecondaryPressed: {
    backgroundColor: colors.border,
  },
  webSecondaryLabel: {
    color: colors.text,
  },
  // Laptop-width web: buttons hug their label instead of spanning the page.
  desktopButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    minWidth: 120,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
});
