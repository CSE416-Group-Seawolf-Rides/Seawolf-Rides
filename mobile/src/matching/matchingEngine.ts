import type { CampusLotId, DaySchedule, Weekday } from '../commute/commuteModel';

export type MatchLeg = 'arriveBy' | 'leaveAt';

export type MatchDaySchedule = Pick<DaySchedule, 'day' | 'arriveBy' | 'leaveAt'>;

export interface DriverMatchProfile {
  id: string;
  campusLot: CampusLotId;
  days: MatchDaySchedule[];
  seatsAvailable: number;
  maxDetourMinutes: number;
}

export interface RiderMatchProfile {
  id: string;
  campusLot: CampusLotId;
  days: MatchDaySchedule[];
}

// Routing stays behind an adapter. The matching engine only needs comparable durations,
// which keeps provider credentials and response formats out of product logic.
export interface RouteEstimate {
  directDurationMinutes: number;
  pickupDurationMinutes: number;
}

export interface MatchWeights {
  schedule: number;
  detour: number;
  destination: number;
}

export interface MatchingConfig {
  maxArrivalEarlyMinutes: number;
  maxArrivalLateMinutes: number;
  maxDepartureDifferenceMinutes: number;
  requireSameCampusLot: boolean;
  weights: MatchWeights;
}

export interface MatchingConfigOverrides
  extends Omit<Partial<MatchingConfig>, 'weights'> {
  weights?: Partial<MatchWeights>;
}

export const defaultMatchingConfig: MatchingConfig = {
  maxArrivalEarlyMinutes: 30,
  maxArrivalLateMinutes: 0,
  maxDepartureDifferenceMinutes: 30,
  requireSameCampusLot: false,
  weights: {
    schedule: 50,
    detour: 40,
    destination: 10,
  },
};

export type MatchRejectionCode =
  | 'no-seats'
  | 'destination-mismatch'
  | 'no-schedule-overlap'
  | 'route-unavailable'
  | 'detour-exceeded';

export interface MatchRejection {
  code: MatchRejectionCode;
  message: string;
}

export interface MatchedLeg {
  leg: MatchLeg;
  // Driver time minus rider time. Negative means the driver is earlier.
  differenceMinutes: number;
}

export interface MatchedDay {
  day: Weekday;
  legs: MatchedLeg[];
}

export interface MatchScoreBreakdown {
  schedule: number;
  detour: number;
  destination: number;
  total: number;
}

export interface CommuteMatchResult {
  riderId: string;
  compatible: boolean;
  score: number | null;
  scoreBreakdown: MatchScoreBreakdown | null;
  matchedDays: MatchedDay[];
  requestedLegCount: number;
  matchedLegCount: number;
  addedDetourMinutes: number | null;
  rejections: MatchRejection[];
  explanations: string[];
}

function requestedLegCount(days: MatchDaySchedule[]): number {
  return days.reduce(
    (total, day) =>
      total + Number(day.arriveBy !== null) + Number(day.leaveAt !== null),
    0,
  );
}

function matchingLegs(
  driverDay: MatchDaySchedule,
  riderDay: MatchDaySchedule,
  config: MatchingConfig,
): MatchedLeg[] {
  const legs: MatchedLeg[] = [];

  if (driverDay.arriveBy !== null && riderDay.arriveBy !== null) {
    const differenceMinutes = driverDay.arriveBy - riderDay.arriveBy;
    if (
      differenceMinutes >= -config.maxArrivalEarlyMinutes &&
      differenceMinutes <= config.maxArrivalLateMinutes
    ) {
      legs.push({ leg: 'arriveBy', differenceMinutes });
    }
  }

  if (driverDay.leaveAt !== null && riderDay.leaveAt !== null) {
    const differenceMinutes = driverDay.leaveAt - riderDay.leaveAt;
    if (Math.abs(differenceMinutes) <= config.maxDepartureDifferenceMinutes) {
      legs.push({ leg: 'leaveAt', differenceMinutes });
    }
  }

  return legs;
}

function getMatchedDays(
  driver: DriverMatchProfile,
  rider: RiderMatchProfile,
  config: MatchingConfig,
): MatchedDay[] {
  return rider.days.flatMap((riderDay) => {
    const driverDay = driver.days.find((candidate) => candidate.day === riderDay.day);
    if (!driverDay) {
      return [];
    }
    const legs = matchingLegs(driverDay, riderDay, config);
    return legs.length > 0 ? [{ day: riderDay.day, legs }] : [];
  });
}

function validateConfig(config: MatchingConfig): void {
  const tolerances = [
    config.maxArrivalEarlyMinutes,
    config.maxArrivalLateMinutes,
    config.maxDepartureDifferenceMinutes,
  ];
  const weights = Object.values(config.weights);
  if ([...tolerances, ...weights].some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Matching tolerances and weights must be non-negative finite numbers.');
  }
  if (weights.reduce((total, weight) => total + weight, 0) <= 0) {
    throw new Error('At least one matching weight must be greater than zero.');
  }
}

