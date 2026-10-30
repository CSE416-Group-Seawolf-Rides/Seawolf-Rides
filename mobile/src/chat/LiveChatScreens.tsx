import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { ChatTripSheet } from './ChatTripSheet';
import { ChatContextCard } from './ChatContextCard';
import { Avatar } from '../components/Avatar';
import { Card } from '../components/Card';
import { openPublicProfile } from '../profiles/PublicProfileLink';
import { Screen } from '../components/Screen';
import { ConversationScreen } from '../screens/ConversationScreen';
import { colors, spacing } from '../theme';
import { newMessageId, sendChatMessage, useChat, useChats } from './chatClient';
import { chatPartner } from './chatModel';
import { ChatTimelineCard } from './ChatTimelineCard';
import type { RideRequest } from '../mvp/rideRequestModel';
import { useHomeClock } from '../rides/useHomeClock';
import { useIsBlocked } from '../safety/safetyClient';

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
          <Text style={{ color: colors.textMuted }} numberOfLines={2}>{thread.lastMessage || 'Ride request · Start the conversation'}</Text>
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
  const [tripSelection, setTripSelection] = useState<{ screenKey: string; ride?: RideRequest } | null>(null);
  const screenKey = `${user?.id}:${chatId}`;
  const thread = chat.thread;
  const other = thread ? chatPartner(thread, user?.id ?? '') : '';
  const isBlocked = useIsBlocked(user?.id, other);
  const { now } = useHomeClock(chat.messages.flatMap((entry) => entry.ride
    ? [entry.ride.plan.departure, entry.ride.plan.vehicleCampusArrival, entry.ride.plan.riderDestinationArrival] : []));
  const byId = new Map(chat.messages.map((entry) => [entry.id, entry]));
  return <><ConversationScreen
    key={`conversation:${screenKey}`}
    conversation={{
      participantId: other,
      preview: { id: chatId, participantName: thread?.names[other] ?? 'Conversation',
        commuteLabel: thread ? 'Carpool conversation' : '',
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
    onOpenProfile={() => thread && openPublicProfile(other, thread.names[other] ?? 'Carpool partner')}
    contextCard={<>{isBlocked ? (
      <Card style={{ backgroundColor: 'rgba(217, 72, 72, 0.08)', borderColor: colors.error, borderWidth: 1, gap: spacing.xs, marginBottom: spacing.sm }}>
        <Text style={{ color: colors.error, fontSize: 14, fontWeight: '700' }}>You have blocked this commuter.</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>You will not receive new match recommendations or notifications from them.</Text>
      </Card>
    ) : (
      thread && !thread.requestId && <ChatContextCard thread={thread} uid={user?.id ?? ''}
        onViewTrip={() => setTripSelection({ screenKey })} />
    )}</>}
    renderMessage={(message) => {
      const entry = byId.get(message.id);
      return entry?.ride && (entry.type === 'RIDE_REQUEST' || entry.type === 'PRICE_CHANGE')
        ? <ChatTimelineCard entry={entry} uid={user?.id ?? ''} now={now.getTime() / 1000}
            onViewRide={(ride) => setTripSelection({ screenKey, ride })} /> : null;
    }}
    onSendMessage={async (text) => {
      if (isBlocked) {
        throw new Error('You cannot message a blocked commuter. Unblock them first.');
      }
      if (!pending.current || pending.current.uid !== user?.id || pending.current.chatId !== chatId || pending.current.text !== text)
        pending.current = { uid: user?.id, chatId, text, id: newMessageId() };
      const operation = pending.current;
      await sendChatMessage(chatId, operation.id, text);
      if (pending.current === operation) pending.current = null;
    }}
  />
    {thread && !chat.error && tripSelection?.screenKey === screenKey && <ChatTripSheet
      key={`trip:${screenKey}:${tripSelection.ride?.id ?? 'inquiry'}:${tripSelection.ride?.attemptId ?? ''}`}
      thread={thread} uid={user?.id ?? ''} selectedRide={tripSelection.ride} onClose={() => setTripSelection(null)} />}
  </>;
}
