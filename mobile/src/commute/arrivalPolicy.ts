import { localMinuteToEpoch } from '../mvp/settings';

/** Calendar matching uses a preferred arrival, not a hard class/work deadline. */
export const ARRIVAL_FLEX_MINUTES = 30;
export const ARRIVAL_FLEX_SECONDS = ARRIVAL_FLEX_MINUTES * 60;
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
      target - ARRIVAL_FLEX_SECONDS,
    ),
    latest: Math.min(
      localMinuteToEpoch(date, 1439) + 59,
      target + ARRIVAL_FLEX_SECONDS,
      day.leaveAt === null ? Infinity : localMinuteToEpoch(date, day.leaveAt),
    ),
  };
}
