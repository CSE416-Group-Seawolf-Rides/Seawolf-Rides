import { DevelopmentOnly } from '../../../mvp/DevelopmentOnly';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

import { useSession } from '../../../auth/SessionProvider';
import { incomingForCommute } from '../../../rides/rideModel';
import { useRides } from '../../../rides/RidesProvider';
import { ReviewRequestsScreen } from '../../../screens/ReviewRequestsScreen';

function ReviewRequestsRoute() {
  const { commute } = useSession();
  const { outgoing, incoming, respondToRequest, driverOccurrences } = useRides();

  return (
    <ReviewRequestsScreen
      onDone={() => router.back()}
      onOpenProfile={(participantId, name) => router.push({ pathname: '/profile/[participantId]', params: { participantId, name } })}
      onRespond={async (requestId, status) => {
        const result = await respondToRequest(requestId, status);
        await Haptics.notificationAsync(
          result.ok
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        );
        return result;
      }}
      pending={incomingForCommute(commute, incoming, outgoing, driverOccurrences).filter(
        (view) => view.request.status === 'pending',
      )}
    />
  );
}

export default function DevelopmentRoute() { return <DevelopmentOnly><ReviewRequestsRoute /></DevelopmentOnly>; }
