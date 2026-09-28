import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../../components/AppButton';
import { formatTime, lotTitle, Weekday, weekdays } from '../../commute/commuteModel';
import { colors, radii, spacing } from '../../theme';
import { DriverOffer } from '../rideModel';

interface RequestSheetProps {
  offer: DriverOffer;
  sharedDays: Weekday[];
  // Pre-selected days; defaults to every shared day.
  initialDays?: Weekday[];
  onSend: (days: Weekday[]) => void;
  onClose: () => void;
}

// A short confirmation, sized to its content: which of your shared days to request.
export function RequestSheet({
  offer,
  sharedDays,
  initialDays,
  onSend,
  onClose,
}: RequestSheetProps) {
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<Weekday[]>(initialDays ?? sharedDays);

  function toggle(day: Weekday) {
    Haptics.selectionAsync();
    setDays((current) =>
      current.includes(day) ? current.filter((selected) => selected !== day) : [...current, day],
    );
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.grabber} />
          <Text accessibilityRole="header" style={styles.title}>
            Ride with {offer.driverName}
          </Text>
          <Text style={styles.subtitle}>
            Pickup ~{formatTime(offer.pickupTime)} · Arrive {formatTime(offer.arriveBy)} at{' '}
            {lotTitle(offer.campusLot)}
          </Text>

          <Text style={styles.label}>Which days?</Text>
          <View style={styles.days}>
            {weekdays
              .filter((weekday) => sharedDays.includes(weekday.value))
              .map((weekday) => {
                const selected = days.includes(weekday.value);
                return (
                  <Pressable
                    accessibilityLabel={weekday.name}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    key={weekday.value}
                    onPress={() => toggle(weekday.value)}
                    style={[styles.day, selected && styles.daySelected]}
                  >
                    <Text style={[styles.dayText, selected && styles.dayTextSelected]}>
                      {weekday.short}
                    </Text>
                  </Pressable>
                );
              })}
          </View>

          <Text style={styles.privacy}>
            {offer.driverName} will see your first name, area, and schedule. The exact pickup spot is
            shared only after they accept.
          </Text>

          <AppButton
            disabled={days.length === 0}
            label={`Send request${days.length > 0 ? ` for ${days.length} day${days.length === 1 ? '' : 's'}` : ''}`}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onSend(days);
            }}
          />
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(23, 33, 43, 0.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
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
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
    marginTop: -spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  day: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  daySelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  dayText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  dayTextSelected: {
    color: colors.accentDark,
  },
  privacy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  cancel: {
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
});
