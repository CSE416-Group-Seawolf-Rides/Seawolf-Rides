import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';

import { useSession } from '../auth/SessionProvider';
import { buildCommuteSchedule } from './commuteModel';
import { useCommuteDraft } from './CommuteDraftProvider';
import { useCommuteRole } from './useCommuteRole';

// Editing a saved commute opens one step at a time (`?edit=1`) from the summary.
// Saving a step stores the whole commute right away and returns to the summary, so
// changing one thing never means walking through every step again.
export function useCommuteEdit() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const role = useCommuteRole();
  const { draft } = useCommuteDraft();
  const { saveCommute } = useSession();

  return {
    editing: edit === '1',
    saveEdit: async () => {
      try {
        await saveCommute(buildCommuteSchedule(draft, role));
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      } catch {
        Alert.alert('Couldn’t save your commute', 'Check your connection and try again.');
      }
    },
  };
}
