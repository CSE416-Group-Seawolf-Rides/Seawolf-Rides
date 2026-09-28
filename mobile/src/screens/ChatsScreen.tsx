import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { ChatPreview } from '../prototypeData/types';
import { colors, radii, spacing } from '../theme';

interface ChatsScreenProps {
  chats: ChatPreview[];
  onOpenChat: (id: string) => void;
}

export function ChatsScreen({ chats, onOpenChat }: ChatsScreenProps) {
  return (
    <Screen
      eyebrow="MESSAGES"
      subtitle="Continue conversations about upcoming commutes."
      title="Inbox"
    >
      {chats.length === 0 ? (
        <Card>
          <Text style={styles.empty}>
            No messages yet. Once a driver accepts your request, or you accept a rider, you can
            plan the pickup here.
          </Text>
        </Card>
      ) : (
        <Card style={styles.inboxCard}>
          {chats.map((chat, index) => (
            <Pressable
              accessibilityLabel={`Open chat with ${chat.participantName}`}
              accessibilityRole="button"
              key={chat.id}
              onPress={() => onOpenChat(chat.id)}
              style={({ pressed }) => [
                styles.chatRow,
                index < chats.length - 1 && styles.chatBorder,
                pressed && styles.chatPressed,
              ]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{chat.participantName.charAt(0)}</Text>
              </View>
              <View style={styles.chatCopy}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{chat.participantName}</Text>
                  <Text style={styles.timestamp}>{chat.timestamp}</Text>
                </View>
                <Text style={styles.commute}>{chat.commuteLabel}</Text>
                <Text numberOfLines={1} style={styles.message}>
                  {chat.lastMessage}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </Card>
      )}

      <Text style={styles.fixtureNote}>
        Conversations shown here are local prototype fixtures and are not persisted.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inboxCard: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 0,
  },
  chatRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 94,
    paddingVertical: spacing.lg,
  },
  chatBorder: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  chatPressed: {
    opacity: 0.58,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    height: 48,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 48,
  },
  avatarText: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '800',
  },
  chatCopy: {
    flex: 1,
  },
  nameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  name: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 11,
  },
  commute: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 28,
    marginLeft: spacing.sm,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  fixtureNote: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: spacing.sm,
    textAlign: 'center',
  },
});
