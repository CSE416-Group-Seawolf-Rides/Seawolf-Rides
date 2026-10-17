import type {
  CampusLotId,
  CommuteSchedule,
  DayMode,
  DaySchedule,
  Weekday,
} from '../commute/commuteModel';
import { MAX_SEATS, MIN_SEATS, PRIVACY_RADIUS_MILES } from '../commute/commuteModel';
import type { CommuteRole, OnboardingProfile } from '../onboarding/onboardingModel';

export const USER_DATA_SCHEMA_VERSION = 1;
export const PRIMARY_COMMUTE_ID = 'primary';

export interface UserProfileDocument {
  schemaVersion: 1;
  firstName: string;
  role: CommuteRole;
}

export interface CommuteDocument extends CommuteSchedule {
  schemaVersion: 1;
  ownerId: string;
}

const roles = new Set<CommuteRole>(['driver', 'rider', 'both']);
const weekdays = new Set<Weekday>(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const dayModes = new Set<DayMode>(['drive', 'ride', 'either']);
const campusLots = new Set<CampusLotId>([
  'westSide',
  'eastSide',
  'tabler',
  'roth',
  'lot40',
  'other',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTime(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 24 * 60)
  );
}

function parseDays(value: unknown): DaySchedule[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > weekdays.size) {
    throw new Error('A persisted commute must contain between one and seven days.');
  }

  const seen = new Set<Weekday>();
  const days = value.map((candidate) => {
    if (!isRecord(candidate)) {
      throw new Error('A persisted commute day is malformed.');
    }
    const { day, mode, arriveBy, leaveAt } = candidate;
    if (
      typeof day !== 'string' ||
      !weekdays.has(day as Weekday) ||
      seen.has(day as Weekday) ||
      typeof mode !== 'string' ||
      !dayModes.has(mode as DayMode) ||
      !isTime(arriveBy) ||
      !isTime(leaveAt) ||
      (arriveBy === null && leaveAt === null)
    ) {
      throw new Error('A persisted commute day contains invalid values.');
    }
    seen.add(day as Weekday);
    return { day: day as Weekday, mode: mode as DayMode, arriveBy, leaveAt };
  });

  return days;
}

export function toUserProfileDocument(profile: OnboardingProfile): UserProfileDocument {
  const parsed = parseUserProfileDocument({
    schemaVersion: USER_DATA_SCHEMA_VERSION,
    firstName: profile.firstName,
    role: profile.role,
  });
  return { schemaVersion: USER_DATA_SCHEMA_VERSION, ...parsed };
}

export function parseUserProfileDocument(value: unknown): OnboardingProfile {
  if (!isRecord(value)) {
    throw new Error('The persisted user profile is malformed.');
  }
  const firstName = typeof value.firstName === 'string' ? value.firstName.trim() : '';
  const role = value.role;
  if (
    value.schemaVersion !== USER_DATA_SCHEMA_VERSION ||
    !firstName ||
    firstName.length > 80 ||
    typeof role !== 'string' ||
    !roles.has(role as CommuteRole)
  ) {
    throw new Error('The persisted user profile contains invalid values.');
  }
  return { firstName, role: role as CommuteRole };
}

export function toCommuteDocument(ownerId: string, commute: CommuteSchedule): CommuteDocument {
  return {
    schemaVersion: USER_DATA_SCHEMA_VERSION,
    ownerId,
    ...parseCommuteDocument({
      schemaVersion: USER_DATA_SCHEMA_VERSION,
      ownerId,
      ...commute,
    }, ownerId),
  };
}

export function parseCommuteDocument(value: unknown, expectedOwnerId: string): CommuteSchedule {
  if (!isRecord(value) || value.schemaVersion !== USER_DATA_SCHEMA_VERSION) {
    throw new Error('The persisted commute is malformed or uses an unsupported schema.');
  }
  if (value.ownerId !== expectedOwnerId) {
    throw new Error('The persisted commute does not belong to the signed-in user.');
  }

  const area = value.startArea;
  if (!isRecord(area) || !isRecord(area.center)) {
    throw new Error('The persisted commute has no valid privacy area.');
  }
  const { latitude, longitude } = area.center;
  const label = typeof area.label === 'string' ? area.label.trim() : '';
  if (
    !isFiniteNumber(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !isFiniteNumber(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    area.radiusMiles !== PRIVACY_RADIUS_MILES ||
    !label ||
    label.length > 120
  ) {
    throw new Error('The persisted commute privacy area contains invalid values.');
  }

  const campusLot = value.campusLot;
  if (typeof campusLot !== 'string' || !campusLots.has(campusLot as CampusLotId)) {
    throw new Error('The persisted commute contains an invalid campus destination.');
  }

  const seats = value.seats;
  if (
    seats !== undefined &&
    (!Number.isInteger(seats) || (seats as number) < MIN_SEATS || (seats as number) > MAX_SEATS)
  ) {
    throw new Error('The persisted commute contains an invalid seat count.');
  }

  return {
    startArea: {
      center: { latitude, longitude },
      radiusMiles: PRIVACY_RADIUS_MILES,
      label,
    },
    campusLot: campusLot as CampusLotId,
    days: parseDays(value.days),
    ...(seats === undefined ? {} : { seats: seats as number }),
  };
}
