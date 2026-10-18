import { router } from 'expo-router';
import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { Avatar } from '../components/Avatar';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { ConversationScreen } from '../screens/ConversationScreen';
import { colors, spacing } from '../theme';
import { newMessageId, sendChatMessage, useChat, useChats } from './chatClient';
import { chatPartner } from './chatModel';

export function LiveInboxScreen() {
  const { user } = useSession();
  const chats = useChats(user?.id);
  return <Screen title="Inbox">
    {!chats.loaded && <Text>Loading conversations…</Text>}
    {chats.error && <Text accessibilityRole="alert">{chats.error}</Text>}
    {chats.loaded && !chats.error && !chats.items.length &&
      <Text style={{ color: colors.textMuted }}>No messages yet. Find a potential match and tap Send chat to coordinate your ride.</Text>}
    {chats.items.map((thread) => {
      const id = chatPartner(thread, user?.id ?? '');
      return <Pressable key={thread.id} accessibilityRole="button" accessibilityLabel={`Chat with ${thread.names[id]}`}
        onPress={() => router.push(`/inbox/${thread.id}`)}>
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar name={thread.names[id] ?? 'Carpool partner'} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{thread.names[id]}</Text>
          </View>
          <Text style={{ color: colors.textMuted }} numberOfLines={2}>{thread.lastMessage}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{new Date(thread.updatedAt).toLocaleString()}</Text>
        </Card>
      </Pressable>;
    })}
  </Screen>;
}
export function LiveChatScreen({ chatId }: { chatId: string }) {
  const { user } = useSession();
  const chat = useChat(chatId, user?.id);
  const pending = useRef<{ uid?: string; chatId: string; text: string; id: string } | null>(null);
  const thread = chat.thread;
  const other = thread ? chatPartner(thread, user?.id ?? '') : '';
  return <ConversationScreen
    key={`${user?.id}:${chatId}`}
    conversation={{
      participantId: other,
      preview: { id: chatId, participantName: thread?.names[other] ?? 'Conversation',
        commuteLabel: thread ? `Started for ${thread.localDate} · ${thread.campusLabel}` : '',
        lastMessage: thread?.lastMessage ?? '', timestamp: '' },
      messages: chat.messages.map((message) => ({ id: message.id,
        sender: message.senderId === user?.id ? 'me' : 'them', text: message.text,
        timestamp: new Date(message.sentAt).toLocaleString() })),
    }}
    loading={!chat.threadLoaded || !chat.messagesLoaded}
    error={chat.error}
    hasEarlier={chat.hasEarlier}
    onLoadEarlier={chat.loadEarlier}
    onBack={() => router.back()}
    onOpenProfile={() => {}}
    onSendMessage={async (text) => {
      if (!pending.current || pending.current.uid !== user?.id || pending.current.chatId !== chatId || pending.current.text !== text)
        pending.current = { uid: user?.id, chatId, text, id: newMessageId() };
      const operation = pending.current;
      await sendChatMessage(chatId, operation.id, text);
      if (pending.current === operation) pending.current = null;
    }}
  />;
}
