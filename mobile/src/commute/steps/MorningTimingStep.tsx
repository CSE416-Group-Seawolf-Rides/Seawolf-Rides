import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../../firebase/firebase';
import { FlowStep, type FlowProgress } from '../../components/flow/FlowStep';
import { AppButton } from '../../components/AppButton';
import { Card } from '../../components/Card';
import { TimeField } from '../components/TimeField';
import { useCommuteDraft } from '../CommuteDraftProvider';
import {
  DEFAULT_START_AT,
  formatTime,
  getDayError,
  hasMorningTimes,
  setStartTime,
  weekdays,
  type Weekday,
} from '../commuteModel';
import { suggestedStartMinute } from '../morningTiming';

export function MorningTimingStep({
  onContinue,
  progress,
  continueLabel,
}: {
  onContinue: () => void;
  progress?: FlowProgress;
  continueLabel?: string;
}) {
  const { draft, updateDraft } = useCommuteDraft();
  const [duration, setDuration] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<Weekday>();
  const active = useRef(true);
  const started = useRef(false);
  const estimating = useRef(false);
  const point = draft.startPoint,
    campus = draft.campusLot;
  async function estimate() {
    if (!point || !campus || estimating.current) return;
    estimating.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const result = await httpsCallable<
        { startPoint: typeof point; campusLot: string },
        { durationSeconds: number }
      >(getFirebaseFunctions(), 'estimateCommuteStart', { timeout: 120000 })({
        startPoint: point,
        campusLot: campus,
      });
      if (active.current) setDuration(result.data.durationSeconds);
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error
            ? e.message
            : 'Choose your time manually or retry later.',
        );
    } finally {
      estimating.current = false;
      if (active.current) setBusy(false);
    }
  }
  // One estimate per visit; edits to times never trigger additional routing requests.
  const estimateOnOpen = useRef(estimate);
  useEffect(() => {
    active.current = true;
    if (!started.current) {
      started.current = true;
      void estimateOnOpen.current();
    }
    return () => {
      active.current = false;
    };
  }, []);
  const inbound = draft.days.filter((d) => d.arriveBy !== null);
  return (
    <FlowStep
      title="When will you head out?"
      subtitle="We can suggest a time from your starting point and campus arrival deadline. Choose a time that works for you. All times are New York time."
      progress={progress}
      continueLabel={continueLabel}
      canContinue={hasMorningTimes(draft.days) && !draft.days.some(getDayError)}
      onContinue={onContinue}
    >
      {busy && <Text>Estimating your road travel time…</Text>}
      {duration !== undefined && (
        <>
          <Text>
            About {Math.ceil(duration / 60)} minutes directly to campus. This
            excludes traffic and passenger pickup detours. Your driver’s actual
            pickup time is confirmed when you agree to a ride.
          </Text>
          <AppButton
            variant="secondary"
            label="Use suggested times"
            onPress={() =>
              updateDraft({
                days: draft.days.map((d) => ({
                  ...d,
                  ...(d.arriveBy !== null &&
                  suggestedStartMinute(d.arriveBy, duration) !== null
                    ? { startAt: suggestedStartMinute(d.arriveBy, duration) }
                    : {}),
                })),
              })
            }
          />
        </>
      )}
      {error && <Text accessibilityRole="alert">{error}</Text>}
      {duration === undefined && !busy && point && (
        <AppButton
          variant="secondary"
          label="Retry road estimate"
          onPress={() => void estimate()}
        />
      )}
      {!inbound.length && (
        <Text>You only saved trips home. No morning time is needed.</Text>
      )}
      {inbound.map((day) => {
        const suggested =
          duration === undefined
            ? null
            : suggestedStartMinute(day.arriveBy!, duration);
        return (
          <Card key={day.day}>
            <Text>
              {weekdays.find((d) => d.value === day.day)?.name} · Arrive by{' '}
              {formatTime(day.arriveBy!)}
            </Text>
            {suggested !== null && (
              <Text>
                Suggested {day.mode === 'drive' ? 'departure' : 'ready time'}:{' '}
                {formatTime(suggested)}
              </Text>
            )}
            <TimeField
              label={
                day.mode === 'drive'
                  ? 'Leave your starting point at'
                  : day.mode === 'ride'
                    ? 'Ready for pickup from'
                    : 'Ready to head out at'
              }
              minutes={day.startAt ?? null}
              emptyLabel="Choose time"
              defaultMinutes={suggested ?? DEFAULT_START_AT}
              expanded={open === day.day}
              noneLabel="Clear time"
              addLabel="Choose time"
              onToggle={() => setOpen(open === day.day ? undefined : day.day)}
              onChange={(value) =>
                updateDraft({ days: setStartTime(draft.days, day.day, value) })
              }
            />
            {getDayError(day) && <Text>{getDayError(day)}</Text>}
          </Card>
        );
      })}
    </FlowStep>
  );
}
