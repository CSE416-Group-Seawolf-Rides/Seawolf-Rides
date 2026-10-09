import type {
  DatedOccurrence,
  InfeasibleReasonCode,
  PairEvaluation,
  PairEvaluationInput,
  PairMetrics,
  RiderTripInput,
  RoutingAnchor,
  StaticRouteEstimate,
  TimeWindow,
  UnknownReasonCode,
} from './types';

const ISO_LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function unknown(...reasonCodes: UnknownReasonCode[]): PairEvaluation {
  return { status: 'UNKNOWN', reasonCodes };
}

function infeasible(...reasonCodes: InfeasibleReasonCode[]): PairEvaluation {
  return { status: 'INFEASIBLE', reasonCodes };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isValidOccurrence(occurrence: DatedOccurrence | undefined): boolean {
  if (!occurrence) {
    return false;
  }
  if (!ISO_LOCAL_DATE.test(occurrence.localDate)) {
    return false;
  }
  const [year, month, day] = occurrence.localDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    (occurrence.direction === 'TO_CAMPUS' || occurrence.direction === 'FROM_CAMPUS')
  );
}

function isValidWindow(window: TimeWindow | undefined): boolean {
  if (!window) {
    return false;
  }
  return (
    Number.isInteger(window.earliest) &&
    Number.isInteger(window.latest) &&
    window.earliest <= window.latest
  );
}

function isValidAnchor(anchor: RoutingAnchor | undefined): boolean {
  if (!anchor?.coordinate) {
    return false;
  }
  const { latitude, longitude } = anchor.coordinate;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    (anchor.accuracy === 'SELECTED_POINT' || anchor.accuracy === 'APPROXIMATE_AREA')
  );
}

function malformedRiderDuration(rider: RiderTripInput): boolean {
  return ![
    rider.accessWalkSeconds,
    rider.egressWalkSeconds,
    rider.maxAccessWalkSeconds,
    rider.maxEgressWalkSeconds,
    rider.maxExtraInVehicleSeconds,
  ].every(isNonNegativeInteger);
}

function isStaticRouteEstimate(value: unknown): value is StaticRouteEstimate {
  if (typeof value !== 'object' || value === null || !('status' in value)) {
    return false;
  }
  if (value.status === 'MISSING' || value.status === 'UNREACHABLE') {
    return true;
  }
  return (
    value.status === 'AVAILABLE' &&
    'durationSeconds' in value &&
    'distanceMeters' in value &&
    isNonNegativeInteger(value.durationSeconds as number) &&
    isNonNegativeInteger(value.distanceMeters as number)
  );
}

function sameOccurrence(driver: DatedOccurrence, rider: DatedOccurrence): boolean {
  return driver.localDate === rider.localDate && driver.direction === rider.direction;
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}

/**
 * Evaluates one driver and one rider for a dated TO_CAMPUS trip with a shared
 * campus drop-off. Travel is static and the driver does not wait between stops.
 *
 * The rider pickup window already means ready at the pickup anchor, so access
 * walking is checked against its declared limit but is not added to the schedule.
 */
