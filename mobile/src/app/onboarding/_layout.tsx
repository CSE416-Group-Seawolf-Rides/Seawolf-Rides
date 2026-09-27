import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommuteDraftProvider } from '../../commute/CommuteDraftProvider';
import { stackScreenOptions } from '../../navigation/stackScreenOptions';
import { OnboardingProvider } from '../../onboarding/OnboardingProvider';
import { colors } from '../../theme';

export const unstable_settings = {
  anchor: 'index',
};

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <CommuteDraftProvider>
        <SafeAreaView edges={['bottom']} style={styles.safeArea}>
          <Stack screenOptions={stackScreenOptions} />
        </SafeAreaView>
      </CommuteDraftProvider>
    </OnboardingProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
