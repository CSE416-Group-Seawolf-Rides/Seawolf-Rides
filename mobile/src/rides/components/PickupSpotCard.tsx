import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../../theme';

interface PickupSpotCardProps {
  spot: string;
  time?: string;
  note: string;
}

// The exact meeting point. Only rendered once a request is accepted, so it never
// leaks to someone who hasn't been matched.
export function PickupSpotCard({ spot, time, note }: PickupSpotCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Ionicons color={colors.accent} name="location-outline" size={20} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>PICKUP SPOT{time ? ` · ${time}` : ''}</Text>
        <Text style={styles.spot}>{spot}</Text>
        <Text style={styles.note}>{note}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  label: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  spot: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
  },
  note: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
