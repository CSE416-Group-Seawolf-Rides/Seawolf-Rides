import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '../../components/Card';
import { FlowProgress, FlowStep } from '../../components/flow/FlowStep';
import type { CommuteRole } from '../../onboarding/onboardingModel';
import { colors, spacing } from '../../theme';
import {
  CommuteStepId,
  dayModeLabels,
  describeLeg,
  isScheduleValid,
  lotTitle,
  weekdays,
} from '../commuteModel';
import { useCommuteDraft } from '../CommuteDraftProvider';
import { PrivacyAreaMap } from '../components/PrivacyAreaMap';

interface ReviewStepProps {
  role: CommuteRole;
  progress: FlowProgress;
  saveLabel: string;
  onEdit: (step: CommuteStepId) => void;
  onSave: () => void;
}

export function ReviewStep({ role, progress, saveLabel, onEdit, onSave }: ReviewStepProps) {
  const { draft } = useCommuteDraft();
  const complete = Boolean(draft.startArea && draft.campusLot && isScheduleValid(draft.days));

  return (
    <FlowStep
      canContinue={complete}
      continueLabel={saveLabel}
      onContinue={onSave}
      progress={progress}
      subtitle="Check it over. You can change any of this later."
      title="Here’s your commute"
    >
      <Section onEdit={() => onEdit('start')} title="Starting area">
        {draft.startArea && <PrivacyAreaMap area={draft.startArea} height={160} />}
      </Section>

      <Section onEdit={() => onEdit('campus')} title="On campus">
        <Text style={styles.value}>{draft.campusLot ? lotTitle(draft.campusLot) : '—'}</Text>
      </Section>

      <Section onEdit={() => onEdit('schedule')} title="Your week">
        {draft.days.map((schedule) => (
          <View key={schedule.day} style={styles.dayRow}>
            <Text style={styles.day}>
              {weekdays.find((weekday) => weekday.value === schedule.day)?.short}
            </Text>
            <View style={styles.dayDetail}>
              <Text style={styles.value}>{describeLeg(schedule.arriveBy, 'arriveBy')}</Text>
              <Text style={styles.value}>{describeLeg(schedule.leaveAt, 'leaveAt')}</Text>
              {role === 'both' && <Text style={styles.meta}>{dayModeLabels[schedule.mode]}</Text>}
            </View>
          </View>
        ))}
      </Section>

      {role !== 'rider' && (
        <Section onEdit={() => onEdit('seats')} title="Seats to offer">
          <Text style={styles.value}>{draft.seats}</Text>
        </Section>
      )}
    </FlowStep>
  );
}

function Section({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable accessibilityLabel={`Edit ${title}`} accessibilityRole="button" hitSlop={10} onPress={onEdit}>
          <Text style={styles.edit}>Edit</Text>
        </Pressable>
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  edit: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  value: {
    color: colors.text,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  dayRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  day: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '800',
    width: 36,
  },
  dayDetail: {
    flex: 1,
    gap: 2,
  },
});
