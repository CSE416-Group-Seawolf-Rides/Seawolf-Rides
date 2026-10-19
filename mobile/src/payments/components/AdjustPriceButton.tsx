import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing } from '../../theme';
import { usePriceAdjustment } from '../paymentsClient';
import { adjustmentLabel, type RidePrice } from '../pricing';
import { PriceAdjustSheet } from './PriceAdjustSheet';

// "Price · Suggested ›" for a driver, opening the adjust sheet for one rider.
export function AdjustPriceButton({
  driverId,
  riderId,
  riderName,
  reference,
}: {
  driverId: string;
  riderId: string;
  riderName: string;
  reference?: RidePrice;
}) {
  const adjustment = usePriceAdjustment(driverId, riderId);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityLabel={`Adjust ${riderName}’s gas share, currently ${adjustmentLabel(adjustment.value)}`}
        accessibilityRole="button"
        disabled={!adjustment.loaded}
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.label}>Price · {adjustmentLabel(adjustment.value)}</Text>
        <Ionicons color={colors.accent} name="chevron-forward" size={14} />
      </Pressable>
      {open && (
        <PriceAdjustSheet
          current={adjustment.value}
          onClose={() => setOpen(false)}
          reference={reference}
          riderId={riderId}
          riderName={riderName}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 2, paddingVertical: spacing.xs },
  pressed: { opacity: 0.6 },
  label: { color: colors.accent, fontSize: 13, fontWeight: '800' },
});
