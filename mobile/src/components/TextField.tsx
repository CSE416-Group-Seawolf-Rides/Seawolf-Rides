import { ReactNode, useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { colors, radii, spacing } from '../theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  helperText?: string;
  accessory?: ReactNode;
  ref?: any;
}

export function TextField({
  label,
  error,
  helperText,
  accessory,
  onBlur,
  onFocus,
  ref,
  ...inputProps
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const message = error ?? helperText;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          focused && styles.inputRowFocused,
          error !== undefined && styles.inputRowError,
        ]}
      >
        <TextInput
          accessibilityHint={message}
          accessibilityLabel={label}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          placeholderTextColor={colors.textMuted}
          ref={ref}
          style={styles.input}
          {...inputProps}
        />
        {accessory}
      </View>
      {message !== undefined && (
        <Text style={[styles.message, error !== undefined && styles.errorMessage]}>
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  inputRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  inputRowFocused: {
    borderColor: colors.accent,
  },
  inputRowError: {
    borderColor: colors.error,
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    paddingVertical: spacing.md,
  },
  message: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  errorMessage: {
    color: colors.error,
  },
});
