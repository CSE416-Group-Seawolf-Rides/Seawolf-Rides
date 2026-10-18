import type { CommuteSchedule, DayMode, DaySchedule } from '../commute/commuteModel';
import type { CommuteRole } from '../onboarding/onboardingModel';
import { localDateAt, weekdayForDate } from '../mvp/settings';

export type CalendarMode = DayMode | 'off';
export interface DayOverride {
  mode: CalendarMode;
}
export function parseDayOverride(value: unknown): DayOverride | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'object' ||
    !('mode' in value) ||
    !['drive', 'ride', 'either', 'off'].includes(String(value.mode))
  )
    throw new Error('Invalid calendar day.');
  return { mode: value.mode as CalendarMode };
}
export function calendarDay(
  commute: CommuteSchedule,
  role: CommuteRole,
  date: string,
  override?: DayOverride | null,
): DaySchedule | null {
  const weekday = weekdayForDate(date);
  const saved = commute.days.find((day) => day.day === weekday);
  const mode =
    override?.mode ??
    (saved ? (role === 'both' ? saved.mode : role === 'driver' ? 'drive' : 'ride') : 'off');
  if (mode === 'off') return null;
  // An extra date reuses the first saved day's times; the calendar displays them before saving.
  const template = saved ?? commute.days[0];
  return template ? { ...template, day: weekday, mode } : null;
}
export function shiftDate(date: string, days: number): string {
  weekdayForDate(date);
  const utc = new Date(`${date}T12:00:00Z`);
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}
export function checkDemoDate(date: string, now: number) {
  weekdayForDate(date);
  const today = localDateAt(now);
  const days = (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000;
  if (days < 0 || days > 30) throw new Error('Choose a date within the next 30 days.');
}
