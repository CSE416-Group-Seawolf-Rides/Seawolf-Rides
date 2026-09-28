import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../../theme';

interface SettingsGroupProps extends PropsWithChildren {
  title?: string;
}

// A titled white card of rows. Every secondary setting uses this one shape, so the
// page reads as a calm list under the commute card.
export function SettingsGroup({ title, children }: SettingsGroupProps) {
  return (
    <View style={styles.group}>
      {title && (
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      )}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

interface SettingsRowProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
  onPress?: () => void;
  // Planned but not built yet: shown so the layout is honest, but not tappable.
  soon?: boolean;
  accessory?: ReactNode;
  last?: boolean;
}

export function SettingsRow({
  icon,
  label,
  value,
  onPress,
  soon = false,
  accessory,
  last = false,
}: SettingsRowProps) {
  const interactive = Boolean(onPress) && !soon;

  return (
    <Pressable
      accessibilityLabel={`${label}${value ? `, ${value}` : ''}${soon ? ', coming soon' : ''}`}
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityState={{ disabled: soon }}
      disabled={!interactive}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}
    >
      <Ionicons color={soon ? colors.textMuted : colors.text} name={icon} size={20} />
      <Text style={[styles.label, soon && styles.muted]}>{label}</Text>
      {value && <Text style={styles.value}>{value}</Text>}
      {soon && (
        <View style={styles.soon}>
          <Text style={styles.soonText}>Soon</Text>
        </View>
      )}
      {accessory}
      {interactive && !accessory && (
        <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
      )}
    </Pressable>
  );
}

// Same card as the other groups, with centered text: clearly an action, not a setting.
export function SettingsAction({
  label,
  destructive = false,
  onPress,
}: {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, styles.action, pressed && styles.pressed]}
    >
      <Text style={[styles.actionText, destructive && styles.destructive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  title: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.xs,
    textTransform: 'uppercase',
  },
  card: {
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
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  divider: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  label: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  muted: {
    color: colors.textMuted,
  },
  value: {
    color: colors.textMuted,
    fontSize: 15,
  },
  soon: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  soonText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  actionText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  destructive: {
    color: colors.error,
  },
});
