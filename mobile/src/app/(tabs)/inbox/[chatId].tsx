import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { conversationFixtures } from '../../../prototypeData/fixtures';
import { ConversationScreen } from '../../../screens/ConversationScreen';

export default function ConversationRoute() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const conversation = conversationFixtures.find(
    (fixture) => fixture.preview.id === chatId,
  );

  if (!conversation) {
    return <Redirect href="/inbox" />;
  }

  return <ConversationScreen conversation={conversation} onBack={() => router.back()} onOpenProfile={(participantId, name) => router.push({ pathname: '/profile/[participantId]', params: { participantId, name } })} />;
}
