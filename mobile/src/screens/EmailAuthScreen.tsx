import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  registerWithEmail,
  requestPasswordReset,
  signInWithEmail,
  toAuthServiceError,
} from '../auth/authService';
import {
  AuthMode,
  CredentialErrors,
  hasCredentialErrors,
  isStonyBrookEmail,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  validateCredentials,
} from '../auth/authValidation';
import { AppButton } from '../components/AppButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { colors, radii, spacing } from '../theme';

interface EmailAuthScreenProps {
  onBack: () => void;
}

const modeCopy = {
  signIn: {
    title: 'Welcome back',
    subtitle: 'Sign in with your Stony Brook email.',
    submit: 'Sign in',
    pending: 'Signing in…',
  },
  register: {
    title: 'Create your account',
    subtitle: 'Your @stonybrook.edu email keeps every ride within the campus community.',
    submit: 'Create account',
    pending: 'Creating account…',
  },
} as const;

const modeOptions: { mode: AuthMode; label: string }[] = [
  { mode: 'signIn', label: 'Sign in' },
  { mode: 'register', label: 'Create account' },
];

export function EmailAuthScreen({ onBack }: EmailAuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errors, setErrors] = useState<CredentialErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const copy = modeCopy[mode];

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrors({});
    setFormError(null);
    setNotice(null);
  }

  async function submit() {
    const credentials = { email, password };
    const nextErrors = validateCredentials(mode, credentials);
    setErrors(nextErrors);
    setFormError(null);
    setNotice(null);

    if (hasCredentialErrors(nextErrors)) {
      return;
    }

    setSubmitting(true);
    try {
      const authenticate = mode === 'signIn' ? signInWithEmail : registerWithEmail;
      await authenticate(credentials);
      if (mode === 'register') {
        setMode('signIn');
        setPassword('');
        setNotice(
          `We sent a verification link to ${normalizeEmail(email)}. Verify it, then sign in.`,
        );
      }
    } catch (error) {
      setFormError(toAuthServiceError(error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword() {
    setFormError(null);
    setNotice(null);
    if (!isStonyBrookEmail(email)) {
      setErrors((current) => ({
        ...current,
        email: 'Enter your @stonybrook.edu email first.',
      }));
      return;
    }

    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      setNotice(
        `If an account exists for ${normalizeEmail(email)}, a password-reset link is on its way.`,
      );
    } catch (error) {
      setFormError(toAuthServiceError(error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <Screen onBack={submitting ? undefined : onBack} subtitle={copy.subtitle} title={copy.title}>
        <View accessibilityRole="tablist" style={styles.modeSwitch}>
          {modeOptions.map((option) => {
            const selected = option.mode === mode;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected, disabled: submitting }}
                disabled={submitting}
                key={option.mode}
                onPress={() => changeMode(option.mode)}
                style={[styles.modeOption, selected && styles.modeOptionSelected]}
              >
                <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <TextField
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          editable={!submitting}
          error={errors.email}
          inputMode="email"
          keyboardType="email-address"
          label="Stony Brook email"
          onChangeText={(value) => {
            setEmail(value);
            setErrors((current) => ({ ...current, email: undefined }));
          }}
          onSubmitEditing={() => passwordRef.current?.focus()}
          placeholder="netid@stonybrook.edu"
          returnKeyType="next"
          submitBehavior="submit"
          textContentType="username"
          value={email}
        />

        <TextField
          accessory={
            <Pressable
              accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setPasswordVisible((visible) => !visible)}
            >
              <Ionicons
                color={colors.textMuted}
                name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                size={22}
              />
            </Pressable>
          }
          autoCapitalize="none"
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          autoCorrect={false}
          editable={!submitting}
          error={errors.password}
          helperText={
            mode === 'register' ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined
          }
          label="Password"
          onChangeText={(value) => {
            setPassword(value);
            setErrors((current) => ({ ...current, password: undefined }));
          }}
          onSubmitEditing={submit}
          ref={passwordRef}
          returnKeyType="go"
          secureTextEntry={!passwordVisible}
          textContentType={mode === 'register' ? 'newPassword' : 'password'}
          value={password}
        />

        {mode === 'signIn' && (
          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            hitSlop={8}
            onPress={resetPassword}
            style={({ pressed }) => [styles.forgotLink, pressed && styles.linkPressed]}
          >
            <Text style={styles.linkText}>Forgot password?</Text>
          </Pressable>
        )}

        {formError && (
          <View accessibilityLiveRegion="polite" style={styles.formError}>
            <Ionicons color={colors.error} name="alert-circle-outline" size={20} />
            <Text style={styles.formErrorText}>{formError}</Text>
          </View>
        )}

        {notice && (
          <View accessibilityLiveRegion="polite" style={styles.notice}>
            <Ionicons color={colors.success} name="checkmark-circle-outline" size={20} />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}

        <AppButton
          disabled={submitting}
          label={submitting ? copy.pending : copy.submit}
          onPress={submit}
        />

        {mode === 'register' && (
          <Text style={styles.nextStep}>
            Next, you’ll set up your profile and choose whether you’re driving, riding, or both.
          </Text>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  modeSwitch: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    flexDirection: 'row',
    padding: spacing.xs,
  },
  modeOption: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
  },
  modeOptionSelected: {
    backgroundColor: colors.surface,
    shadowColor: '#17212b',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  modeLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  modeLabelSelected: {
    color: colors.text,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: -spacing.sm,
    minHeight: 32,
    justifyContent: 'center',
  },
  linkPressed: {
    opacity: 0.6,
  },
  linkText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  formError: {
    alignItems: 'flex-start',
    backgroundColor: colors.errorSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  formErrorText: {
    color: colors.error,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  notice: {
    alignItems: 'flex-start',
    backgroundColor: colors.successSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  noticeText: {
    color: colors.success,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  nextStep: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
