import { useRef, useState, type ReactNode } from 'react';
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

import { AppButton } from '../components/AppButton';
import { Avatar } from '../components/Avatar';
import { resolvePublicProfile } from '../profiles/publicProfiles';
import { PrototypeChatMessage, PrototypeConversation } from '../prototypeData/types';
import { colors, radii, spacing } from '../theme';

interface ConversationScreenProps {
  conversation: PrototypeConversation;
  contextCard?: ReactNode;
  onBack: () => void;
  onOpenProfile: (participantId: string, displayName: string) => void;
  onSendMessage?: (text: string) => Promise<void>;
  loading?: boolean;
  error?: string;
  hasEarlier?: boolean;
  onLoadEarlier?: () => void;
}

export function ConversationScreen({ conversation, onBack, onOpenProfile, onSendMessage, loading, error, hasEarlier, onLoadEarlier, contextCard }: ConversationScreenProps) {
  const scroll = useRef<ScrollView>(null);
  const followLatest = useRef(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const locked = useRef(false);
  const [sendError, setSendError] = useState('');
  const [localMessages, setLocalMessages] = useState<PrototypeChatMessage[]>([]);
  const messages = [...conversation.messages, ...localMessages];
  const profile = onSendMessage
    ? { displayName: conversation.preview.participantName, participantId: conversation.participantId, sampleAvatar: undefined }
    : resolvePublicProfile(conversation.participantId, conversation.preview.participantName);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || locked.current) {
      return;
    }

    if (onSendMessage) {
      followLatest.current = true;
      locked.current = true;
      setSending(true);
      setSendError('');
      try { await onSendMessage(text); setDraft(''); }
      catch (failure) { setSendError(failure instanceof Error ? failure.message : 'Could not send. Retry your message.'); }
      finally { locked.current = false; setSending(false); }
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
        <Pressable disabled={loading || !!error} accessibilityLabel={`View ${conversation.preview.participantName}'s profile`} accessibilityRole="button" onPress={() => onOpenProfile(conversation.participantId, conversation.preview.participantName)} style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}>
          <Avatar name={profile.displayName} participantId={profile.participantId} sampleAvatar={profile.sampleAvatar} size={40} />
          <View style={styles.headerCopy}>
            <Text style={styles.name}>{conversation.preview.participantName}</Text>
            <Text style={styles.commute}>{conversation.preview.commuteLabel}</Text>
          </View>
        </Pressable>
      </View>

      <ScrollView
        ref={scroll}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        scrollEventThrottle={100}
        onScroll={({ nativeEvent }) => {
          followLatest.current = nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height >= nativeEvent.contentSize.height - 80;
        }}
        onContentSizeChange={() => { if (followLatest.current) scroll.current?.scrollToEnd({ animated: false }); }}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading && <Text>Loading conversation…</Text>}
        {error && <Text accessibilityRole="alert">{error}</Text>}
        {!loading && !error && contextCard}
        {onSendMessage && !loading && !error && messages.length === 0 && <Text style={styles.emptyPrompt}>Start the conversation!</Text>}
        {hasEarlier && <AppButton label="Load earlier messages" variant="secondary" onPress={() => { followLatest.current = false; onLoadEarlier?.(); }} />}
        {!onSendMessage && <View style={styles.prototypeNotice}>
          <Text style={styles.prototypeText}>
            Prototype conversation · messages are stored only on this screen.
          </Text>
        </View>}
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

      {sendError ? <Text accessibilityRole="alert" style={{ color: colors.accent, padding: spacing.md }}>{sendError}</Text> : null}
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Message"
          multiline
          maxLength={2000}
          editable={!sending && !loading && !error}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={draft}
        />
        <Pressable
          accessibilityLabel={onSendMessage ? "Send message" : "Send local prototype message"}
          accessibilityRole="button"
          disabled={!draft.trim() || sending || loading || !!error}
          onPress={() => void sendMessage()}
          style={({ pressed }) => [
            styles.sendButton,
            pressed && styles.pressed,
            !draft.trim() && styles.sendDisabled,
          ]}
        >
          <Text style={styles.sendText}>{sending ? "Sending…" : "Send"}</Text>
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
  emptyPrompt: { color: colors.textMuted, opacity: 0.65, fontStyle: 'italic', textAlign: 'center', marginVertical: spacing.xl },
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
