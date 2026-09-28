import type { CommuteRole } from '../onboarding/onboardingModel';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type DayMode = 'drive' | 'ride' | 'either';
export type CampusLotId = 'westSide' | 'eastSide' | 'tabler' | 'roth' | 'lot40' | 'other';
export type CommuteStepId = 'start' | 'campus' | 'schedule' | 'seats' | 'review';
export type TripLeg = 'arriveBy' | 'leaveAt';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

// The only location we keep: a 2-mile circle around a coarse grid point. The exact
// coordinates used to find it are never stored or shared.
export interface PrivacyArea {
  center: Coordinates;
  radiusMiles: number;
  label: string;
}

// Times are minutes after midnight. `null` means no ride is needed for that leg.
export interface DaySchedule {
  day: Weekday;
  arriveBy: number | null;
  leaveAt: number | null;
  mode: DayMode;
}

export interface CommuteDraft {
  startArea?: PrivacyArea;
  campusLot?: CampusLotId;
  days: DaySchedule[];
  seats: number;
}

export interface CommuteSchedule {
  startArea: PrivacyArea;
  campusLot: CampusLotId;
  days: DaySchedule[];
  seats?: number;
}

export const PRIVACY_RADIUS_MILES = 2;
const PRIVACY_GRID_MILES = 2;
const MILES_PER_DEGREE_LATITUDE = 69;
const EARTH_RADIUS_MILES = 3958.8;
export const METERS_PER_MILE = 1609.344;

export const DEFAULT_ARRIVE_BY = 9 * 60;
export const DEFAULT_LEAVE_AT = 17 * 60;
export const MIN_SEATS = 1;
export const MAX_SEATS = 6;
export const DEFAULT_SEATS = 3;

export const emptyCommuteDraft: CommuteDraft = { days: [], seats: DEFAULT_SEATS };

export const weekdays: { value: Weekday; short: string; letter: string; name: string }[] = [
  { value: 'mon', short: 'Mon', letter: 'M', name: 'Monday' },
  { value: 'tue', short: 'Tue', letter: 'T', name: 'Tuesday' },
  { value: 'wed', short: 'Wed', letter: 'W', name: 'Wednesday' },
  { value: 'thu', short: 'Thu', letter: 'T', name: 'Thursday' },
  { value: 'fri', short: 'Fri', letter: 'F', name: 'Friday' },
  { value: 'sat', short: 'Sat', letter: 'S', name: 'Saturday' },
  { value: 'sun', short: 'Sun', letter: 'S', name: 'Sunday' },
];

// Campus arrival spots chosen by the team.
export const campusLots: { value: CampusLotId; title: string; description?: string }[] = [
  { value: 'westSide', title: 'West Side' },
  { value: 'eastSide', title: 'East Side' },
  { value: 'tabler', title: 'Tabler' },
  { value: 'roth', title: 'Roth' },
  { value: 'lot40', title: 'Lot 40' },
  { value: 'other', title: 'Somewhere else on campus', description: 'Sort out the spot with your match' },
];

export const dayModeLabels: Record<DayMode, string> = {
  drive: 'Driving',
  ride: 'Riding',
  either: 'Either',
};

export function defaultDayMode(role: CommuteRole): DayMode {
  return role === 'driver' ? 'drive' : role === 'rider' ? 'ride' : 'either';
}

// ---- Privacy area -------------------------------------------------------------

// Snaps a point to the center of a ~2 x 2 mile grid cell. Every point in a cell maps
// to the same center, so the stored area never narrows down where someone lives, and
// the farthest point in a cell (its corner, ~1.41 mi away) is still inside the circle.
export function toPrivacyArea(exact: Coordinates, label: string): PrivacyArea {
  const latStep = PRIVACY_GRID_MILES / MILES_PER_DEGREE_LATITUDE;
  const latitude = (Math.floor(exact.latitude / latStep) + 0.5) * latStep;
  const lngStep =
    PRIVACY_GRID_MILES / (MILES_PER_DEGREE_LATITUDE * Math.cos((latitude * Math.PI) / 180));
  const longitude = (Math.floor(exact.longitude / lngStep) + 0.5) * lngStep;

  return { center: { latitude, longitude }, radiusMiles: PRIVACY_RADIUS_MILES, label };
}

export function distanceMiles(a: Coordinates, b: Coordinates): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

// ---- Times --------------------------------------------------------------------

