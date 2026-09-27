import { Stack, usePathname } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { stackScreenOptions } from '../../navigation/stackScreenOptions';
import { colors } from '../../theme';

export default function AuthLayout() {
  const isWelcomeRoute = usePathname() === '/';

  return (
    <SafeAreaView edges={isWelcomeRoute ? [] : ['bottom']} style={styles.safeArea}>
      <Stack screenOptions={stackScreenOptions} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
