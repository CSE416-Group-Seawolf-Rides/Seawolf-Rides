import { useState } from 'react';

import { Weekday, weekdays } from '../commute/commuteModel';
import { weekdayOf } from './rideModel';

// Captures "now" once per mount so Home renders consistently (and stays pure).
export function useHomeClock() {
  const [now] = useState(() => new Date());

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
