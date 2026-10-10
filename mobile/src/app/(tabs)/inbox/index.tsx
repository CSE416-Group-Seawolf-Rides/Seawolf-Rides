import { router } from 'expo-router';

import { conversationFixtures } from '../../../prototypeData/fixtures';
import { useRides } from '../../../rides/RidesProvider';
import { ChatsScreen } from '../../../screens/ChatsScreen';

export default function ChatsRoute() {
  const { outgoing, incoming } = useRides();

  // A chat opens once a match is confirmed.
  const chats = conversationFixtures.filter(({ offerId, riderId }) =>
    offerId
      ? outgoing.some((request) => request.offerId === offerId && request.status === 'accepted')
      : riderId
        ? incoming.some((request) => request.id === riderId && request.status === 'accepted')
        : false,
  );

  return (
    <ChatsScreen
      chats={chats.map((conversation) => conversation.preview)}
      onOpenChat={(chatId) => router.push(`/inbox/${chatId}`)}
    />
  );
}
