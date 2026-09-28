import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Screen } from '../components/Screen';
import { IncomingRequestCard } from '../rides/components/IncomingRequestCard';
import { IncomingRequestView } from '../rides/rideModel';
import { colors, spacing } from '../theme';

interface ReviewRequestsScreenProps {
  pending: IncomingRequestView[];
  onRespond: (requestId: string, status: 'accepted' | 'declined') => void;
  onDone: () => void;
}

// One request at a time with its full context, so each yes/no gets real attention
// and there's never a pile of cards to scroll through.
export function ReviewRequestsScreen({ pending, onRespond, onDone }: ReviewRequestsScreenProps) {
  const [deferred, setDeferred] = useState<string[]>([]);
  const [total] = useState(pending.length);
  const queue = [
    ...pending.filter((view) => !deferred.includes(view.request.id)),
    ...pending.filter((view) => deferred.includes(view.request.id)),
  ];
  const current = queue[0];
  const position = total - pending.length + 1;

  if (!current) {
    return (
      <Screen onBack={onDone} title="Ride requests">
        <View style={styles.done}>
          <Ionicons color={colors.success} name="checkmark-circle" size={56} />
          <Text style={styles.doneTitle}>You’re all caught up</Text>
          <Text style={styles.doneBody}>New requests will show up on Home.</Text>
        </View>
        <AppButton label="Back to Home" onPress={onDone} />
      </Screen>
    );
  }

  return (
    <Screen
      eyebrow={`${Math.min(position, total)} OF ${total}`}
      onBack={onDone}
      subtitle="Each one shows how much time it adds to your drive. You decide."
      title="Ride requests"
    >
      <IncomingRequestCard
        conflictDay={current.conflictDay}
        fullDay={current.fullDay}
        key={current.request.id}
        onAccept={() => onRespond(current.request.id, 'accepted')}
        onDecline={() => onRespond(current.request.id, 'declined')}
        request={current.request}
        sharedDays={current.sharedDays}
      />
      {queue.length > 1 && (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() =>
            setDeferred((ids) => [...ids.filter((id) => id !== current.request.id), current.request.id])
          }
          style={styles.later}
        >
          <Text style={styles.laterText}>Decide later</Text>
        </Pressable>
      )}
      <Text style={styles.remaining}>
        {queue.length - 1 === 0 ? 'Last one' : `${queue.length - 1} more after this`}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  done: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  doneTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  doneBody: {
    color: colors.textMuted,
    fontSize: 15,
  },
  later: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  laterText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
  remaining: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
});