export function formatTime(minutes: number): string {
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${period}`;
}

// ---- Schedule -----------------------------------------------------------------

function sortDays(days: DaySchedule[]): DaySchedule[] {
  const order = weekdays.map((weekday) => weekday.value);
  return [...days].sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day));
}

// Adding a day copies the times from an existing day, so "my usual times" carry over.
export function toggleDay(days: DaySchedule[], day: Weekday, role: CommuteRole): DaySchedule[] {
  if (days.some((schedule) => schedule.day === day)) {
    return days.filter((schedule) => schedule.day !== day);
  }

  const template = days[0];
  return sortDays([
    ...days,
    {
      day,
      arriveBy: template ? template.arriveBy : DEFAULT_ARRIVE_BY,
      leaveAt: template ? template.leaveAt : DEFAULT_LEAVE_AT,
      mode: defaultDayMode(role),
    },
  ]);
}

export function setLegTime(
  days: DaySchedule[],
  target: Weekday | 'all',
  leg: TripLeg,
  minutes: number | null,
): DaySchedule[] {
  return days.map((schedule) =>
    target === 'all' || schedule.day === target ? { ...schedule, [leg]: minutes } : schedule,
  );
}

export function setDayMode(days: DaySchedule[], day: Weekday, mode: DayMode): DaySchedule[] {
  return days.map((schedule) => (schedule.day === day ? { ...schedule, mode } : schedule));
}

export function hasSameTimes(days: DaySchedule[]): boolean {
  return days.every(
    (schedule) => schedule.arriveBy === days[0].arriveBy && schedule.leaveAt === days[0].leaveAt,
  );
}

export function getDayError(schedule: DaySchedule): string | null {
  if (schedule.arriveBy === null && schedule.leaveAt === null) {
    return 'Add at least one trip, or remove this day.';
  }
  if (
    schedule.arriveBy !== null &&
    schedule.leaveAt !== null &&
    schedule.leaveAt <= schedule.arriveBy
  ) {
    return 'Leave time should be after you arrive.';
  }
  return null;
}

export function isScheduleValid(days: DaySchedule[]): boolean {
  return days.length > 0 && days.every((schedule) => getDayError(schedule) === null);
}

export function countTrips(days: DaySchedule[]): number {
  return days.reduce(
    (total, schedule) =>
      total + (schedule.arriveBy !== null ? 1 : 0) + (schedule.leaveAt !== null ? 1 : 0),
    0,
  );
}

// ---- Flow ---------------------------------------------------------------------

export function getCommuteSteps(role: CommuteRole): CommuteStepId[] {
  return role === 'rider'
    ? ['start', 'campus', 'schedule', 'review']
    : ['start', 'campus', 'schedule', 'seats', 'review'];
}

export function getNextCommuteStep(role: CommuteRole, current: CommuteStepId): CommuteStepId {
  const steps = getCommuteSteps(role);
  return steps[steps.indexOf(current) + 1] ?? 'review';
}

export function buildCommuteSchedule(draft: CommuteDraft, role: CommuteRole): CommuteSchedule {
  if (!draft.startArea || !draft.campusLot || !isScheduleValid(draft.days)) {
    throw new Error('A starting area, campus spot, and valid schedule are required.');
  }

  // Someone can go back and change roles after choosing their days. Enforce the
  // profile's single-role mode here so stale draft modes cannot reach matching.
  const days = sortDays(draft.days).map((schedule) =>
    role === 'both' ? schedule : { ...schedule, mode: defaultDayMode(role) },
  );

  return {
    startArea: draft.startArea,
    campusLot: draft.campusLot,
    days,
    seats: role === 'rider' ? undefined : draft.seats,
  };
}

export function commuteToDraft(schedule: CommuteSchedule | null): CommuteDraft {
  if (!schedule) {
    return emptyCommuteDraft;
  }
  return {
    startArea: schedule.startArea,
    campusLot: schedule.campusLot,
    days: schedule.days,
    seats: schedule.seats ?? DEFAULT_SEATS,
  };
}

// ---- Summaries ----------------------------------------------------------------

export function lotTitle(lot: CampusLotId): string {
  return campusLots.find((option) => option.value === lot)?.title ?? '';
}

export function describeLeg(minutes: number | null, leg: TripLeg): string {
  if (minutes === null) {
    return leg === 'arriveBy' ? 'No ride there' : 'No ride back';
  }
  return leg === 'arriveBy' ? `Arrive by ${formatTime(minutes)}` : `Leave at ${formatTime(minutes)}`;
}

export function describeWeekdays(days: Weekday[]): string {
  return weekdays
    .filter((weekday) => days.includes(weekday.value))
    .map((weekday) => weekday.short)
    .join(', ');
}

export function describeDays(days: DaySchedule[]): string {
  return describeWeekdays(days.map((schedule) => schedule.day));
}
