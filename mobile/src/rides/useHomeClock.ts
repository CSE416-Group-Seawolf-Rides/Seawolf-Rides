import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';

import { Weekday, weekdays } from '../commute/commuteModel';
import { weekdayOf } from './rideModel';

// Refresh time-dependent screens while they are visible and whenever the app returns
// from the background. Tab routes stay mounted, so mount time alone quickly goes stale.
export function useHomeClock() {
  const [now, setNow] = useState(() => new Date());

  useFocusEffect(
    useCallback(() => {
      const refresh = () => setNow(new Date());
      refresh();
      const interval = setInterval(refresh, 60_000);
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          refresh();
        }
      });
      return () => {
        clearInterval(interval);
        subscription.remove();
      };
    }, []),
  );

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateLabel = now
    .toLocaleDateString('en-US', { day: 'numeric', month: 'long', weekday: 'long' })
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
