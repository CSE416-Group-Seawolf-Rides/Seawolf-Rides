import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '../auth/SessionProvider';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { ChoiceCard } from '../components/flow/ChoiceCard';
import { Screen } from '../components/Screen';
import { colors, radii, spacing } from '../theme';
import { formatWeekOf } from './fuelPrices';
import { saveFuelEfficiency, useFuelPrices, useOwnVehicleEfficiency } from './paymentsClient';
import {
  DEFAULT_EFFICIENCY,
  EFFICIENCY_LIMITS,
  fuelCostPerMile,
  WEAR_USD_PER_MILE,
  type FuelType,
  type VehicleEfficiency,
} from './pricing';

const fuelOptions: { value: FuelType; title: string }[] = [
  { value: 'gas', title: 'Gas' },
  { value: 'hybrid', title: 'Hybrid' },
  { value: 'electric', title: 'Electric' },
];

export function FuelEfficiencyScreen() {
  const { user } = useSession();
  const saved = useOwnVehicleEfficiency(user?.id);
  return saved.loaded ? <FuelForm initial={saved.value} /> : (
    <Screen onBack={() => router.back()} title="Fuel efficiency">
      <Text style={styles.muted}>Loading…</Text>
    </Screen>
  );
}

// Driversnote's pattern: the standard value by default, or your own. Riders' gas shares use
// this with the weekly New York fuel price.
function FuelForm({ initial }: { initial: VehicleEfficiency | null }) {
  const { user } = useSession();
  const prices = useFuelPrices(Boolean(user));
  const [fuelType, setFuelType] = useState<FuelType>(initial?.fuelType ?? 'gas');
  const [custom, setCustom] = useState<number | null>(initial?.efficiency ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limits = EFFICIENCY_LIMITS[fuelType];
  const value = custom ?? DEFAULT_EFFICIENCY[fuelType];
  const perMile = fuelCostPerMile({ fuelType, efficiency: value }, prices);
  const step = fuelType === 'electric' ? 0.1 : 1;

  const change = (delta: number) => {
    const next = Math.round(Math.min(limits.max, Math.max(limits.min, value + delta)) * 10) / 10;
    Haptics.selectionAsync();
    setCustom(next);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveFuelEfficiency(fuelType, custom);
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
      subtitle="Used to work out riders’ gas share. Changes apply to new requests, never to rides already agreed."
      title="Fuel efficiency"
    >
      <Text style={styles.label}>Your car runs on</Text>
      <View style={styles.chips}>
        {fuelOptions.map((option) => {
          const selected = option.value === fuelType;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              key={option.value}
              onPress={() => {
                Haptics.selectionAsync();
                setFuelType(option.value);
                setCustom(null);
              }}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.title}</Text>
            </Pressable>
          );
        })}
      </View>

      <ChoiceCard
        description={`${DEFAULT_EFFICIENCY[fuelType]} ${limits.unit}, a typical ${fuelType === 'gas' ? 'gas car' : fuelType === 'hybrid' ? 'hybrid' : 'EV'}`}
        onPress={() => setCustom(null)}
        selected={custom === null}
        title="Use the typical value"
      />
      <ChoiceCard
        description={`Enter what your car actually gets`}
        onPress={() => setCustom(value)}
        selected={custom !== null}
        title={`My car’s ${limits.unit}`}
      />

      {custom !== null && (
        <View
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          accessibilityLabel={`Fuel efficiency, ${value} ${limits.unit}`}
          accessibilityRole="adjustable"
          onAccessibilityAction={(event) => change(event.nativeEvent.actionName === 'increment' ? step : -step)}
          style={styles.stepper}
        >
          <StepButton disabled={value <= limits.min} icon="remove" onPress={() => change(-step)} />
          <View style={styles.valueWrap}>
            <Text style={styles.value}>{fuelType === 'electric' ? value.toFixed(1) : value}</Text>
            <Text style={styles.unit}>{limits.unit}</Text>
          </View>
          <StepButton disabled={value >= limits.max} icon="add" onPress={() => change(step)} />
        </View>
      )}

      <Card style={styles.preview}>
        <Text style={styles.previewValue}>${perMile.toFixed(2)} per mile in {fuelType === 'electric' ? 'electricity' : 'gas'}</Text>
        <Text style={styles.muted}>
          {fuelType === 'electric'
            ? `NY home electricity, $${prices.electricityUsdPerKwh.toFixed(3)}/kWh`
            : `NY average regular gas, $${prices.gasUsdPerGallon.toFixed(2)}/gal · week of ${formatWeekOf(prices.gasWeekOf)}`}
          . Updated weekly. Riders’ cost share also adds ${WEAR_USD_PER_MILE.toFixed(2)}/mi for car wear and a $1 pickup fee.
        </Text>
      </Card>

      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <AppButton disabled={saving} label={saving ? 'Saving…' : 'Save'} onPress={() => void save()} />
    </Screen>
  );
}

function StepButton({ icon, disabled, onPress }: { icon: 'add' | 'remove'; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityElementsHidden
      disabled={disabled}
      importantForAccessibility="no"
      onPress={onPress}
      style={({ pressed }) => [styles.stepButton, disabled && styles.stepDisabled, pressed && styles.pressed]}
    >
      <Ionicons color={disabled ? colors.textMuted : colors.accent} name={icon} size={26} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.text, fontSize: 15, fontWeight: '800' },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  chipTextSelected: { color: colors.surface },
  stepper: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  stepButton: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  stepDisabled: { backgroundColor: colors.surfaceMuted },
  pressed: { opacity: 0.6 },
  valueWrap: { alignItems: 'center' },
  value: { color: colors.text, fontSize: 44, fontVariant: ['tabular-nums'], fontWeight: '800' },
  unit: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  preview: { gap: spacing.xs },
  previewValue: { color: colors.success, fontSize: 20, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  error: { color: colors.error, fontSize: 14 },
});