function mergeConfig(overrides: MatchingConfigOverrides): MatchingConfig {
  const config = {
    ...defaultMatchingConfig,
    ...overrides,
    weights: { ...defaultMatchingConfig.weights, ...overrides.weights },
  };
  validateConfig(config);
  return config;
}

function scorePart(value: number, weight: number): number {
  return Math.round(value * weight * 10) / 10;
}

export function evaluateCommuteMatch(
  driver: DriverMatchProfile,
  rider: RiderMatchProfile,
  routeEstimate: RouteEstimate | null,
  overrides: MatchingConfigOverrides = {},
): CommuteMatchResult {
  const config = mergeConfig(overrides);
  const matchedDays = getMatchedDays(driver, rider, config);
  const requested = requestedLegCount(rider.days);
  const matched = matchedDays.reduce((total, day) => total + day.legs.length, 0);
  const rejections: MatchRejection[] = [];

  if (driver.seatsAvailable <= 0) {
    rejections.push({ code: 'no-seats', message: 'The driver has no seats available.' });
  }
  if (config.requireSameCampusLot && driver.campusLot !== rider.campusLot) {
    rejections.push({
      code: 'destination-mismatch',
      message: 'The campus destinations do not match.',
    });
  }
  if (matched === 0) {
    rejections.push({
      code: 'no-schedule-overlap',
      message: 'No requested trip falls within the schedule tolerances.',
    });
  }

  const routeIsValid =
    routeEstimate !== null &&
    Number.isFinite(routeEstimate.directDurationMinutes) &&
    Number.isFinite(routeEstimate.pickupDurationMinutes) &&
    routeEstimate.directDurationMinutes >= 0 &&
    routeEstimate.pickupDurationMinutes >= 0;
  const addedDetourMinutes = routeIsValid
    ? Math.max(
        0,
        routeEstimate.pickupDurationMinutes - routeEstimate.directDurationMinutes,
      )
    : null;

  if (!routeIsValid) {
    rejections.push({
      code: 'route-unavailable',
      message: 'A valid route estimate is required before this match can be recommended.',
    });
  } else if (addedDetourMinutes! > driver.maxDetourMinutes) {
    rejections.push({
      code: 'detour-exceeded',
      message: `The pickup adds ${addedDetourMinutes} minutes, above the driver's ${driver.maxDetourMinutes}-minute limit.`,
    });
  }

  const compatible = rejections.length === 0;
  if (!compatible) {
    return {
      riderId: rider.id,
      compatible,
      score: null,
      scoreBreakdown: null,
      matchedDays,
      requestedLegCount: requested,
      matchedLegCount: matched,
      addedDetourMinutes,
      rejections,
      explanations: rejections.map((rejection) => rejection.message),
    };
  }

  const scheduleRatio = requested === 0 ? 0 : matched / requested;
  const detourRatio =
    driver.maxDetourMinutes === 0
      ? Number(addedDetourMinutes === 0)
      : 1 - addedDetourMinutes! / driver.maxDetourMinutes;
  const destinationRatio = Number(driver.campusLot === rider.campusLot);
  const rawBreakdown = {
    schedule: scorePart(scheduleRatio, config.weights.schedule),
    detour: scorePart(detourRatio, config.weights.detour),
    destination: scorePart(destinationRatio, config.weights.destination),
  };
  const totalWeight = Object.values(config.weights).reduce(
    (total, weight) => total + weight,
    0,
  );
  const total = Math.round(
    ((rawBreakdown.schedule + rawBreakdown.detour + rawBreakdown.destination) /
      totalWeight) *
      100,
  );
  const explanations = [
    `${matched} of ${requested} requested trip legs fit the schedule.`,
    `Pickup adds ${addedDetourMinutes} minutes of the driver's ${driver.maxDetourMinutes}-minute limit.`,
    driver.campusLot === rider.campusLot
      ? 'Campus destinations match.'
      : 'Campus destinations differ, so no destination bonus was awarded.',
  ];

  return {
    riderId: rider.id,
    compatible,
    score: total,
    scoreBreakdown: { ...rawBreakdown, total },
    matchedDays,
    requestedLegCount: requested,
    matchedLegCount: matched,
    addedDetourMinutes,
    rejections,
    explanations,
  };
}

export function rankRiderMatches(
  driver: DriverMatchProfile,
  riders: RiderMatchProfile[],
  routeEstimates: Readonly<Record<string, RouteEstimate | null | undefined>>,
  overrides: MatchingConfigOverrides = {},
): CommuteMatchResult[] {
  return riders
    .map((rider) =>
      evaluateCommuteMatch(driver, rider, routeEstimates[rider.id] ?? null, overrides),
    )
    .sort(
      (a, b) =>
        Number(b.compatible) - Number(a.compatible) ||
        (b.score ?? -1) - (a.score ?? -1) ||
        (a.addedDetourMinutes ?? Number.POSITIVE_INFINITY) -
          (b.addedDetourMinutes ?? Number.POSITIVE_INFINITY) ||
        a.riderId.localeCompare(b.riderId),
    );
}
