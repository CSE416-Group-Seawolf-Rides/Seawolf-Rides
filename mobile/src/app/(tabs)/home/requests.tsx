import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

import { useSession } from '../../../auth/SessionProvider';
import { incomingForCommute } from '../../../rides/rideModel';
import { useRides } from '../../../rides/RidesProvider';
import { ReviewRequestsScreen } from '../../../screens/ReviewRequestsScreen';

export default function ReviewRequestsRoute() {
  const { commute } = useSession();
  const { outgoing, incoming, respondToRequest, driverOccurrences } = useRides();

  return (
    <ReviewRequestsScreen
      onDone={() => router.back()}
      onOpenProfile={(participantId, name) => router.push({ pathname: '/profile/[participantId]', params: { participantId, name } })}
      onRespond={(requestId, status) => {
        const result = respondToRequest(requestId, status);
        Haptics.notificationAsync(
          result === 'ACCEPTED'
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        );
      }}
      pending={incomingForCommute(commute, incoming, outgoing, driverOccurrences).filter(
        (view) => view.request.status === 'pending',
      )}
    />
  );
}
