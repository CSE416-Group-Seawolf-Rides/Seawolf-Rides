import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../../theme';
import { formatWeekOf } from '../fuelPrices';
import { adjustmentLabel, formatCents, type RidePrice } from '../pricing';

// The gas share, shown where people decide. Riders see what they'll chip in; drivers see what
// the rider chips in, never "earnings".
export function PriceTag({ price, youDrive }: { price?: RidePrice; youDrive: boolean }) {
  if (!price) return null;
  const amount = formatCents(price.cents);
  return (
    <View
      accessibilityLabel={
        price.cents === 0
          ? 'Free ride'
          : youDrive
            ? `Rider chips in ${amount} for gas`
            : `${amount} gas share per ride`
      }
      accessible
      style={styles.tag}
    >
      <Text style={styles.amount}>{amount}</Text>
      {price.cents > 0 && <Text style={styles.unit}>{youDrive ? 'chips in' : '/ ride'}</Text>}
      {!!price.adjustment && price.cents > 0 && (
        <Text style={styles.unit}>{adjustmentLabel(price.adjustment)} by driver</Text>
      )}
    </View>
  );
}

// One line in details explaining where the number comes from.
export function PriceBreakdown({ price }: { price?: RidePrice }) {
  if (!price) return null;
  const fuel = price.fuelType === 'electric' ? 'electricity' : 'gas';
  return (
    <Text style={styles.breakdown}>
      Cost share {formatCents(price.cents)}
      {price.adjustment ? ` (${adjustmentLabel(price.adjustment)} of suggested ${formatCents(price.suggestedCents ?? price.cents)})` : ''}
      {' · '}
      {price.baseCents ? `${formatCents(price.baseCents)} pickup + ` : ''}half of ${price.costPerMile.toFixed(2)}/mi
      {price.baseCents ? ` (${fuel} + car wear)` : ` ${fuel}`} for {price.riderMiles} mi together
      {price.extraMiles > 0 ? ` + ${price.extraMiles} mi pickup detour` : ''}
      {price.baseCents ? ' · $3.00 minimum' : ''} · NY {fuel} prices, week of {formatWeekOf(price.gasWeekOf)}
    </Text>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignItems: 'flex-end',
    backgroundColor: colors.successSoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  amount: {
    color: colors.success,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  unit: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '700',
  },
  breakdown: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
