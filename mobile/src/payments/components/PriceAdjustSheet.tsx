import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../../components/AppButton';
import { colors, radii, spacing } from '../../theme';
import { setPriceAdjustment } from '../paymentsClient';
import {
  adjustmentLabel,
  applyAdjustment,
  formatCents,
  PRICE_ADJUSTMENTS,
  type PriceAdjustment,
  type RidePrice,
} from '../pricing';

// Tip-style preset chips (Uber/DoorDash checkout): the suggestion is the default, lowering
// or waiving is easy, raising tops out at +25% so it stays "splitting gas".
export function PriceAdjustSheet({
  riderId,
  riderName,
  current,
  reference,
  onSaved,
  onClose,
}: {
  riderId: string;
  riderName: string;
  current: PriceAdjustment;
  // A recent price for this rider, to preview what each option means in dollars.
  reference?: RidePrice;
  onSaved: (adjustment: PriceAdjustment, lowered: number) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [choice, setChoice] = useState<PriceAdjustment>(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = reference ? applyAdjustment(reference, choice === 0 ? undefined : choice) : undefined;
  const raising = choice > current;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await setPriceAdjustment(riderId, choice);
      onSaved(result.adjustment, result.lowered);
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
          <Text accessibilityRole="header" style={styles.title}>
            {riderName}’s gas share
          </Text>
          {preview && (
            <View style={styles.preview}>
              <Text style={styles.amount}>{formatCents(preview.cents)}</Text>
              <Text style={styles.per}>
                {preview.cents === 0
                  ? `You cover the gas for ${riderName}`
                  : `per new request · suggested ${formatCents(preview.suggestedCents ?? preview.cents)}`}
              </Text>
            </View>
          )}

          <View accessibilityRole="radiogroup" style={styles.chips}>
            {PRICE_ADJUSTMENTS.map((option) => {
              const selected = option === choice;
              return (
                <Pressable
                  accessibilityLabel={option === 0 ? 'Suggested price' : adjustmentLabel(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  key={option}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setChoice(option);
                  }}
                  style={[
                    styles.chip,
                    option === 0 && styles.chipSuggested,
                    selected && styles.chipSelected,
                  ]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {adjustmentLabel(option)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.rule}>New requests use this preference. To change an agreed ride, send a price-change request from its trip details.</Text>

          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          <AppButton
            disabled={saving || choice === current}
            label={saving ? 'Saving…' : raising ? 'Save for new requests' : 'Save price preference'}
            onPress={() => void save()}
          />
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Never mind</Text>
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
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  preview: { alignItems: 'center', gap: 2, paddingVertical: spacing.sm },
  amount: { color: colors.success, fontSize: 40, fontVariant: ['tabular-nums'], fontWeight: '800' },
  per: { color: colors.textMuted, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 76,
    paddingHorizontal: spacing.md,
  },
  chipSuggested: { borderColor: colors.text },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  chipTextSelected: { color: colors.surface },
  rule: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  error: { color: colors.error, fontSize: 14 },
  cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  cancelText: { color: colors.textMuted, fontSize: 15, fontWeight: '700' },
});
