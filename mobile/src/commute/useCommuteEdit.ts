import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { Alert } from 'react-native';

import { useSession } from '../auth/SessionProvider';
import { SavePendingError, saveErrorMessage } from '../persistence/saveCoordinator';
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
  const submitting = useRef(false);

  return {
    editing: edit === '1',
    saveEdit: async () => {
      if (submitting.current) {
        return;
      }
      submitting.current = true;
      try {
        await saveCommute(buildCommuteSchedule(draft, role));
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      } catch (error) {
        Alert.alert(
          error instanceof SavePendingError ? 'Save still pending' : 'Couldn’t save your commute',
          saveErrorMessage(error, 'Check your connection and try again.'),
        );
      } finally {
        submitting.current = false;
      }
    },
  };
}
