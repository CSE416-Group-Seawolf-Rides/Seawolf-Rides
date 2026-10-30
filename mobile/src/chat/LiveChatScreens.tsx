import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '../auth/SessionProvider';
import { ChatTripSheet } from './ChatTripSheet';
import { ChatContextCard } from './ChatContextCard';
import { Avatar } from '../components/Avatar';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { openPublicProfile } from '../profiles/PublicProfileLink';
import { Screen } from '../components/Screen';
import { ConversationScreen } from '../screens/ConversationScreen';
import { colors, radii, spacing } from '../theme';
import { newMessageId, sendChatMessage, useChat, useChats } from './chatClient';
import { chatPartner } from './chatModel';
import { formatBubbleTime, formatThreadTimestamp, getThreadBadge } from './chatPresentation';
import { ChatTimelineCard } from './ChatTimelineCard';
import type { RideRequest } from '../mvp/rideRequestModel';
import { useHomeClock } from '../rides/useHomeClock';
import { useIsBlocked } from '../safety/safetyClient';

export function LiveInboxScreen() {
  const { user } = useSession();
  const chats = useChats(user?.id);

  return (
    <Screen
      eyebrow="MESSAGES"
      title="Inbox"
      subtitle="Coordinate pickups, schedules, and rides with your Stony Brook carpool partners."
    >
      {!chats.loaded && (
        <Card style={styles.centerCard}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.loadingText}>Loading conversations…</Text>
        </Card>
      )}

      {chats.error && (
        <Card style={[styles.centerCard, styles.errorCard]}>
          <Ionicons name="alert-circle-outline" size={24} color={colors.error} />
          <Text accessibilityRole="alert" style={styles.errorText}>{chats.error}</Text>
        </Card>
      )}

      {chats.loaded && !chats.error && !chats.items.length && (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="chatbubbles-outline" size={32} color={colors.accent} />
          </View>
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptyBody}>
            When you request a ride or match with another Stony Brook commuter, your conversation and pickup coordination will appear here.
          </Text>
          <View style={styles.emptyButtonWrapper}>
            <AppButton
              label="Find a Commute Match"
              variant="primary"
              onPress={() => router.push('/home')}
            />
          </View>
        </Card>
      )}

      {chats.items.map((thread) => {
        const id = chatPartner(thread, user?.id ?? '');
        const partnerName = thread.names[id] ?? 'Carpool partner';
        const badge = getThreadBadge(thread, user?.id ?? '');
        const timestamp = formatThreadTimestamp(thread.updatedAt);
        const hasActiveRequest = Boolean(thread.requestId);

        return (
          <Pressable
            key={thread.id}
            accessibilityRole="button"
            accessibilityLabel={`Chat with ${partnerName}`}
            onPress={() => router.push(`/inbox/${thread.id}`)}
            style={({ pressed }) => [styles.threadPressable, pressed && styles.threadPressed]}
          >
            <Card style={styles.threadCard}>
              <View style={styles.threadRow}>
                <Avatar name={partnerName} participantId={id} size={50} />
                <View style={styles.threadContent}>
                  <View style={styles.topRow}>
                    <View style={styles.nameAndBadge}>
                      <Text numberOfLines={1} style={styles.nameText}>{partnerName}</Text>
                      {badge && (
                        <View style={[styles.badge, badge.isDriver ? styles.driverBadge : styles.riderBadge]}>
                          <Text style={[styles.badgeText, badge.isDriver ? styles.driverBadgeText : styles.riderBadgeText]}>
                            {badge.label}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.timeText}>{timestamp}</Text>
                  </View>

                  {thread.campusLabel ? (
                    <View style={styles.campusRow}>
                      <Ionicons name="school-outline" size={12} color={colors.accent} />
                      <Text style={styles.campusText}>{thread.campusLabel} Commute</Text>
                    </View>
                  ) : null}

                  <View style={styles.snippetRow}>
                    <Text numberOfLines={1} style={styles.snippetText}>
                      {thread.lastMessage || 'Ride request · Start the conversation'}
                    </Text>
                    {hasActiveRequest && (
                      <View style={styles.tripBadge}>
                        <Text style={styles.tripBadgeText}>Active Trip</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.chevron} />
              </View>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
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

  return (
    <>
      <ConversationScreen
        key={`conversation:${screenKey}`}
        conversation={{
          participantId: other,
          preview: {
            id: chatId,
            participantName: thread?.names[other] ?? 'Conversation',
            commuteLabel: thread?.campusLabel ? `${thread.campusLabel} Carpool` : (thread ? 'Carpool conversation' : ''),
            lastMessage: thread?.lastMessage ?? '',
            timestamp: thread ? formatThreadTimestamp(thread.updatedAt) : '',
          },
          messages: chat.messages.map((message) => ({
            id: message.id,
            sender: message.senderId === user?.id ? 'me' : 'them',
            text: message.text,
            timestamp: formatBubbleTime(message.sentAt),
          })),
        }}
        loading={!chat.threadLoaded || !chat.messagesLoaded}
        error={chat.error}
        hasEarlier={chat.hasEarlier}
        onLoadEarlier={chat.loadEarlier}
        onBack={() => router.back()}
        onOpenProfile={() => thread && openPublicProfile(other, thread.names[other] ?? 'Carpool partner')}
        contextCard={
          <>
            {isBlocked ? (
              <Card style={{ backgroundColor: 'rgba(217, 72, 72, 0.08)', borderColor: colors.error, borderWidth: 1, gap: spacing.xs, marginBottom: spacing.sm }}>
                <Text style={{ color: colors.error, fontSize: 14, fontWeight: '700' }}>You have blocked this commuter.</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>You will not receive new match recommendations or notifications from them.</Text>
              </Card>
            ) : (
              thread && !thread.requestId && (
                <ChatContextCard thread={thread} uid={user?.id ?? ''} onViewTrip={() => setTripSelection({ screenKey })} />
              )
            )}
          </>
        }
        renderMessage={(message) => {
          const entry = byId.get(message.id);
          return entry?.ride && (entry.type === 'RIDE_REQUEST' || entry.type === 'PRICE_CHANGE') ? (
            <ChatTimelineCard
              entry={entry}
              uid={user?.id ?? ''}
              now={now.getTime() / 1000}
              onViewRide={(ride) => setTripSelection({ screenKey, ride })}
            />
          ) : null;
        }}
        onSendMessage={async (text) => {
          if (isBlocked) {
            throw new Error('You cannot message a blocked commuter. Unblock them first.');
          }
          if (!pending.current || pending.current.uid !== user?.id || pending.current.chatId !== chatId || pending.current.text !== text) {
            pending.current = { uid: user?.id, chatId, text, id: newMessageId() };
          }
          const operation = pending.current;
          await sendChatMessage(chatId, operation.id, text);
          if (pending.current === operation) pending.current = null;
        }}
      />
      {thread && !chat.error && tripSelection?.screenKey === screenKey && (
        <ChatTripSheet
          key={`trip:${screenKey}:${tripSelection.ride?.id ?? 'inquiry'}:${tripSelection.ride?.attemptId ?? ''}`}
          thread={thread}
          uid={user?.id ?? ''}
          selectedRide={tripSelection.ride}
          onClose={() => setTripSelection(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  centerCard: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  errorCard: {
    borderColor: colors.error,
    borderWidth: 1,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  emptyIconCircle: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    height: 64,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    width: 64,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyButtonWrapper: {
    marginTop: spacing.md,
    width: '100%',
  },
  threadPressable: {
    marginBottom: spacing.sm,
  },
  threadPressed: {
    opacity: 0.75,
  },
  threadCard: {
    padding: spacing.md,
  },
  threadRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  threadContent: {
    flex: 1,
    gap: 3,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nameAndBadge: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    marginRight: spacing.sm,
  },
  nameText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    maxWidth: '75%',
  },
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  driverBadge: {
    backgroundColor: colors.accentSoft,
  },
  driverBadgeText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
  },
  riderBadge: {
    backgroundColor: colors.surfaceMuted,
  },
  riderBadgeText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  timeText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  campusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  campusText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  snippetRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  snippetText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 13,
    marginRight: spacing.xs,
  },
  tripBadge: {
    backgroundColor: colors.successSoft,
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tripBadgeText: {
    color: colors.success,
    fontSize: 10,
    fontWeight: '700',
  },
  chevron: {
    marginLeft: 2,
  },
});
