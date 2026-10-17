import type { CommuteSchedule, Weekday } from '../commute/commuteModel';

export const MATCHING_TIME_ZONE = 'America/New_York';
export const PICKUP_SERVICE_SECONDS = 120;
// Explicitly selected public access points, never residential addresses.
export const PUBLIC_POINTS = [
  {
    id: 'stony-brook-station',
    label: 'Stony Brook LIRR station',
    coordinate: { latitude: 40.92047, longitude: -73.12844 },
  },
  {
    id: 'port-jefferson-station',
    label: 'Port Jefferson LIRR station',
    coordinate: { latitude: 40.9346, longitude: -73.0524 },
  },
  {
    id: 'smithtown-station',
    label: 'Smithtown LIRR station',
    coordinate: { latitude: 40.8564, longitude: -73.1989 },
  },
  {
    id: 'jamaica-station',
    label: 'Jamaica LIRR station',
    coordinate: { latitude: 40.6997, longitude: -73.8085 },
  },
] as const;
export const CAMPUS_POINTS = [
  {
    id: 'westSide',
    label: 'West Side',
    coordinate: { latitude: 40.9130574, longitude: -73.1304816 },
  },
  {
    id: 'eastSide',
    label: 'East Side',
    coordinate: { latitude: 40.9169623, longitude: -73.1208533 },
  },
  { id: 'tabler', label: 'Tabler', coordinate: { latitude: 40.9097068, longitude: -73.1269548 } },
  { id: 'roth', label: 'Roth', coordinate: { latitude: 40.9107148, longitude: -73.1237186 } },
  { id: 'lot40', label: 'Lot 40', coordinate: { latitude: 40.8958, longitude: -73.1248 } },
] as const;
export interface MinuteWindow {
  earliest: number;
  latest: number;
}
export interface MatchingSetup {
  schemaVersion: 1;
  ownerId: string;
  revision: string;
  commuteKey: string;
  mode: 'driver' | 'rider';
  active: boolean;
  optIn: boolean;
  campusLot: string;
  weekdays: Weekday[];
  pointId: string;
  startWindow: MinuteWindow;
  arrivalWindow: MinuteWindow;
  seatsRequested: number;
  maxDetourSeconds: number;
  maxExtraRideSeconds: number;
  accessWalkSeconds: number;
  egressWalkSeconds: number;
  maxAccessWalkSeconds: number;
  maxEgressWalkSeconds: number;
}
export const WEEKDAYS: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function integer(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}
export function commuteKey(commute: CommuteSchedule): string {
  return JSON.stringify({
    startArea: {
      center: {
        latitude: commute.startArea.center.latitude,
        longitude: commute.startArea.center.longitude,
      },
      radiusMiles: commute.startArea.radiusMiles,
      label: commute.startArea.label,
    },
    campusLot: commute.campusLot,
    days: commute.days
      .map(({ day, mode, arriveBy, leaveAt }) => ({ day, mode, arriveBy, leaveAt }))
      .sort((a, b) => WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day)),
    seats: commute.seats ?? null,
  });
}
export function enabledDays(commute: CommuteSchedule, mode: MatchingSetup['mode']): Weekday[] {
  return commute.days
    .filter(
      (day) =>
        day.arriveBy !== null &&
        (day.mode === 'either' || day.mode === (mode === 'driver' ? 'drive' : 'ride')),
    )
    .map((day) => day.day)
    .sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
}
function window(value: unknown): value is MinuteWindow {
  return (
    record(value) &&
    Object.keys(value).length === 2 &&
    integer(value.earliest, 0, 1439) &&
    integer(value.latest, 0, 1439) &&
    value.earliest <= value.latest
  );
}
export function parseMatchingSetup(value: unknown, ownerId: string): MatchingSetup {
  if (!record(value)) throw new Error('Complete your matching setup.');
  const keys = [
    'schemaVersion',
    'ownerId',
    'revision',
    'commuteKey',
    'mode',
    'active',
    'optIn',
    'campusLot',
    'weekdays',
    'pointId',
    'startWindow',
    'arrivalWindow',
    'seatsRequested',
    'maxDetourSeconds',
    'maxExtraRideSeconds',
    'accessWalkSeconds',
    'egressWalkSeconds',
    'maxAccessWalkSeconds',
    'maxEgressWalkSeconds',
  ];
  if (
    Object.keys(value).some((key) => !keys.includes(key) && key !== 'updatedAt') ||
    keys.some((key) => !(key in value)) ||
    value.schemaVersion !== 1 ||
    value.ownerId !== ownerId ||
    !ownerId ||
    typeof value.revision !== 'string' ||
    value.revision.length < 1 ||
    value.revision.length > 80 ||
    typeof value.commuteKey !== 'string' ||
    value.commuteKey.length < 1 ||
    value.commuteKey.length > 4000 ||
    !['driver', 'rider'].includes(String(value.mode)) ||
    typeof value.active !== 'boolean' ||
    typeof value.optIn !== 'boolean' ||
    !CAMPUS_POINTS.some((point) => point.id === value.campusLot) ||
    !PUBLIC_POINTS.some((point) => point.id === value.pointId) ||
    !Array.isArray(value.weekdays) ||
    value.weekdays.length < 1 ||
    value.weekdays.length > 7 ||
    new Set(value.weekdays).size !== value.weekdays.length ||
    value.weekdays.some((day) => !WEEKDAYS.includes(day as Weekday)) ||
    !window(value.startWindow) ||
    !window(value.arrivalWindow) ||
    !integer(value.seatsRequested, 1, 6) ||
    !integer(value.maxDetourSeconds, 0, 21600) ||
    !integer(value.maxExtraRideSeconds, 0, 21600) ||
    ['accessWalkSeconds', 'egressWalkSeconds', 'maxAccessWalkSeconds', 'maxEgressWalkSeconds'].some(
      (key) => !integer(value[key], 0, 7200),
    )
  ) {
    throw new Error('Matching setup has invalid points, windows, seats or limits.');
  }
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as unknown as MatchingSetup;
}
export function setupMatchesCommute(
  setup: MatchingSetup,
  commute: CommuteSchedule,
  role: string,
): boolean {
  return (
    setup.commuteKey === commuteKey(commute) &&
    setup.campusLot === commute.campusLot &&
    setup.arrivalWindow.latest <=
      Math.min(
        ...commute.days
          .filter((day) => setup.weekdays.includes(day.day))
          .map((day) => day.arriveBy ?? -1),
      ) &&
    (role === setup.mode || role === 'both') &&
    JSON.stringify(setup.weekdays) === JSON.stringify(enabledDays(commute, setup.mode))
  );
}
export function weekdayForDate(localDate: string): Weekday {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw new Error('Choose a valid date (YYYY-MM-DD).');
  const date = new Date(`${localDate}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== localDate)
    throw new Error('Choose a valid date.');
  return WEEKDAYS[date.getUTCDay()];
}
export function localDateAt(epochSeconds: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MATCHING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(epochSeconds * 1000);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
/** New York uses UTC-4/UTC-5; reject DST gaps and folds instead of silently shifting. */
export function localMinuteToEpoch(localDate: string, minute: number): number {
  weekdayForDate(localDate);
  if (!integer(minute, 0, 1439)) throw new Error('Invalid clock time.');
  const utc = Date.parse(`${localDate}T00:00:00Z`) + minute * 60000;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: MATCHING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const candidates = [4, 5]
    .map((offset) => utc + offset * 3600000)
    .filter((time) => {
      const parts = Object.fromEntries(formatter.formatToParts(time).map((p) => [p.type, p.value]));
      return (
        `${parts.year}-${parts.month}-${parts.day}` === localDate &&
        Number(parts.hour) * 60 + Number(parts.minute) === minute
      );
    });
  if (candidates.length !== 1)
    throw new Error('This local time is ambiguous or unavailable because of daylight saving time.');
  return candidates[0] / 1000;
}
