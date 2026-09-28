import type { CampusLotId, CommuteSchedule, DayMode, DaySchedule, Weekday } from '../commute/commuteModel';
import { weekdays } from '../commute/commuteModel';

// A driver's recurring commute that riders can request a seat on.
export interface DriverOffer {
  id: string;
  driverName: string;
  startAreaLabel: string;
  campusLot: CampusLotId;
  days: Weekday[];
  pickupTime: number;
  arriveBy: number;
  leaveAt: number | null;
  seatsLeft: number;
  vehicle: string;
  // A public meeting spot the driver suggests. Revealed only after a request is accepted.
  pickupSpot: string;
  chatId?: string;
}

// A rider asking to join the current user's drive.
export interface RiderRequest {
  id: string;
  riderName: string;
  startAreaLabel: string;
  campusLot: CampusLotId;
  days: Weekday[];
  arriveBy: number;
  leaveAt: number | null;
  addedMinutes: number;
  // Where the rider will wait. Revealed to the driver only after they accept.
  pickupSpot: string;
  note?: string;
}

export type RequestStatus = 'pending' | 'accepted' | 'declined';

export interface OutgoingRequest {
  id: string;
  offerId: string;
  days: Weekday[];
  status: RequestStatus;
}

export interface IncomingRequest extends RiderRequest {
  status: RequestStatus;
}

export interface DriverMatch {
  offer: DriverOffer;
  sharedDays: Weekday[];
  // Minutes between the driver's arrival and the rider's target (negative = early).
  arrivalGap: number | null;
}

export type DayStatus = 'confirmed' | 'pending' | 'open' | 'skipped' | 'off';

export interface DayOverview {
  day: Weekday;
  mode: DayMode | null;
  status: DayStatus;
}

const isRidingMode = (mode: DayMode) => mode !== 'drive';
const isDrivingMode = (mode: DayMode) => mode !== 'ride';

export function ridingDays(commute: CommuteSchedule): DaySchedule[] {
  return commute.days.filter(
    (day) => isRidingMode(day.mode) && (day.arriveBy !== null || day.leaveAt !== null),
  );
}

export function drivingDays(commute: CommuteSchedule): DaySchedule[] {
  return commute.days.filter((day) => isDrivingMode(day.mode));
}

function offerServesPlan(offer: DriverOffer, plan: DaySchedule): boolean {
  return plan.arriveBy !== null || (plan.leaveAt !== null && offer.leaveAt !== null);
}

// ---- Matching -----------------------------------------------------------------
// Placeholder ranking so the UI has realistic data. The team's deterministic matching
// engine (schedule, location, route, detour) replaces this function without UI changes.

export function matchDrivers(commute: CommuteSchedule | null, offers: DriverOffer[]): DriverMatch[] {
  if (!commute) {
    return offers.map((offer) => ({ offer, sharedDays: [], arrivalGap: null }));
  }

  const days = ridingDays(commute);
  const matches = offers
    .map((offer) => {
      const shared = days.filter(
        (day) => offer.days.includes(day.day) && offerServesPlan(offer, day),
      );
      const target = shared.find((day) => day.arriveBy !== null)?.arriveBy ?? null;
      return {
        offer,
        sharedDays: shared.map((day) => day.day),
        arrivalGap: target === null ? null : offer.arriveBy - target,
      };
    })
    .filter((match) => match.sharedDays.length > 0);

  // More shared days first; then arrival closest to the target, with late arrivals
  // weighed three times as heavily as early ones; then the same campus spot.
  const lateness = (gap: number | null) => (gap === null ? 0 : gap > 0 ? gap * 3 : -gap);
  return matches.sort(
    (a, b) =>
      b.sharedDays.length - a.sharedDays.length ||
      lateness(a.arrivalGap) - lateness(b.arrivalGap) ||
      Number(b.offer.campusLot === commute.campusLot) - Number(a.offer.campusLot === commute.campusLot),
  );
}

// Best drivers for one day the rider still needs covered.
export function matchDriversForDay(
  commute: CommuteSchedule,
  offers: DriverOffer[],
  day: Weekday,
): DriverMatch[] {
  return matchDrivers({ ...commute, days: commute.days.filter((plan) => plan.day === day) }, offers);
}

// Someone can have several requests with one driver (say Mon/Wed accepted, then Fri
// asked later). Keep the aggregate status for compact cards, but preserve each status's
// days so detail screens never present a pending day as confirmed.
export interface RequestSummary {
  status: RequestStatus;
  days: Weekday[];
  acceptedDays: Weekday[];
  pendingDays: Weekday[];
  declinedDays: Weekday[];
}

