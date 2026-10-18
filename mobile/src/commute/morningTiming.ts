import { ARRIVAL_BUFFER_SECONDS } from './arrivalPolicy';
/** Aim three minutes early; round down one minute to stay within a 2–5-minute buffer. */
export function suggestedStartMinute(
  arriveBy: number,
  durationSeconds: number,
): number | null {
  if (
    !Number.isInteger(arriveBy) ||
    arriveBy < 0 ||
    arriveBy > 1439 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  )
    return null;
  const minute = Math.floor(arriveBy - (durationSeconds + ARRIVAL_BUFFER_SECONDS) / 60);
  return minute >= 0 && minute < arriveBy ? minute : null;
}
