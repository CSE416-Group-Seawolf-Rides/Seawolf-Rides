import { localMinuteToEpoch } from '../mvp/settings';

/** Discovery remains broad; a proposed trip must meet the actual arrival deadline. */
export const ARRIVAL_FLEX_MINUTES = 30;
export const ARRIVAL_FLEX_SECONDS = ARRIVAL_FLEX_MINUTES * 60;
export const ARRIVAL_EARLY_SECONDS = 20 * 60;
export const ARRIVAL_BUFFER_SECONDS = 3 * 60;
/** Legacy persisted-input bound; actual proposed arrivals use the stricter window below. */
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
      target,
      day.leaveAt === null ? Infinity : localMinuteToEpoch(date, day.leaveAt),
    ),
  };
}