export function requestSummary(
  outgoing: OutgoingRequest[],
  offerId: string,
  day?: Weekday,
): RequestSummary | undefined {
  const requests = outgoing.filter(
    (request) => request.offerId === offerId && (!day || request.days.includes(day)),
  );
  if (requests.length === 0) {
    return undefined;
  }
  const status: RequestStatus = requests.some((r) => r.status === 'accepted')
    ? 'accepted'
    : requests.some((r) => r.status === 'pending')
      ? 'pending'
      : 'declined';
  const daysForStatus = (requestStatus: RequestStatus) =>
    weekdays
      .map((weekday) => weekday.value)
      .filter((value) =>
        requests.some(
          (request) => request.status === requestStatus && request.days.includes(value),
        ),
      );
  const acceptedDays = daysForStatus('accepted');
  const pendingDays = daysForStatus('pending');
  const declinedDays = daysForStatus('declined');
  const days = weekdays
    .map((weekday) => weekday.value)
    .filter((value) => requests.some((request) => request.days.includes(value)));
  return { status, days, acceptedDays, pendingDays, declinedDays };
}

// Shared riding days with this driver that aren't already requested from anyone.
export function requestableDays(
  commute: CommuteSchedule,
  offer: DriverOffer,
  outgoing: OutgoingRequest[],
  incoming: IncomingRequest[] = [],
): Weekday[] {
  const taken = outgoing.filter((request) => request.status !== 'declined').flatMap((r) => r.days);
  const drivingCommitments = incoming
    .filter((request) => request.status === 'accepted')
    .flatMap((request) => sharedDrivingDays(commute, request));
  return ridingDays(commute)
    .filter(
      (plan) =>
        offer.days.includes(plan.day) &&
        offerServesPlan(offer, plan) &&
        !taken.includes(plan.day) &&
        !drivingCommitments.includes(plan.day),
    )
    .map((plan) => plan.day);
}

// ---- Carpools ------------------------------------------------------------------
// People think in recurring carpools ("Alex drives me Mon and Wed"), not in dated
// trips, so the Rides tab groups by person.

export type Carpool =
  | {
      kind: 'driver';
      id: string;
      offer: DriverOffer;
      // Days the driver confirmed, and days still waiting on them.
      days: Weekday[];
      pendingDays: Weekday[];
      pendingRequestIds: string[];
    }
  | {
      kind: 'rider';
      id: string;
      rider: IncomingRequest;
      days: Weekday[];
    };

const dayOrder = (days: Weekday[]) =>
  weekdays.map((weekday) => weekday.value).filter((day) => days.includes(day));

export function getCarpools(
  outgoing: OutgoingRequest[],
  incoming: IncomingRequestView[],
  offers: DriverOffer[],
): Carpool[] {
  const drivers: Carpool[] = offers.flatMap((offer) => {
    const requests = outgoing.filter((request) => request.offerId === offer.id);
    const accepted = requests.filter((request) => request.status === 'accepted');
    const pending = requests.filter((request) => request.status === 'pending');
    if (accepted.length === 0 && pending.length === 0) {
      return [];
    }
    return [
      {
        kind: 'driver' as const,
        id: `driver-${offer.id}`,
        offer,
        days: dayOrder(accepted.flatMap((request) => request.days)),
        pendingDays: dayOrder(pending.flatMap((request) => request.days)),
        pendingRequestIds: pending.map((request) => request.id),
      },
    ];
  });
  const riders: Carpool[] = incoming
    .filter((view) => view.request.status === 'accepted')
    .map((view) => ({
      kind: 'rider' as const,
      id: `rider-${view.request.id}`,
      rider: view.request,
      days: view.sharedDays,
    }));

  // Confirmed carpools first; requests still waiting go last.
  return [...drivers, ...riders].sort(
    (a, b) => Number(a.days.length === 0) - Number(b.days.length === 0),
  );
}

export function describeArrivalFit(gap: number | null): { label: string; good: boolean } | null {
  if (gap === null) {
    return null;
  }
  if (gap > 0) {
    return { label: `Arrives ${gap} min after your target`, good: false };
  }
  if (gap < -30) {
    return { label: `Arrives ${-gap} min early`, good: true };
  }
  return { label: 'Fits your arrival time', good: true };
}

// Requests only matter for days the user is actually driving.
export function sharedDrivingDays(commute: CommuteSchedule, request: RiderRequest): Weekday[] {
  return drivingDays(commute)
    .filter(
      (plan) =>
        request.days.includes(plan.day) &&
        (plan.arriveBy !== null || (plan.leaveAt !== null && request.leaveAt !== null)),
    )
    .map((day) => day.day);
}

export function seatsTaken(day: Weekday, incoming: IncomingRequest[]): number {
  return incoming.filter((request) => request.status === 'accepted' && request.days.includes(day))
    .length;
}

export interface IncomingRequestView {
  request: IncomingRequest;
  sharedDays: Weekday[];
  fullDay?: Weekday;
  conflictDay?: Weekday;
}

