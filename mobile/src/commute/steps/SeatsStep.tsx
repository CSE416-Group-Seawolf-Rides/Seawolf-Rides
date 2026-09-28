import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FlowProgress, FlowStep } from '../../components/flow/FlowStep';
import { colors, radii, spacing } from '../../theme';
import { MAX_SEATS, MIN_SEATS } from '../commuteModel';
import { useCommuteDraft } from '../CommuteDraftProvider';

interface SeatsStepProps {
  progress?: FlowProgress;
  continueLabel?: string;
  onContinue: () => void;
}

export function SeatsStep({ progress, onContinue, continueLabel }: SeatsStepProps) {
  const { draft, updateDraft } = useCommuteDraft();
  const seats = draft.seats;

  function change(delta: number) {
    const next = Math.min(MAX_SEATS, Math.max(MIN_SEATS, seats + delta));
    if (next !== seats) {
      Haptics.selectionAsync();
      updateDraft({ seats: next });
    }
  }

  return (
    <FlowStep
      continueLabel={continueLabel}
      canContinue
      onContinue={onContinue}
      progress={progress}
      reaction="You’ll see every ride request and decide yourself — no detour limit to set."
      subtitle="Not counting yours. You can change it for any ride."
      title="How many seats can you offer?"
    >
      <View
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        accessibilityLabel="Seats to offer"
        accessibilityRole="adjustable"
        accessibilityValue={{ now: seats, min: MIN_SEATS, max: MAX_SEATS }}
        onAccessibilityAction={(event) => change(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
        style={styles.stepper}
      >
        <StepButton disabled={seats <= MIN_SEATS} icon="remove" onPress={() => change(-1)} />
        <View style={styles.valueWrap}>
          <Text style={styles.value}>{seats}</Text>
          <Text style={styles.unit}>seat{seats === 1 ? '' : 's'}</Text>
        </View>
        <StepButton disabled={seats >= MAX_SEATS} icon="add" onPress={() => change(1)} />
      </View>
    </FlowStep>
  );
}

function StepButton({
  icon,
  disabled,
  onPress,
}: {
  icon: 'add' | 'remove';
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityElementsHidden
      disabled={disabled}
      importantForAccessibility="no"
      onPress={onPress}
      style={({ pressed }) => [styles.button, disabled && styles.buttonDisabled, pressed && styles.pressed]}
    >
      <Ionicons color={disabled ? colors.textMuted : colors.accent} name={icon} size={28} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  button: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  buttonDisabled: {
    backgroundColor: colors.surfaceMuted,
  },
  pressed: {
    opacity: 0.6,
  },
  valueWrap: {
    alignItems: 'center',
  },
  value: {
    color: colors.text,
    fontSize: 56,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    lineHeight: 62,
  },
  unit: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
});
