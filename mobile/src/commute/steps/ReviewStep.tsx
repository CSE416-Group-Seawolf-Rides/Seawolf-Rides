import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Card } from '../../components/Card';
import { FlowProgress, FlowStep } from '../../components/flow/FlowStep';
import type { CommuteRole } from '../../onboarding/onboardingModel';
import { colors, spacing } from '../../theme';
import {
  CommuteStepId,
  dayModeLabels,
  formatTime,
  describeLeg,
  isScheduleValid,
  hasMorningTimes,
  lotTitle,
  weekdays,
} from '../commuteModel';
import { useCommuteDraft } from '../CommuteDraftProvider';
import { PrivacyAreaMap } from '../components/PrivacyAreaMap';

interface ReviewStepProps {
  role: CommuteRole;
  progress?: FlowProgress;
  saveLabel: string;
  title?: string;
  subtitle?: string;
  leading?: 'back' | 'close';
  onLeadingPress?: () => void;
  onEdit: (step: CommuteStepId) => void;
  onSave: () => void;
}

export function ReviewStep({
  role,
  progress,
  saveLabel,
  title = 'Here’s your commute',
  subtitle = 'Check it over. You can change any of this later.',
  leading,
  onLeadingPress,
  onEdit,
  onSave,
}: ReviewStepProps) {
  const { draft, updateDraft } = useCommuteDraft();
  const complete = Boolean(
    draft.startArea && draft.campusLot && isScheduleValid(draft.days) && hasMorningTimes(draft.days),
  );

  return (
    <FlowStep
      canContinue={complete}
      continueLabel={saveLabel}
      leading={leading}
      onContinue={onSave}
      onLeadingPress={onLeadingPress}
      progress={progress}
      subtitle={subtitle}
      title={title}
    >
      <Section onEdit={() => onEdit('start')} title="Starting area">
        {draft.startArea && <PrivacyAreaMap area={draft.startArea} height={160} />}
      </Section>

      <View style={{ gap: spacing.sm }}>
        <Text>Use this saved week to find matches until I change it.</Text>
        <Switch
          accessibilityLabel="Allow commute matching"
          value={draft.discoveryEnabled ?? true}
          onValueChange={(discoveryEnabled) => updateDraft({ discoveryEnabled })}
        />
        <Text>
          Before acceptance, others see only your approximate area. Your private starting point is
          used for routing and shared with your ride partner after acceptance.
        </Text>
        {!draft.startPoint && (
          <Text>
            Reconfirm your starting point to enable road matching. Your existing approximate area is
            preserved.
          </Text>
        )}
      </View>

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
              {schedule.arriveBy !== null && (
                <Text style={styles.value}>
                  {schedule.mode === 'drive'
                    ? 'Leave at'
                    : schedule.mode === 'ride'
                      ? 'Ready for pickup from'
                      : 'Ready to head out at'}{' '}
                  {schedule.startAt != null
                    ? formatTime(schedule.startAt)
                    : '— add a morning start time'}
                </Text>
              )}
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
        <Pressable
          accessibilityLabel={`Edit ${title}`}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onEdit}
        >
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