// Requests that overlap the days the user drives, with any day that's already full.
export function incomingForCommute(
  commute: CommuteSchedule | null,
  incoming: IncomingRequest[],
  outgoing: OutgoingRequest[] = [],
): IncomingRequestView[] {
  if (!commute) {
    return [];
  }
  return incoming
    .map((request) => {
      const acceptance =
        request.status === 'pending'
          ? canAccept(commute, request, incoming, outgoing)
          : { ok: true };
      return {
        request,
        sharedDays: sharedDrivingDays(commute, request),
        fullDay: acceptance.fullDay,
        conflictDay: acceptance.conflictDay,
      };
    })
    .filter((view) => view.sharedDays.length > 0);
}

export function canAccept(
  commute: CommuteSchedule,
  request: IncomingRequest,
  incoming: IncomingRequest[],
  outgoing: OutgoingRequest[] = [],
): { ok: boolean; fullDay?: Weekday; conflictDay?: Weekday } {
  const conflictDay = sharedDrivingDays(commute, request).find((day) =>
    outgoing.some(
      (outgoingRequest) =>
        outgoingRequest.status === 'accepted' && outgoingRequest.days.includes(day),
    ),
  );
  if (conflictDay) {
    return { ok: false, conflictDay };
  }
  const seats = commute.seats ?? 0;
  const fullDay = sharedDrivingDays(commute, request).find(
    (day) => seatsTaken(day, incoming) >= seats,
  );
  return fullDay ? { ok: false, fullDay } : { ok: true };
}

function sameDays(a: Weekday[], b: Weekday[]): boolean {
  return a.length === b.length && a.every((day, index) => day === b[index]);
}

export function reconcileRideState(
  commute: CommuteSchedule,
  outgoing: OutgoingRequest[],
  incoming: IncomingRequest[],
): { outgoing: OutgoingRequest[]; incoming: IncomingRequest[] } {
  const riding = new Set(ridingDays(commute).map((plan) => plan.day));
  const driving = new Set(drivingDays(commute).map((plan) => plan.day));

  const nextOutgoing = outgoing.flatMap((request) => {
    const days = request.days.filter((day) => riding.has(day));
    if (days.length === 0) {
      return [];
    }
    return [sameDays(days, request.days) ? request : { ...request, days }];
  });
  const nextIncoming = incoming.flatMap((request) => {
    const days = request.days.filter((day) => driving.has(day));
    if (days.length === 0) {
      return [];
    }
    return [sameDays(days, request.days) ? request : { ...request, days }];
  });

  return { outgoing: nextOutgoing, incoming: nextIncoming };
}

export function reconcileSkippedDays(commute: CommuteSchedule, skipped: string[]): string[] {
  const commuteDays = new Set(commute.days.map((plan) => plan.day));
  return skipped.filter((id) => {
    const date = new Date(`${id}T12:00:00`);
    return !Number.isNaN(date.getTime()) && commuteDays.has(weekdayOf(date));
  });
}

// ---- Week overview ------------------------------------------------------------

export function getWeekOverview(
  commute: CommuteSchedule | null,
  outgoing: OutgoingRequest[],
  incoming: IncomingRequest[],
  skippedDays: Weekday[] = [],
): DayOverview[] {
  return weekdays.map(({ value: day }) => {
    const plan = commute?.days.find((schedule) => schedule.day === day);
    if (!plan) {
      return { day, mode: null, status: 'off' };
    }

    if (skippedDays.includes(day)) {
      return { day, mode: plan.mode, status: 'skipped' };
    }

    const statuses: RequestStatus[] = [];
    if (isRidingMode(plan.mode)) {
      statuses.push(...outgoing.filter((r) => r.days.includes(day)).map((r) => r.status));
    }
    if (isDrivingMode(plan.mode)) {
      statuses.push(...incoming.filter((r) => r.days.includes(day)).map((r) => r.status));
    }

    const status: DayStatus = statuses.includes('accepted')
      ? 'confirmed'
      : statuses.includes('pending')
        ? 'pending'
        : 'open';
    return { day, mode: plan.mode, status };
  });
}

// ---- Upcoming trips -------------------------------------------------------------
// A trip is one concrete, dated commute: a confirmed ride with a driver or a drive with
// accepted riders. Its id is the local date ("2026-09-28") since there is at most one
// trip per day.

interface TripDate {
  id: string;
  day: Weekday;
  whenLabel: string;
  dateLabel: string;
  thisWeek: boolean;
}

export interface Trip extends TripDate {
  kind: 'ride' | 'drive';
  arriveBy: number | null;
  leaveAt: number | null;
  campusLot: CampusLotId;
  skipped: boolean;
  pickupTime?: number;
  offer?: DriverOffer;
  riders?: IncomingRequest[];
  seats?: number;
}

