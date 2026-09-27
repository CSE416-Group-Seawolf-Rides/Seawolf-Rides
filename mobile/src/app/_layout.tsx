import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '../auth/SessionProvider';
import { stackScreenOptions } from '../navigation/stackScreenOptions';
import { colors } from '../theme';

function RootNavigator() {
  const { user } = useSession();

  // Signing in or out is a one-way door: the guard drops the other group's history,
  // so back never returns to the login screen after signing in.
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
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
