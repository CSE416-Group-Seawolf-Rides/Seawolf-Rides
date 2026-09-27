import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '../auth/SessionProvider';
import { stackScreenOptions } from '../navigation/stackScreenOptions';
import { colors } from '../theme';

function RootNavigator() {
  const { user, needsOnboarding } = useSession();

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
});