export function evaluatePair(input: PairEvaluationInput): PairEvaluation {
  const { driver, rider, anchors, facts, pickupServiceSeconds, travel } = input;

  if (!isNonEmptyString(driver.userId) || !isNonEmptyString(rider.userId)) {
    return unknown('MALFORMED_USER_ID');
  }
  if (!isValidOccurrence(driver.occurrence) || !isValidOccurrence(rider.occurrence)) {
    return unknown('MALFORMED_OCCURRENCE');
  }
  if (
    !isValidWindow(driver.departureWindow) ||
    !isValidWindow(driver.campusArrivalWindow) ||
    !isValidWindow(rider.pickupWindow) ||
    !isValidWindow(rider.destinationArrivalWindow) ||
    !Number.isInteger(driver.preferredDeparture)
  ) {
    return unknown('MALFORMED_WINDOW');
  }
  if (![anchors?.driverStart, anchors?.riderPickup, anchors?.campusDropoff].every(isValidAnchor)) {
    return unknown('MALFORMED_COORDINATE');
  }
  if (!isNonNegativeInteger(driver.seatsRemaining) || !isPositiveInteger(rider.seatsRequested)) {
    return unknown('MALFORMED_SEAT_COUNT');
  }
  if (
    !isNonNegativeInteger(pickupServiceSeconds) ||
    malformedRiderDuration(rider)
  ) {
    return unknown('MALFORMED_DURATION');
  }
  if (
    !isNonNegativeInteger(driver.maxExtraDurationSeconds) ||
    driver.maxExtraDurationRatio !== undefined &&
      (!Number.isFinite(driver.maxExtraDurationRatio) || driver.maxExtraDurationRatio < 0)
  ) {
    return unknown('MALFORMED_LIMIT');
  }
  if (
    ![
      facts?.driverSkipped,
      facts?.riderSkipped,
      facts?.driverRoleConflict,
      facts?.riderRoleConflict,
      facts?.driverCommitmentConflict,
      facts?.riderCommitmentConflict,
    ].every((fact) => typeof fact === 'boolean')
  ) {
    return unknown('MALFORMED_FACTS');
  }
  const estimates = [travel?.startToPickup, travel?.pickupToCampus, travel?.startToCampus];
  if (estimates.some((estimate) => estimate === undefined)) {
    return unknown('MISSING_TRAVEL_ESTIMATE');
  }
  if (!estimates.every(isStaticRouteEstimate)) {
    return unknown('MALFORMED_TRAVEL_ESTIMATE');
  }

  if (
    driver.occurrence.direction === 'FROM_CAMPUS' ||
    rider.occurrence.direction === 'FROM_CAMPUS'
  ) {
    return unknown('UNSUPPORTED_DIRECTION');
  }
  if (
    anchors.driverStart.accuracy !== 'SELECTED_POINT' ||
    anchors.riderPickup.accuracy !== 'SELECTED_POINT' ||
    anchors.campusDropoff.accuracy !== 'SELECTED_POINT'
  ) {
    return unknown('LOCATION_UNCONFIRMED');
  }
  if (estimates.some((estimate) => estimate?.status === 'MISSING')) {
    return unknown('MISSING_TRAVEL_ESTIMATE');
  }

  if (driver.userId === rider.userId) {
    return infeasible('SELF_MATCH');
  }
  if (!sameOccurrence(driver.occurrence, rider.occurrence)) {
    return infeasible('OCCURRENCE_MISMATCH');
  }
  if (facts.driverSkipped || facts.riderSkipped) {
    return infeasible('SKIPPED_OCCURRENCE');
  }
  if (facts.driverRoleConflict || facts.riderRoleConflict) {
    return infeasible('ROLE_CONFLICT');
  }
  if (facts.driverCommitmentConflict || facts.riderCommitmentConflict) {
    return infeasible('COMMITMENT_CONFLICT');
  }
  if (driver.seatsRemaining < rider.seatsRequested) {
    return infeasible('NO_SEAT');
  }
  if (estimates.some((estimate) => estimate?.status === 'UNREACHABLE')) {
    return infeasible('NO_ROAD_ROUTE');
  }

  // Missing and unreachable estimates returned above, so all three are available.
  const startToPickup = travel.startToPickup as Extract<
    StaticRouteEstimate,
    { status: 'AVAILABLE' }
  >;
  const pickupToCampus = travel.pickupToCampus as Extract<
    StaticRouteEstimate,
    { status: 'AVAILABLE' }
  >;
  const startToCampus = travel.startToCampus as Extract<
    StaticRouteEstimate,
    { status: 'AVAILABLE' }
  >;

  const baseline = startToCampus.durationSeconds;
  if (baseline === 0 && driver.maxExtraDurationRatio !== undefined) {
    return unknown('ZERO_BASELINE_PERCENTAGE_LIMIT');
  }

  const shared =
    startToPickup.durationSeconds + pickupServiceSeconds + pickupToCampus.durationSeconds;
  const driverExtra = shared - baseline;
  if (driverExtra < 0) {
    return unknown('INCONSISTENT_TRAVEL_ESTIMATES');
  }

  const percentageLimit =
    driver.maxExtraDurationRatio === undefined
      ? Number.POSITIVE_INFINITY
      : driver.maxExtraDurationRatio * baseline;
  const activeDriverDetourLimit = Math.min(
    driver.maxExtraDurationSeconds,
    percentageLimit,
  );
  if (driverExtra > activeDriverDetourLimit) {
    return infeasible('DRIVER_DETOUR_LIMIT');
  }

  if (
    rider.accessWalkSeconds > rider.maxAccessWalkSeconds ||
    rider.egressWalkSeconds > rider.maxEgressWalkSeconds
  ) {
    return infeasible('WALK_LIMIT');
  }

  // With one pickup and a common drop-off there are no intermediate rider stops.
  const riderInVehicle = pickupToCampus.durationSeconds;
  const riderExtraInVehicle = 0;
  if (riderExtraInVehicle > rider.maxExtraInVehicleSeconds) {
    return infeasible('RIDER_RIDE_LIMIT');
  }

  const lower = Math.max(
    driver.departureWindow.earliest,
    driver.campusArrivalWindow.earliest - shared,
    rider.pickupWindow.earliest - startToPickup.durationSeconds,
    rider.destinationArrivalWindow.earliest - shared - rider.egressWalkSeconds,
  );
  const upper = Math.min(
    driver.departureWindow.latest,
    driver.campusArrivalWindow.latest - shared,
    rider.pickupWindow.latest - startToPickup.durationSeconds,
    rider.destinationArrivalWindow.latest - shared - rider.egressWalkSeconds,
  );
  if (lower > upper) {
    return infeasible('NO_FEASIBLE_DEPARTURE');
  }

  const departure = clamp(driver.preferredDeparture, lower, upper);
  const pickup = departure + startToPickup.durationSeconds;
  const boardingComplete = pickup + pickupServiceSeconds;
  const vehicleCampusArrival = departure + shared;
  const riderDestinationArrival = vehicleCampusArrival + rider.egressWalkSeconds;
  const sharedDistance = startToPickup.distanceMeters + pickupToCampus.distanceMeters;

  const metrics: PairMetrics = {
    soloDurationSeconds: baseline,
    sharedDurationSeconds: shared,
    driverExtraDurationSeconds: driverExtra,
    activeDriverDetourLimitSeconds: activeDriverDetourLimit,
    riderInVehicleSeconds: riderInVehicle,
    riderExtraInVehicleSeconds: riderExtraInVehicle,
    sharedDistanceMeters: sharedDistance,
    driverExtraDistanceMeters: sharedDistance - startToCampus.distanceMeters,
    accessWalkSeconds: rider.accessWalkSeconds,
    egressWalkSeconds: rider.egressWalkSeconds,
  };

  return {
    status: 'FEASIBLE',
    plan: {
      occurrence: driver.occurrence,
      feasibleDepartureWindow: { earliest: lower, latest: upper },
      departure,
      pickup,
      boardingComplete,
      vehicleCampusArrival,
      riderDestinationArrival,
    },
    metrics,
  };
}
