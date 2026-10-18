/** Dataset-local budget, not a substitute for the TomTom account usage dashboard. */
export const DEFAULT_TOMTOM_MONTHLY_LIMIT = 18_000;
export function tomtomMonthlyLimit(value: string | undefined): number | null {
  if (value === undefined) return DEFAULT_TOMTOM_MONTHLY_LIMIT;
  if (!/^[1-9]\d*$/.test(value)) return null;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit <= 20_000 ? limit : null;
}
export function nextTomtomBudget(
  previous: Record<string, unknown> | undefined,
  nowMs: number,
  limit: number | null,
): { month: string; count: number } | null {
  if (!limit || !Number.isFinite(nowMs)) return null;
  const month = new Date(nowMs).toISOString().slice(0, 7);
  let count = 0;
  if (previous) {
    if (!Number.isSafeInteger(previous.count) || (previous.count as number) < 0)
      return null;
    const period =
      previous.month ??
      (typeof previous.day === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(previous.day)
        ? previous.day.slice(0, 7)
        : undefined);
    if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
      return null;
    // Carry the legacy daily count into this month; never reset a same-month counter.
    if (period === month) count = previous.count as number;
  }
  return count < limit ? { month, count: count + 1 } : null;
}
