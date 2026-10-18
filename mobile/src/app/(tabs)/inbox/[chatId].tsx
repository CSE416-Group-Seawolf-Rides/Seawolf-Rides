import { useLocalSearchParams } from 'expo-router';
import { LiveChatScreen } from '../../../chat/LiveChatScreens';
export default function ConversationRoute() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  return <LiveChatScreen chatId={chatId} />;
}
