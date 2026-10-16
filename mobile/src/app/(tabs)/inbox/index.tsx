import { router } from 'expo-router';

import { useSession } from '../../../auth/SessionProvider';
import { conversationFixtures } from '../../../prototypeData/fixtures';
import { useRides } from '../../../rides/RidesProvider';
import { ChatsScreen } from '../../../screens/ChatsScreen';

export default function ChatsRoute() {
  const { user } = useSession();
  const { outgoing, incoming } = useRides();
  const returning = user !== null && !user.isNewUser;

  // A chat opens once a match is confirmed; unlinked chats are the demo user's history.
  const chats = conversationFixtures.filter(({ offerId, requestId }) =>
    offerId
      ? outgoing.some((request) => request.offerId === offerId && request.status === 'accepted')
      : requestId
        ? incoming.some((request) => request.id === requestId && request.status === 'accepted')
        : returning,
  );

  return (
    <ChatsScreen
      chats={chats.map((conversation) => ({ ...conversation.preview, participantId: conversation.participantId }))}
      onOpenChat={(chatId) => router.push(`/inbox/${chatId}`)}
    />
  );
}
