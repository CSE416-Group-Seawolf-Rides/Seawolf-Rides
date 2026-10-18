import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Card } from '../../components/Card';
import { FlowProgress, FlowStep } from '../../components/flow/FlowStep';
import type { CommuteRole } from '../../onboarding/onboardingModel';
import { colors, spacing } from '../../theme';
import {
  countTrips,
  DaySchedule,
  DEFAULT_ARRIVE_BY,
  DEFAULT_START_AT,
  setStartTime,
  hasMorningTimes,
  DEFAULT_LEAVE_AT,
  getDayError,
  hasSameTimes,
  isScheduleValid,
  setDayMode,
  setLegTime,
  toggleDay,
  TripLeg,
  Weekday,
  weekdays,
} from '../commuteModel';
import { useCommuteDraft } from '../CommuteDraftProvider';
import { DayCircles } from '../components/DayCircles';
import { ModeSelector } from '../components/ModeSelector';
import { TimeField } from '../components/TimeField';

interface ScheduleStepProps {
  role: CommuteRole;
  progress?: FlowProgress;
  continueLabel?: string;
  onContinue: () => void;
}

interface OpenField {
  target: Weekday | 'all';
  leg: TripLeg | 'startAt';
}

const legCopy: Record<TripLeg, { label: string; none: string; add: string; default: number }> = {
  arriveBy: {
    label: 'Arrive on campus by',
    none: 'I don’t need a ride there',
    add: 'I need a ride there',
    default: DEFAULT_ARRIVE_BY,
  },
  leaveAt: {
    label: 'Leave campus at',
    none: 'I don’t need a ride back',
    add: 'I need a ride back',
    default: DEFAULT_LEAVE_AT,
  },
};

const weekdaySet: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

function dayName(day: Weekday): string {
  return weekdays.find((weekday) => weekday.value === day)?.name ?? day;
}