// A day the user needs a ride but has no driver yet.
export interface OpenDay extends TripDate {
  kind: 'open';
  arriveBy: number | null;
  leaveAt: number | null;
  pending: boolean;
}

export type UpcomingItem = Trip | OpenDay;
export type NextTrip = Trip;

export interface PastTrip {
  id: string;
  daysAgo: number;
  kind: 'ride' | 'drive';
  withName: string;
  campusLot: CampusLotId;
  arrivedAt: number;
  outcome: 'completed' | 'skipped' | 'cancelled';
}

export function weekdayOf(date: Date): Weekday {
  // Date#getDay: 0 = Sunday.
  return (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[date.getDay()];
}

export function dateKeyOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatTripDate(date: Date): string {
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', weekday: 'short' });
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

// Date keys for each day of the current Monday-to-Sunday week.
export function weekDateKeys(now: Date): Record<Weekday, string> {
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  return Object.fromEntries(
    weekdays.map((weekday, index) => [weekday.value, dateKeyOf(addDays(monday, index))]),
  ) as Record<Weekday, string>;
}

export function isTrip(item: UpcomingItem): item is Trip {
  return item.kind !== 'open';
}

export function getUpcoming(
  commute: CommuteSchedule | null,
  outgoing: OutgoingRequest[],
  incoming: IncomingRequest[],
  offers: DriverOffer[],
  now: Date,
  skipped: string[] = [],
  horizonDays = 14,
): UpcomingItem[] {
  if (!commute) {
    return [];
  }

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const daysLeftThisWeek = 7 - ((now.getDay() + 6) % 7);
  const items: UpcomingItem[] = [];

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = addDays(now, offset);
    const day = weekdayOf(date);
    const plan = commute.days.find((schedule) => schedule.day === day);
    if (!plan || (plan.arriveBy === null && plan.leaveAt === null)) {
      continue;
    }

    const id = dateKeyOf(date);
    const dateLabel = formatTripDate(date);
    const base: TripDate = {
      id,
      day,
      dateLabel,
      thisWeek: offset < daysLeftThisWeek,
      whenLabel:
        offset === 0
          ? 'Today'
          : offset === 1
            ? 'Tomorrow'
            : offset < 7
              ? weekdays.find((weekday) => weekday.value === day)!.name
              : dateLabel,
    };
    const trip = { skipped: skipped.includes(id), leaveAt: plan.leaveAt };

    if (isRidingMode(plan.mode)) {
      const accepted = outgoing.find((r) => r.status === 'accepted' && r.days.includes(day));
      const offer =
        accepted &&
        offers.find(
          (candidate) => candidate.id === accepted.offerId && offerServesPlan(candidate, plan),
        );
      if (offer) {
        const item: Trip = {
          ...base,
          ...trip,
          kind: 'ride',
          arriveBy: plan.arriveBy === null ? null : offer.arriveBy,
          leaveAt: plan.leaveAt === null ? null : offer.leaveAt,
          campusLot: offer.campusLot,
          pickupTime: plan.arriveBy === null ? undefined : offer.pickupTime,
          offer,
        };
        const endTime = item.leaveAt ?? item.arriveBy;
        if (offset !== 0 || endTime === null || endTime > minutesNow) {
          items.push(item);
        }
        continue;
      }
    }

    if (isDrivingMode(plan.mode)) {
      const riders = incoming.filter((r) => r.status === 'accepted' && r.days.includes(day));
      if (riders.length > 0) {
        const item: Trip = {
          ...base,
          ...trip,
          kind: 'drive',
          arriveBy: plan.arriveBy,
          campusLot: commute.campusLot,
          riders,
          seats: commute.seats,
        };
        const endTime = item.leaveAt ?? item.arriveBy;
        if (offset !== 0 || endTime === null || endTime > minutesNow) {
          items.push(item);
        }
        continue;
      }
    }

    // Drivers without riders just drive as usual, so only riders get an open day.
    if (isRidingMode(plan.mode)) {
      const item: OpenDay = {
        ...base,
        kind: 'open',
        arriveBy: plan.arriveBy,
        leaveAt: plan.leaveAt,
        pending: outgoing.some((r) => r.status === 'pending' && r.days.includes(day)),
      };
      const endTime = item.leaveAt ?? item.arriveBy;
      if (offset !== 0 || endTime === null || endTime > minutesNow) {
        items.push(item);
      }
    }
  }

  return items;
}

export function getNextTrip(
  commute: CommuteSchedule | null,
  outgoing: OutgoingRequest[],
  incoming: IncomingRequest[],
  offers: DriverOffer[],
  now: Date,
  skipped: string[] = [],
): NextTrip | null {
  return (
    getUpcoming(commute, outgoing, incoming, offers, now, skipped, 7).find(
      (item): item is Trip => isTrip(item) && !item.skipped,
    ) ?? null
  );
}
