import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Avatar } from '../components/Avatar';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { colors, radii, spacing } from '../theme';
import { unblockUser, useBlockedUsers } from './safetyClient';
import type { BlockedUser } from './safetyModel';

interface BlockedUsersScreenProps {
  currentUid: string;
  onBack: () => void;
}

export function BlockedUsersScreen({ currentUid, onBack }: BlockedUsersScreenProps) {
  const { blocked, loaded, error } = useBlockedUsers(currentUid);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const handleUnblock = async (item: BlockedUser) => {
    setUnblockingId(item.targetId);
    try {
      await unblockUser(currentUid, item.targetId);
    } catch {
      Alert.alert('Error', `Could not unblock ${item.targetName}. Please try again.`);
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <Screen eyebrow="SAFETY & PRIVACY" onBack={onBack} title="Blocked People">
      <Text style={styles.headerNotice}>
        Blocked people cannot see your profile, appear in your carpool matches, or message you.
      </Text>

      {!loaded && (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.statusText}>Loading blocked list…</Text>
        </View>
      )}

      {error && (
        <Card style={styles.errorCard}>
          <Ionicons color={colors.error} name="alert-circle-outline" size={24} />
          <Text accessibilityRole="alert" style={styles.errorText}>
            {error}
          </Text>
        </Card>
      )}

      {loaded && !error && blocked.length === 0 && (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons color={colors.accent} name="shield-checkmark-outline" size={36} />
          </View>
          <Text style={styles.emptyTitle}>No Blocked People</Text>
          <Text style={styles.emptyCopy}>
            You haven’t blocked any commuters. If someone behaves inappropriately, you can block or report them from their profile or chat.
          </Text>
        </Card>
      )}

      {loaded && !error && blocked.length > 0 && (
        <FlatList
          contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
          data={blocked}
          keyExtractor={(item) => item.targetId}
          renderItem={({ item }) => {
            const isPending = unblockingId === item.targetId;
            return (
              <Card style={styles.userRow}>
                <View style={styles.userInfo}>
                  <Avatar name={item.targetName} participantId={item.targetId} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.userName}>
                      {item.targetName}
                    </Text>
                    <Text style={styles.dateLabel}>
                      Blocked {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>

                <Pressable
                  accessibilityHint="Removes this user from your blocked list"
                  accessibilityLabel={`Unblock ${item.targetName}`}
                  accessibilityRole="button"
                  disabled={isPending}
                  onPress={() => handleUnblock(item)}
                  style={({ pressed }) => [
                    styles.unblockBtn,
                    pressed && !isPending && styles.unblockBtnPressed,
                    isPending && styles.unblockBtnDisabled,
                  ]}
                >
                  {isPending ? (
                    <ActivityIndicator color={colors.text} size="small" />
                  ) : (
                    <Text style={styles.unblockText}>Unblock</Text>
                  )}
                </Pressable>
              </Card>
            );
          }}
          scrollEnabled={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerNotice: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  centerContainer: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  errorCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(217, 72, 72, 0.08)',
    borderRadius: radii.pill,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  emptyCopy: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
    textAlign: 'center',
  },
  userRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  userInfo: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
  },
  userName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  dateLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  unblockBtn: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    minWidth: 78,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  unblockBtnPressed: {
    backgroundColor: colors.border,
  },
  unblockBtnDisabled: {
    opacity: 0.5,
  },
  unblockText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
});
