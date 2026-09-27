import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '../../auth/SessionProvider';
import { commuteToDraft } from '../../commute/commuteModel';
import { CommuteDraftProvider } from '../../commute/CommuteDraftProvider';
import { stackScreenOptions } from '../../navigation/stackScreenOptions';
import { colors } from '../../theme';

export const unstable_settings = {
  anchor: 'index',
};

// Opened from Home or Account to add or edit a commute. Starts from the saved commute
// so editing never begins from a blank slate.
export default function CommuteSetupLayout() {
  const { commute } = useSession();

  return (
    <CommuteDraftProvider initialDraft={commuteToDraft(commute)}>
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <Stack screenOptions={stackScreenOptions} />
      </SafeAreaView>
    </CommuteDraftProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
