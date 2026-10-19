import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '../../components/Avatar';
import { colors, radii, spacing } from '../../theme';
import { methodLabels } from '../paymentHandles';
import { confirmSettlement } from '../paymentsClient';
import { formatCents } from '../pricing';
import { describeDates, type Balance } from '../tally';
import { SettleUpSheet } from './SettleUpSheet';
import { AdjustPriceButton } from './AdjustPriceButton';

// One running balance per person (Splitwise's model), only when there's something to settle.
// Riders get "Settle up"; drivers confirm payments they've received.
export function GasShares({
  uid,
  balances,
  coveredCents,
}: {
  uid: string;
  balances: Balance[];
  coveredCents: number;
}) {
  const [settling, setSettling] = useState<Balance | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!balances.length && coveredCents === 0) return null;

  const confirm = async (settlementId: string) => {
    setConfirming(settlementId);
    setError(null);
    try {
      await confirmSettlement(settlementId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Couldn’t confirm. Try again.');
    } finally {
      setConfirming(null);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.heading}>
          Gas shares
        </Text>
        {coveredCents > 0 && (
          <Text style={styles.covered}>{formatCents(coveredCents)} covered this month</Text>
        )}
      </View>
      {balances.length > 0 && (
        <View style={styles.group}>
          {balances.map((balance, index) => {
            const owe = balance.direction === 'owe';
            const name = balance.counterpartName;
            const pendingConfirm = balance.awaitingConfirmation[0];
            const later =
              balance.upcomingCents > 0 ? `${formatCents(balance.upcomingCents)} more later this week` : '';
            let title: string;
            let detail: string;
            if (balance.dueCents > 0) {
              title = owe ? `You owe ${name}` : `${name}’s gas share`;
              detail = [describeDates(balance.due.map((ride) => ride.localDate)), later]
                .filter(Boolean)
                .join(' · ');
            } else if (pendingConfirm) {
              title = owe ? `Sent to ${name}` : `${name} sent ${formatCents(pendingConfirm.cents)}`;
              detail = owe
                ? `Waiting for ${name} to confirm`
                : `Marked paid${pendingConfirm.method === 'other' ? '' : ` on ${methodLabels[pendingConfirm.method]}`}`;
            } else {
              title = owe ? `${name} this week` : `${name} this week`;
              detail = later || 'All settled';
            }
            return (
              <View
                key={balance.counterpartId}
                style={[styles.row, index < balances.length - 1 && styles.divider]}
              >
                <Avatar name={name} size={40} />
                <View style={styles.copy}>
                  <Text style={styles.title}>{title}</Text>
                  <Text numberOfLines={2} style={styles.detail}>
                    {detail}
                  </Text>
                  {!owe && (
                    <AdjustPriceButton
                      driverId={uid}
                      reference={balance.latestPrice}
                      riderId={balance.counterpartId}
                      riderName={name}
                    />
                  )}
                </View>
                {balance.dueCents > 0 && (
                  <Text style={[styles.amount, owe && styles.amountOwe]}>
                    {formatCents(balance.dueCents)}
                  </Text>
                )}
                {owe && balance.dueCents > 0 && (
                  <Pressable
                    accessibilityLabel={`Settle up ${formatCents(balance.dueCents)} with ${name}`}
                    accessibilityRole="button"
                    onPress={() => setSettling(balance)}
                    style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                  >
                    <Text style={styles.actionText}>Settle up</Text>
                  </Pressable>
                )}
                {!owe && pendingConfirm && balance.dueCents === 0 && (
                  <Pressable
                    accessibilityLabel={`Confirm you received ${formatCents(pendingConfirm.cents)} from ${name}`}
                    accessibilityRole="button"
                    disabled={confirming !== null}
                    onPress={() => void confirm(pendingConfirm.id)}
                    style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                  >
                    <Text style={styles.actionText}>
                      {confirming === pendingConfirm.id ? 'Saving…' : 'Got it'}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {settling && <SettleUpSheet balance={settling} onClose={() => setSettling(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  header: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
  heading: { color: colors.text, fontSize: 20, fontWeight: '800' },
  covered: { color: colors.success, fontSize: 13, fontWeight: '700' },
  group: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  divider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  copy: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  detail: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  amount: {
    color: colors.success,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  amountOwe: { color: colors.text },
  action: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pressed: { opacity: 0.8 },
  actionText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
  error: { color: colors.error, fontSize: 14 },
});
