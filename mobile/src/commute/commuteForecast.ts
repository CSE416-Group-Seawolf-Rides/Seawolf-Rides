import { localDateAt, weekdayForDate } from '../mvp/settings';
import { shiftDate } from '../calendar/commuteCalendar';
import type { Weekday } from './commuteModel';

export interface CommuteStartEstimate {
  durationSeconds: number;
  model: 'STATIC_ROAD' | 'TRAFFIC_FORECAST';
  localDate: string;
  suggestedStartAt: number | null;
}
/** A weekly template uses the next occurrence after today, always a future date. */
export function nextForecastDate(day: Weekday, now: number): string {
  const today = localDateAt(now);
  for (let offset = 1; offset <= 7; offset++) {
    const date = shiftDate(today, offset);
    if (weekdayForDate(date) === day) return date;
  }
  throw new Error('Choose a valid weekday.');
}
