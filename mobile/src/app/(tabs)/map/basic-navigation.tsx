import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../../components/AppButton';
import { decodeRouteNavigationRequest } from '../../../navigation/routeNavigationRequest';
import { BasicNavigationScreen } from '../../../screens/BasicNavigationScreen';
import { colors, spacing } from '../../../theme';

export default function BasicNavigationRoute() {
  const { request: encodedRequest } = useLocalSearchParams<{ request?: string }>();
  const request = decodeRouteNavigationRequest(encodedRequest);
  if (!request) {
    return (
      <View style={styles.fallback}>
        <Text accessibilityRole="header" style={styles.title}>Basic navigation unavailable</Text>
        <Text style={styles.message}>The navigation request is missing or malformed.</Text>
        <AppButton label="Back to Map" onPress={() => router.back()} />
      </View>
    );
  }
  return <BasicNavigationScreen onClose={() => router.back()} request={request} />;
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: colors.background, flex: 1, gap: spacing.lg, justifyContent: 'center', padding: spacing.xl },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  message: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
});
