import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ComponentProps, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '../auth/SessionProvider';
import { AppButton } from '../components/AppButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { colors, spacing } from '../theme';
import {
  methodHints,
  methodLabels,
  normalizeHandle,
  PAYMENT_METHODS,
  type PaymentHandles,
  type PaymentMethod,
} from './paymentHandles';
import { savePaymentHandles, useOwnPaymentHandles } from './paymentsClient';

const icons: Record<PaymentMethod, ComponentProps<typeof Ionicons>['name']> = {
  venmo: 'logo-venmo',
  paypal: 'logo-paypal',
  zelle: 'cash-outline',
};

export function PaymentMethodsScreen() {
  const { user } = useSession();
  const saved = useOwnPaymentHandles(user?.id);
  // Remounts once loaded so the fields start from what's saved.
  return saved.loaded ? <PaymentMethodsForm initial={saved.value} /> : (
    <Screen onBack={() => router.back()} title="How riders pay you">
      <Text style={styles.muted}>Loading…</Text>
    </Screen>
  );
}

function PaymentMethodsForm({ initial }: { initial: PaymentHandles }) {
  const [draft, setDraft] = useState<Record<PaymentMethod, string>>({
    venmo: initial.venmo ? `@${initial.venmo}` : '',
    paypal: initial.paypal ?? '',
    zelle: initial.zelle ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checks = Object.fromEntries(
    PAYMENT_METHODS.map((method) => [method, normalizeHandle(method, draft[method])]),
  ) as Record<PaymentMethod, ReturnType<typeof normalizeHandle>>;
  const invalid = PAYMENT_METHODS.some((method) => checks[method].error);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await savePaymentHandles(
        Object.fromEntries(
          PAYMENT_METHODS.flatMap((method) =>
            checks[method].value ? [[method, checks[method].value]] : [],
          ),
        ),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Couldn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      onBack={() => router.back()}
      subtitle="Riders tap Pay and their app opens with the amount filled in. They only see these after riding with you."
      title="How riders pay you"
    >
      {PAYMENT_METHODS.map((method) => (
        <View key={method} style={styles.method}>
          <View style={styles.methodHeader}>
            <Ionicons color={colors.text} name={icons[method]} size={22} />
            <Text style={styles.methodName}>{methodLabels[method]}</Text>
          </View>
          <TextField
            autoCapitalize="none"
            autoCorrect={false}
            error={draft[method] ? checks[method].error : undefined}
            helperText={methodHints[method]}
            keyboardType={method === 'zelle' ? 'email-address' : 'default'}
            label={`${methodLabels[method]} (optional)`}
            onChangeText={(value) => setDraft((current) => ({ ...current, [method]: value }))}
            value={draft[method]}
          />
        </View>
      ))}
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <AppButton disabled={saving || invalid} label={saving ? 'Saving…' : 'Save'} onPress={() => void save()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  method: { gap: spacing.sm },
  methodHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  methodName: { color: colors.text, fontSize: 17, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 15 },
  error: { color: colors.error, fontSize: 14 },
});