export function ScheduleStep({ role, progress, onContinue, continueLabel }: ScheduleStepProps) {
  const { draft, updateDraft } = useCommuteDraft();
  const days = draft.days;
  const [byDay, setByDay] = useState(() => days.length > 0 && !hasSameTimes(days));
  const [openField, setOpenField] = useState<OpenField | null>(null);

  const setDays = (next: DaySchedule[]) => updateDraft({ days: next });
  const first = days[0];
  const trips = countTrips(days);

  // One wheel open at a time, like the Calendar app; tapping the open row closes it.
  function toggleField(field: OpenField) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenField((current) =>
      current?.target === field.target && current.leg === field.leg ? null : field,
    );
  }

  function renderField(target: Weekday | 'all', leg: TripLeg, minutes: number | null) {
    return (
      <TimeField
        addLabel={legCopy[leg].add}
        defaultMinutes={legCopy[leg].default}
        expanded={openField?.target === target && openField.leg === leg}
        label={legCopy[leg].label}
        minutes={minutes}
        noneLabel={legCopy[leg].none}
        onChange={(value) => setDays(setLegTime(days, target, leg, value))}
        onToggle={() => toggleField({ target, leg })}
      />
    );
  }

  function renderStart(target: Weekday | 'all', schedule: DaySchedule) {
    if (schedule.arriveBy === null) return null;
    const mode =
      target === 'all'
        ? role === 'both'
          ? 'either'
          : role === 'driver'
            ? 'drive'
            : 'ride'
        : schedule.mode;
    return (
      <>
        <TimeField
          label={
            mode === 'drive'
              ? 'Leave your starting point at'
              : mode === 'ride'
                ? 'Ready for pickup from'
                : 'Ready to head out at'
          }
          emptyLabel="Choose time"
          minutes={schedule.startAt ?? null}
          defaultMinutes={DEFAULT_START_AT}
          expanded={openField?.target === target && openField.leg === 'startAt'}
          noneLabel="Clear start time"
          addLabel="Choose a start time"
          onToggle={() => toggleField({ target, leg: 'startAt' })}
          onChange={(minutes) => setDays(setStartTime(days, target, minutes))}
        />
        <View style={styles.divider} />
      </>
    );
  }

  function toggleByDay(value: boolean) {
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenField(null);
    setByDay(value);
    // Switching back to "same every day" adopts the first day's times everywhere.
    if (!value && first) {
      setDays(
        days.map((schedule) => ({
          ...schedule,
          startAt: first.startAt ?? null,
          arriveBy: first.arriveBy,
          leaveAt: first.leaveAt,
        })),
      );
    }
  }

  function selectWeekdays() {
    Haptics.selectionAsync();
    let next = days.filter((schedule) => weekdaySet.includes(schedule.day));
    for (const day of weekdaySet) {
      if (!next.some((schedule) => schedule.day === day)) {
        next = toggleDay(next, day, role);
      }
    }
    setDays(next);
  }

  return (
    <FlowStep
      continueLabel={continueLabel}
      canContinue={isScheduleValid(days) && hasMorningTimes(days)}
      onContinue={onContinue}
      progress={progress}
      reaction={
        days.length > 0
          ? `${days.length} day${days.length === 1 ? '' : 's'} a week — up to ${trips} trip${trips === 1 ? '' : 's'} you could share.`
          : null
      }
      subtitle="Set your morning start, campus arrival deadline, and return time. Driving: when you leave to pick someone up. Riding: when you can be ready at your pickup point."
      title="Build your week"
    >
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Days you commute</Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={selectWeekdays}>
            <Text style={styles.link}>Weekdays</Text>
          </Pressable>
        </View>
        <DayCircles
          onToggle={(day) => setDays(toggleDay(days, day, role))}
          selected={days.map((schedule) => schedule.day)}
        />
      </View>

      {days.length > 0 && !byDay && first && (
        <Card style={styles.timesCard}>
          <Text style={styles.sectionTitle}>Your morning trip</Text>
          {renderStart('all', first)}
          {renderField('all', 'arriveBy', first.arriveBy)}
          <View style={styles.divider} />
          {renderField('all', 'leaveAt', first.leaveAt)}
          {getDayError(first) && <Text style={styles.error}>{getDayError(first)}</Text>}
        </Card>
      )}

      {days.length > 0 && (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Different times on different days</Text>
          <Switch
            onValueChange={toggleByDay}
            thumbColor={colors.surface}
            trackColor={{ false: colors.border, true: colors.accent }}
            value={byDay}
          />
        </View>
      )}

      {days.some((day) => day.arriveBy !== null && day.startAt == null) && (
        <Text style={styles.error}>Choose your morning start time for each trip to campus.</Text>
      )}

      {(byDay || role === 'both') &&
        days.map((schedule) => {
          const error = byDay ? getDayError(schedule) : null;
          return (
            <Card key={schedule.day} style={styles.dayCard}>
              <Text style={styles.dayTitle}>{dayName(schedule.day)}</Text>
              {role === 'both' && (
                <ModeSelector
                  accessibilityLabel={`${dayName(schedule.day)}: driving or riding`}
                  onChange={(mode) => setDays(setDayMode(days, schedule.day, mode))}
                  value={schedule.mode}
                />
              )}
              {byDay && (
                <>
                  {renderStart(schedule.day, schedule)}
                  {renderField(schedule.day, 'arriveBy', schedule.arriveBy)}
                  <View style={styles.divider} />
                  {renderField(schedule.day, 'leaveAt', schedule.leaveAt)}
                </>
              )}
              {error && <Text style={styles.error}>{error}</Text>}
            </Card>
          );
        })}
    </FlowStep>
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
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  link: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  timesCard: {
    paddingVertical: spacing.xs,
  },
  divider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  switchLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
  },
  dayCard: {
    gap: spacing.sm,
  },
  dayTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  error: {
    color: colors.error,
    fontSize: 13,
    marginTop: spacing.xs,
  },
});
