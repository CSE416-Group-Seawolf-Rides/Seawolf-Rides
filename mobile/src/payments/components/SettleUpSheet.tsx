import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { ComponentProps, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../../components/AppButton';
import { colors, radii, spacing } from '../../theme';
import {
  displayHandle,
  methodLabels,
  PAYMENT_METHODS,
  paymentLink,
  type PaymentHandles,
  type PaymentMethod,
} from '../paymentHandles';
import { getPayeeHandles, recordSettlement } from '../paymentsClient';
import { formatCents } from '../pricing';
import { describeDates, type Balance } from '../tally';

const icons: Record<PaymentMethod, ComponentProps<typeof Ionicons>['name']> = {
  venmo: 'logo-venmo',
  paypal: 'logo-paypal',
  zelle: 'cash-outline',
};

// Partiful-style: the amount, who to pay, one row per app the driver accepts, and a quiet
// "I've already paid". The app never touches money; it opens Venmo/PayPal with the amount
// filled in, then records that the rider paid.
export function SettleUpSheet({ balance, onClose }: { balance: Balance; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [handles, setHandles] = useState<PaymentHandles | null>(null);
  const [opened, setOpened] = useState<PaymentMethod | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = balance.counterpartName;
  const dates = balance.due.map((ride) => ride.localDate);
  const note = `Seawolf Rides gas share · ${describeDates(dates)}`;

  useEffect(() => {
    let live = true;
    getPayeeHandles(balance.counterpartId)
      .then((value) => live && setHandles(value))
      .catch(() => live && setHandles({}));
    return () => {
      live = false;
    };
  }, [balance.counterpartId]);

  const methods = PAYMENT_METHODS.filter((method) => handles?.[method]);

  const open = async (method: PaymentMethod) => {
    const handle = handles?.[method];
    if (!handle) return;
    const link = paymentLink(method, handle, balance.dueCents, note);
    setError(null);
    if (link.copy) {
      await Clipboard.setStringAsync(link.copy);
      setCopied(true);
    } else if (link.url) {
      try {
        await Linking.openURL(link.url);
      } catch {
        setError(`Couldn’t open ${methodLabels[method]}. Pay ${name} there directly.`);
      }
    }
    Haptics.selectionAsync();
    setOpened(method);
  };

  const markPaid = async (method: PaymentMethod | 'other') => {
    setSaving(true);
    setError(null);
    try {
      await recordSettlement(
        balance.counterpartId,
        balance.due.map((ride) => ride.requestId),
        method,
        balance.dueCents,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Couldn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.grabber} />
          <Text style={styles.eyebrow}>Gas share for {name}</Text>
          <Text accessibilityRole="header" style={styles.amount}>
            {formatCents(balance.dueCents)}
          </Text>
          <Text style={styles.dates}>
            {balance.due.length} ride{balance.due.length === 1 ? '' : 's'} · {describeDates(dates)}
          </Text>

          {handles === null ? (
            <ActivityIndicator color={colors.accent} style={styles.loading} />
          ) : methods.length > 0 ? (
            <>
              <Text style={styles.label}>Pay {name} with</Text>
              <View style={styles.methods}>
                {methods.map((method) => (
                  <View key={method} style={styles.method}>
                    <Ionicons color={colors.text} name={icons[method]} size={26} />
                    <View style={styles.methodCopy}>
                      <Text style={styles.methodName}>{methodLabels[method]}</Text>
                      <Text numberOfLines={1} style={styles.handle}>
                        {displayHandle(method, handles[method]!)}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityLabel={
                        method === 'zelle'
                          ? `Copy ${name}’s Zelle contact`
                          : `Pay ${formatCents(balance.dueCents)} with ${methodLabels[method]}`
                      }
                      accessibilityRole="button"
                      onPress={() => void open(method)}
                      style={({ pressed }) => [styles.pay, pressed && styles.payPressed]}
                    >
                      <Text style={styles.payText}>
                        {method === 'zelle' ? (copied ? 'Copied' : 'Copy') : 'Pay'}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
              {copied && (
                <Text style={styles.hint}>
                  Paste it into Zelle in your banking app and send {formatCents(balance.dueCents)}.
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.hint}>
              {name} hasn’t added a payment app yet. Pay them however you usually do, then mark it
              paid here.
            </Text>
          )}

          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}

          {opened ? (
            <AppButton
              label={saving ? 'Saving…' : `I sent ${formatCents(balance.dueCents)} on ${methodLabels[opened]}`}
              disabled={saving}
              onPress={() => void markPaid(opened)}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            hitSlop={8}
            onPress={() => void markPaid('other')}
            style={styles.already}
          >
            <Text style={styles.alreadyText}>I’ve already paid {name}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(23, 33, 43, 0.4)', flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    height: 5,
    marginBottom: spacing.sm,
    width: 36,
  },
  eyebrow: { color: colors.textMuted, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  amount: {
    color: colors.text,
    fontSize: 40,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    marginTop: -spacing.sm,
    textAlign: 'center',
  },
  dates: { color: colors.textMuted, fontSize: 14, marginTop: -spacing.sm, textAlign: 'center' },
  loading: { paddingVertical: spacing.xl },
  label: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: spacing.sm },
  methods: { gap: spacing.sm },
  method: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  methodCopy: { flex: 1, gap: 2 },
  methodName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  handle: { color: colors.textMuted, fontSize: 14 },
  pay: {
    backgroundColor: colors.text,
    borderRadius: radii.pill,
    minWidth: 72,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  payPressed: { opacity: 0.75 },
  payText: { color: colors.surface, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  hint: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  error: { color: colors.error, fontSize: 14 },
  already: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  alreadyText: { color: colors.textMuted, fontSize: 15, fontWeight: '700' },
});
