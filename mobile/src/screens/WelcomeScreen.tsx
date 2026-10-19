import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AuthProviderButton } from '../components/AuthProviderButton';
import { RouteIllustration } from '../components/RouteIllustration';
import { colors, spacing } from '../theme';

interface WelcomeScreenProps {
  onContinueWithEmail: () => void;
  // TEMPORARY demo shortcut; remove with SessionProvider.signInAsGuest.
  onContinueAsGuest: () => void;
}

const roles = [
  { title: 'Drive', description: 'Fill the empty seats on your commute.' },
  { title: 'Ride', description: 'Catch a lift with a Seawolf headed your way.' },
] as const;

export function WelcomeScreen({ onContinueWithEmail, onContinueAsGuest }: WelcomeScreenProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text accessibilityRole="header" style={styles.wordmark}>
        Seawolf Rides
      </Text>

      <RouteIllustration />

      <View style={styles.intro}>
        <Text style={styles.title}>Share the ride{'\n'}to campus.</Text>
        <Text style={styles.subtitle}>
          Carpooling for the Stony Brook community, matched by schedule and route.
        </Text>
      </View>

      <View style={styles.roles}>
        {roles.map((role, index) => (
          <View key={role.title} style={[styles.role, index > 0 && styles.roleDivider]}>
            <Text style={styles.roleTitle}>{role.title}</Text>
            <Text style={styles.roleDescription}>{role.description}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <AuthProviderButton
          icon={<Ionicons color={colors.text} name="mail-outline" size={20} />}
          label="Continue with email"
          onPress={onContinueWithEmail}
        />
        <Pressable
          accessibilityHint="Opens the app with a temporary demo account. Nothing is saved."
          accessibilityRole="button"
          hitSlop={8}
          onPress={onContinueAsGuest}
          style={({ pressed }) => [styles.guest, pressed && styles.guestPressed]}
        >
          <Ionicons color={colors.textMuted} name="eye-outline" size={16} />
          <Text style={styles.guestLabel}>Explore as a guest (demo)</Text>
        </Pressable>
        <Text style={styles.legal}>
          By continuing, you agree to the Terms and Privacy Policy.{`\n`}
          A verified @stonybrook.edu email is required.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  wordmark: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  intro: {
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 39,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
  },
  roles: {
    flexDirection: 'row',
  },
  role: {
    flex: 1,
    gap: spacing.xs,
    paddingRight: spacing.lg,
  },
  roleDivider: {
    borderLeftColor: colors.border,
    borderLeftWidth: 1,
    paddingLeft: spacing.lg,
    paddingRight: 0,
  },
  roleTitle: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  roleDescription: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  actions: {
    gap: spacing.md,
  },
  guest: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  guestPressed: {
    opacity: 0.6,
  },
  guestLabel: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  legal: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
