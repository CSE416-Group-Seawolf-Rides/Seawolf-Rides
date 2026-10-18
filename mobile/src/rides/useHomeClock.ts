import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';

import { Weekday, weekdays } from '../commute/commuteModel';
import { weekdayOf } from './rideModel';

// Refresh time-dependent screens while they are visible and whenever the app returns
// from the background. Tab routes stay mounted, so mount time alone quickly goes stale.
export function useHomeClock(transitions: readonly number[] = []) {
  const [now, setNow] = useState(() => new Date());
  const nextTransition = transitions
    .filter((t) => Number.isFinite(t) && t > now.getTime() / 1000)
    .sort((a, b) => a - b)[0];
  const boundaryAt =
    nextTransition !== undefined &&
    nextTransition * 1000 - now.getTime() <= 60_000
      ? nextTransition
      : undefined;

  useFocusEffect(
    useCallback(() => {
      const refresh = () => setNow(new Date());
      refresh();
      const interval = setInterval(refresh, 60_000);
      const boundary =
        boundaryAt === undefined
          ? undefined
          : setTimeout(refresh, Math.max(1, boundaryAt * 1000 - Date.now()));
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          refresh();
        }
      });
      return () => {
        clearInterval(interval);
        clearTimeout(boundary);
        subscription.remove();
      };
    }, [boundaryAt]),
  );

  const hour = now.getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateLabel = now
    .toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      weekday: 'long',
    })
    .toUpperCase();

  // Day-of-month for each day of the current Monday-to-Sunday week.
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const dates = Object.fromEntries(
    weekdays.map((weekday, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return [weekday.value, date.getDate()];
    }),
  ) as Record<Weekday, number>;

  return { now, greeting, dateLabel, dates, today: weekdayOf(now) };
}
