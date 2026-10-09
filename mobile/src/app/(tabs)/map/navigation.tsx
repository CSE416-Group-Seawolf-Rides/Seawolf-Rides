import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../../components/AppButton';
import { decodeNavigationRequest } from '../../../navigation/googleNavigation';
import { getRuntimeGoogleNavigationAvailability } from '../../../navigation/googleNavigationRuntime';
import { colors, spacing } from '../../../theme';

export default function GoogleNavigationRoute() {
  const { request: encodedRequest } = useLocalSearchParams<{ request?: string }>();
  const request = decodeNavigationRequest(encodedRequest);
  const availability = getRuntimeGoogleNavigationAvailability();

  if (!request || availability.status !== 'READY') {
    const message = !request
      ? 'The navigation request is invalid.'
      : availability.status === 'READY'
        ? 'Google Navigation is unavailable.'
        : availability.message;
    return (
      <View style={styles.fallback}>
        <Text accessibilityRole="header" style={styles.title}>Google Navigation unavailable</Text>
        <Text style={styles.message}>{message}</Text>
        <AppButton label="Back to Map" onPress={() => router.back()} />
      </View>
    );
  }

  // Avoid loading a TurboModule-backed package in Expo Go. Metro still bundles
  // this module, but it is evaluated only after the runtime module check passes.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleNavigationScreen } = require('../../../screens/GoogleNavigationScreen') as typeof import('../../../screens/GoogleNavigationScreen');
  return <GoogleNavigationScreen onClose={() => router.back()} request={request} />;
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: colors.background, flex: 1, gap: spacing.lg, justifyContent: 'center', padding: spacing.xl },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  message: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
});
