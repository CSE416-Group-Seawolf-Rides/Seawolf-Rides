import { useEffect, useState } from 'react';
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
  type Coordinates,
} from '../commuteModel';
import type { CommuteStartEstimate } from '../commuteForecast';

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
  const [progressState, setProgressState] = useState<{
    id: string;
    estimates: Partial<Record<Weekday, CommuteStartEstimate>>;
    nextDay?: Weekday;
    done: boolean;
    error?: string;
  }>();
  const [open, setOpen] = useState<Weekday>();
  const [attempt, setAttempt] = useState(0);
  const inbound = draft.days.filter((d) => d.arriveBy !== null);
  const requestKey = JSON.stringify({
    startPoint: draft.startPoint,
    campusLot: draft.campusLot,
    days: inbound.map(({ day, arriveBy }) => ({ day, arriveBy })),
  });
  const requestId = `${requestKey}:${attempt}`;
  const current = progressState?.id === requestId ? progressState : undefined;
  const currentEstimates = current?.estimates ?? {};
  const error = current?.error;
  const busy =
    draft.startPoint && draft.campusLot && !current?.done
      ? (current?.nextDay ?? inbound[0]?.day)
      : undefined;
  // Each day is a separate bounded operation under the shared server scheduler.
  // No polling/retry loop; user edits to departure never trigger a provider call.
  useEffect(() => {
    const input = JSON.parse(requestKey) as {
      startPoint?: Coordinates;
      campusLot?: string;
      days: { day: Weekday; arriveBy: number }[];
    };
    let active = true;
    if (!input.startPoint || !input.campusLot || !input.days.length) return;
    const estimate = httpsCallable<
      {
        startPoint: NonNullable<typeof input.startPoint>;
        campusLot: string;
        day: Weekday;
        arriveBy: number;
      },
      CommuteStartEstimate
    >(getFirebaseFunctions(), 'estimateCommuteStart', { timeout: 120000 });
    const timer = setTimeout(() => {
      void (async () => {
        for (const [index, day] of input.days.entries()) {
          if (!active) break;
          try {
            const result = await estimate({
              startPoint: input.startPoint!,
              campusLot: input.campusLot!,
              ...day,
            });
            if (active)
              setProgressState((old) => ({
                id: requestId,
                estimates: {
                  ...(old?.id === requestId ? old.estimates : {}),
                  [day.day]: result.data,
                },
                nextDay: input.days[index + 1]?.day,
                done: index === input.days.length - 1,
              }));
          } catch (e) {
            if (active)
              setProgressState((old) => ({
                id: requestId,
                estimates: old?.id === requestId ? old.estimates : {},
                done: true,
                error:
                  e &&
                  typeof e === 'object' &&
                  'code' in e &&
                  e.code === 'functions/not-found'
                    ? 'The route estimator is unavailable. Restart your local backend, then retry. You can also choose a time manually.'
                    : e instanceof Error
                      ? e.message
                      : 'Choose your time manually or retry later.',
              }));
            // Busy, missing configuration or provider failure requires an explicit retry.
            break;
          }
          if (index < input.days.length - 1 && active)
            await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      })();
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [requestKey, requestId]);
  const available = Object.values(currentEstimates).some((estimate) => estimate?.suggestedStartAt != null);
  return (
    <FlowStep
      title="When will you head out?"
      subtitle="We can suggest a time from your starting point and preferred campus arrival time. Choose a time that works for you. All times are New York time."
      progress={progress}
      continueLabel={continueLabel}
      canContinue={hasMorningTimes(draft.days) && !draft.days.some(getDayError)}
      onContinue={onContinue}
    >
      {busy && (
        <Text>
          Estimating {weekdays.find((day) => day.value === busy)?.name} travel
          time…
        </Text>
      )}
      {available && (
        <>
          <Text>
            Suggestions cover the direct trip to campus. Passenger pickup
            detours are calculated when you find matches. Your saved times stay
            editable.
          </Text>
          <AppButton
            variant="secondary"
            label="Use suggested times"
            onPress={() =>
              updateDraft({
                days: draft.days.map((d) => ({
                  ...d,
                  ...(currentEstimates[d.day]?.suggestedStartAt != null
                    ? { startAt: currentEstimates[d.day]!.suggestedStartAt }
                    : {}),
                })),
              })
            }
          />
        </>
      )}
      {error && <Text accessibilityRole="alert">{error}</Text>}
      {!busy &&
        draft.startPoint &&
        (error || Object.keys(currentEstimates).length < inbound.length) && (
          <AppButton
            variant="secondary"
            label="Retry travel estimates"
            onPress={() => setAttempt((value) => value + 1)}
          />
        )}
      {!inbound.length && (
        <Text>You only saved trips home. No departure time is needed.</Text>
      )}
      {inbound.map((day) => {
        const forecast = currentEstimates[day.day];
        const suggested = forecast?.suggestedStartAt ?? null;
        return (
          <Card key={day.day}>
            <Text>
              {weekdays.find((d) => d.value === day.day)?.name} · Arrive around{' '}
              {formatTime(day.arriveBy!)}
            </Text>
            {forecast && (
              <Text>
                About {Math.ceil(forecast.durationSeconds / 60)} minutes ·{' '}
                {forecast.model === 'TRAFFIC_FORECAST'
                  ? `TomTom traffic forecast · ${forecast.localDate}`
                  : 'Road estimate · excludes traffic'}
              </Text>
            )}
            {forecast && suggested === null && <Text>Choose a departure time manually for this day.</Text>}
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
