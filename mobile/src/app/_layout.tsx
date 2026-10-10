import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '../auth/SessionProvider';
import { AppButton } from '../components/AppButton';
import { stackScreenOptions } from '../navigation/stackScreenOptions';
import { colors, spacing } from '../theme';

function RootNavigator() {
  const { user, needsOnboarding, status, error, retry, signOut } = useSession();

  if (status === 'loading') {
    return (
      <View accessibilityLabel="Loading your account" style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.errorState}>
        <Text accessibilityRole="header" style={styles.errorTitle}>
          Couldn’t load your account
        </Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <AppButton label="Try again" onPress={retry} />
        <AppButton label="Sign out" onPress={signOut} variant="secondary" />
      </View>
    );
  }

  // Signing in, finishing onboarding, and signing out are one-way doors: each guard
  // drops the previous group's history, so back never returns to a finished stage.
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={needsOnboarding}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!!user && !needsOnboarding}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="commute-setup" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
          <RootNavigator />
        </SafeAreaView>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  errorState: {
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  errorTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorMessage: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
