/** Direct-trip suggestion, rounded earlier to five minutes; supplied duration may include traffic. */
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
  const minute = Math.floor((arriveBy - durationSeconds / 60) / 5) * 5;
  return minute >= 0 && minute < arriveBy ? minute : null;
}
