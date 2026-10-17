import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Avatar } from '../components/Avatar';
import { resolvePublicProfile } from '../profiles/publicProfiles';
import { PrototypeChatMessage, PrototypeConversation } from '../prototypeData/types';
import { colors, radii, spacing } from '../theme';

interface ConversationScreenProps {
  conversation: PrototypeConversation;
  onBack: () => void;
  onOpenProfile: (participantId: string, displayName: string) => void;
}

export function ConversationScreen({ conversation, onBack, onOpenProfile }: ConversationScreenProps) {
  const [draft, setDraft] = useState('');
  const [localMessages, setLocalMessages] = useState<PrototypeChatMessage[]>([]);
  const messages = [...conversation.messages, ...localMessages];
  const profile = resolvePublicProfile(conversation.participantId, conversation.preview.participantName);

  function sendLocalMessage() {
    const text = draft.trim();
    if (!text) {
      return;
    }

    // Frontend-only prototype behavior: this message is never persisted.
    setLocalMessages((current) => [
      ...current,
      {
        id: `local-${current.length + 1}`,
        sender: 'me',
        text,
        timestamp: 'Now',
      },
    ]);
    setDraft('');
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={8}
      style={styles.container}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back to chats"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Pressable accessibilityLabel={`View ${conversation.preview.participantName}'s profile`} accessibilityRole="button" onPress={() => onOpenProfile(conversation.participantId, conversation.preview.participantName)} style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}>
          <Avatar name={profile.displayName} participantId={profile.participantId} sampleAvatar={profile.sampleAvatar} size={40} />
          <View style={styles.headerCopy}>
            <Text style={styles.name}>{conversation.preview.participantName}</Text>
            <Text style={styles.commute}>{conversation.preview.commuteLabel}</Text>
          </View>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.prototypeNotice}>
          <Text style={styles.prototypeText}>
            Prototype conversation · messages are stored only on this screen.
          </Text>
        </View>
        {messages.map((message) => {
          const mine = message.sender === 'me';
          return (
            <View
              key={message.id}
              style={[styles.messageRow, mine ? styles.mineRow : styles.theirRow]}
            >
              <View style={[styles.bubble, mine ? styles.mineBubble : styles.theirBubble]}>
                <Text style={[styles.messageText, mine && styles.mineText]}>{message.text}</Text>
                <Text style={[styles.messageTime, mine && styles.mineTime]}>
                  {message.timestamp}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Message"
          multiline
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={draft}
        />
        <Pressable
          accessibilityLabel="Send local prototype message"
          accessibilityRole="button"
          disabled={!draft.trim()}
          onPress={sendLocalMessage}
          style={({ pressed }) => [
            styles.sendButton,
            pressed && styles.pressed,
            !draft.trim() && styles.sendDisabled,
          ]}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 68,
    paddingHorizontal: spacing.lg,
  },
  backButton: {
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 60,
  },
  backText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.58,
  },
  headerCopy: {
    flex: 1,
  },
  profileButton: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', paddingRight: 60 },
  name: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  commute: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  messages: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  prototypeNotice: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  prototypeText: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  messageRow: {
    marginBottom: spacing.md,
  },
  mineRow: {
    alignItems: 'flex-end',
  },
  theirRow: {
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: radii.md,
    maxWidth: '82%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mineBubble: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    borderColor: colors.border,
    borderWidth: 1,
  },
  messageText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  mineText: {
    color: colors.surface,
  },
  messageTime: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: spacing.xs,
  },
  mineTime: {
    color: '#f2cccc',
    textAlign: 'right',
  },
  composer: {
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 15,
    maxHeight: 100,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 46,
    justifyContent: 'center',
    minWidth: 64,
  },
  sendDisabled: {
    opacity: 0.45,
  },
  sendText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '800',
  },
});
