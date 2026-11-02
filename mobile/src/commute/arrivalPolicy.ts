import { localMinuteToEpoch } from '../mvp/settings';

/** Saved arrival is a preference, with 45 minutes of flexibility on either side. */
export const ARRIVAL_FLEX_MINUTES = 45;
export const ARRIVAL_FLEX_SECONDS = ARRIVAL_FLEX_MINUTES * 60;
export const ARRIVAL_EARLY_SECONDS = ARRIVAL_FLEX_SECONDS;
export const ARRIVAL_BUFFER_SECONDS = 3 * 60;
/** Readiness must precede the end of the preferred arrival window. */
export function latestStartMinute(day: {
  arriveBy: number | null;
  leaveAt: number | null;
}) {
  return Math.min(
    1440,
    day.arriveBy === null ? 1440 : day.arriveBy + ARRIVAL_FLEX_MINUTES,
    day.leaveAt ?? 1440,
  );
}
/** Keep the proposed arrival on this local date and before any saved return. */
export function preferredArrivalWindow(
  date: string,
  day: { arriveBy: number; leaveAt: number | null },
  notBefore = 0,
) {
  const target = localMinuteToEpoch(date, day.arriveBy);
  return {
    earliest: Math.max(
      notBefore,
      localMinuteToEpoch(date, 0),
      target - ARRIVAL_EARLY_SECONDS,
    ),
    latest: Math.min(
      localMinuteToEpoch(date, 1439) + 59,
      target + ARRIVAL_FLEX_SECONDS,
      day.leaveAt === null ? Infinity : localMinuteToEpoch(date, day.leaveAt),
    ),
  };
}
