import type { RideRequest } from './rideRequestModel';
import type { CommuteSchedule, DaySchedule } from '../commute/commuteModel';
import type { CommuteRole } from '../onboarding/onboardingModel';
import { localDateAt, localMinuteToEpoch, weekdayForDate } from './settings';
import {
  calendarDay,
  shiftDate,
  type DayOverride,
} from '../calendar/commuteCalendar';

export const rideEnd = (ride: RideRequest) =>
  Math.max(ride.plan.vehicleCampusArrival, ride.plan.riderDestinationArrival);
export const partnerId = (ride: RideRequest, uid: string) =>
  ride.driverId === uid ? ride.riderId : ride.driverId;
export const partnerName = (ride: RideRequest, uid: string) =>
  ride.driverId === uid ? ride.riderName : ride.driverName;
export const pendingIsCurrent = (ride: RideRequest, now: number) =>
  ride.status === 'PENDING' && ride.plan.departure > now;
export const rideIsCurrent = (ride: RideRequest, now: number) =>
  ride.status === 'ACCEPTED' && rideEnd(ride) > now;
export const requestNeedsAnswer = (
  ride: RideRequest,
  uid: string,
  now: number,
) => pendingIsCurrent(ride, now) && ride.driverId === uid;
export function startOfWeek(date: string) {
  return shiftDate(
    date,
    -['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(
      weekdayForDate(date),
    ),
  );
}
export function homeHeaderDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
const byDeparture = (a: RideRequest, b: RideRequest) =>
  a.plan.departure - b.plan.departure || a.id.localeCompare(b.id);
export interface LiveCarpool {
  id: string;
  name: string;
  accepted: RideRequest[];
  pending: RideRequest[];
}
/** One current relationship per participant. Never infer recurring reservations. */
export function currentCarpools(
  items: RideRequest[],
  uid: string,
  now: number,
): LiveCarpool[] {
  const groups = new Map<string, LiveCarpool>();
  for (const ride of [...items].sort(byDeparture)) {
    if (!ride.participantIds.includes(uid)) continue;
    const accepted = rideIsCurrent(ride, now);
    // Incoming asks belong to the review queue; outgoing asks sit inline with the driver.
    const pending = pendingIsCurrent(ride, now) && ride.riderId === uid;
    if (!accepted && !pending) continue;
    const id = partnerId(ride, uid);
    const group = groups.get(id) ?? {
      id,
      name: partnerName(ride, uid),
      accepted: [],
      pending: [],
    };
    (accepted ? group.accepted : group.pending).push(ride);
    groups.set(id, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      byDeparture(
        a.accepted[0] ?? a.pending[0],
        b.accepted[0] ?? b.pending[0],
      ) || a.id.localeCompare(b.id),
  );
}
export function rideHistory(items: RideRequest[], uid: string, now: number) {
  return items
    .filter(
      (ride) =>
        ride.participantIds.includes(uid) &&
        (ride.status === 'DECLINED' ||
          (ride.status === 'ACCEPTED' && rideEnd(ride) <= now) ||
          (ride.status === 'PENDING' && ride.plan.departure <= now)),
    )
    .sort(
      (a, b) => b.plan.departure - a.plan.departure || a.id.localeCompare(b.id),
    );
}
export interface LiveAgendaDay {
  date: string;
  mode: 'drive' | 'ride' | 'either';
  status: 'confirmed' | 'pending' | 'open';
  requests: RideRequest[];
  schedule?: DaySchedule;
}
export function weekAgenda(
  items: RideRequest[],
  uid: string,
  now: number,
  monday: string,
  commute: CommuteSchedule | null,
  role: CommuteRole,
  overrides: Record<string, DayOverride>,
): LiveAgendaDay[] {
  const result: LiveAgendaDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = shiftDate(monday, i);
    const dated = items.filter(
      (r) => r.localDate === date && r.participantIds.includes(uid),
    );
    const accepted = dated
      .filter((r) => rideIsCurrent(r, now))
      .sort(byDeparture);
    const pending = dated
      .filter((r) => pendingIsCurrent(r, now))
      .sort(byDeparture);
    const schedule = commute
      ? calendarDay(commute, role, date, overrides[date])
      : null;
    const requests = accepted.length ? accepted : pending;
    if (requests.length) {
      result.push({
        date,
        mode: requests[0].driverId === uid ? 'drive' : 'ride',
        status: accepted.length ? 'confirmed' : 'pending',
        requests,
        schedule: schedule ?? undefined,
      });
    } else if (
      !dated.some((r) => r.status === 'ACCEPTED') &&
      schedule?.arriveBy != null &&
      localMinuteToEpoch(date, schedule.arriveBy) > now &&
      !(
        schedule.mode === 'drive' &&
        schedule.startAt != null &&
        localMinuteToEpoch(date, schedule.startAt) <= now
      )
    ) {
      result.push({
        date,
        mode: schedule.mode,
        status: 'open',
        requests: [],
        schedule,
      });
    }
  }
  return result;
}
export const rideTime = (epoch: number) =>
  new Date(epoch * 1000).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  });
export const rideDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
export function historyLabel(ride: RideRequest) {
  return ride.status === 'DECLINED'
    ? 'Declined'
    : ride.status === 'PENDING'
      ? 'Expired request'
      : 'Past ride';
}
export function localToday(now: number) {
  return localDateAt(now);
}
