import { preferredArrivalWindow } from '../commute/arrivalPolicy';
import type {
  CommuteSchedule,
  DayMode,
  Weekday,
} from '../commute/commuteModel';
import type { CommuteRole } from '../onboarding/onboardingModel';
import type { RideRequest } from '../mvp/rideRequestModel';
import type { DayOverview } from '../rides/rideModel';
import { localMinuteToEpoch, weekdayForDate } from '../mvp/settings';
import { calendarDay, shiftDate, type DayOverride } from './commuteCalendar';

export function calendarWeek(
  commute: CommuteSchedule,
  role: CommuteRole,
  today: string,
  overrides: Record<string, DayOverride>,
  requests: RideRequest[],
  uid: string,
) {
  const weekdays: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const monday = shiftDate(today, -weekdays.indexOf(weekdayForDate(today)));
  return weekdays.map((day, index) => {
    const date = shiftDate(monday, index);
    const schedule = calendarDay(commute, role, date, overrides[date]);
    const accepted = requests.find(
      (r) => r.localDate === date && r.status === 'ACCEPTED',
    );
    const pending = requests.find(
      (r) => r.localDate === date && r.status === 'PENDING',
    );
    const request = accepted ?? pending;
    const mode: DayMode | null = request
      ? request.driverId === uid
        ? 'drive'
        : 'ride'
      : (schedule?.mode ?? null);
    const status: DayOverview['status'] = accepted
      ? 'confirmed'
      : pending
        ? 'pending'
        : schedule?.arriveBy !== null && schedule?.arriveBy !== undefined
          ? 'open'
          : 'off';
    return { day, date, mode, status };
  });
}
export function nextAcceptedRide(requests: RideRequest[], nowSeconds: number) {
  return requests
    .filter(
      (r) =>
        r.status === 'ACCEPTED' && r.plan.vehicleCampusArrival > nowSeconds,
    )
    .sort(
      (a, b) =>
        a.plan.departure - b.plan.departure ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )[0];
}

/** Next saved inbound occurrence, even if it has no request or accepted partner. */
export function nextScheduledCommute(
  commute: CommuteSchedule,
  role: CommuteRole,
  today: string,
  overrides: Record<string, DayOverride>,
  nowSeconds: number,
) {
  for (let offset = 0; offset <= 30; offset++) {
    const date = shiftDate(today, offset);
    const day = calendarDay(commute, role, date, overrides[date]);
    if (!day || day.arriveBy === null) continue;
    if (
      preferredArrivalWindow(date, { ...day, arriveBy: day.arriveBy }).latest <=
      nowSeconds
    )
      continue;
    if (
      day.mode === 'drive' &&
      day.startAt != null &&
      localMinuteToEpoch(date, day.startAt) <= nowSeconds
    )
      continue;
    return { date, day };
  }
  return null;
}
