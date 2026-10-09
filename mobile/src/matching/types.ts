/** Integer Unix timestamp in seconds. */
export type EpochSeconds = number;

/** Integer elapsed time in seconds. */
export type DurationSeconds = number;

/** Integer road distance in meters. */
export type DistanceMeters = number;

export type TripDirection = 'TO_CAMPUS' | 'FROM_CAMPUS';

export interface DatedOccurrence {
  /** Local calendar date in YYYY-MM-DD form. */
  localDate: string;
  direction: TripDirection;
}

export interface TimeWindow {
  earliest: EpochSeconds;
  latest: EpochSeconds;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type RoutingAnchorAccuracy = 'SELECTED_POINT' | 'APPROXIMATE_AREA';

export interface RoutingAnchor {
  coordinate: Coordinates;
  accuracy: RoutingAnchorAccuracy;
}

export interface DriverTripInput {
  userId: string;
  occurrence: DatedOccurrence;
  departureWindow: TimeWindow;
  campusArrivalWindow: TimeWindow;
  preferredDeparture: EpochSeconds;
  seatsRemaining: number;
  /** Required absolute cap on added driver travel time. */
  maxExtraDurationSeconds: DurationSeconds;
  /** Optional fraction of the solo baseline, e.g. 0.3 for 30%. */
  maxExtraDurationRatio?: number;
}

export interface RiderTripInput {
  userId: string;
  occurrence: DatedOccurrence;
  /** The rider is already ready at P during this window. */
  pickupWindow: TimeWindow;
  /** Arrival at the rider's actual destination, after the campus walk. */
  destinationArrivalWindow: TimeWindow;
  seatsRequested: number;
  accessWalkSeconds: DurationSeconds;
  egressWalkSeconds: DurationSeconds;
  maxAccessWalkSeconds: DurationSeconds;
  maxEgressWalkSeconds: DurationSeconds;
  maxExtraInVehicleSeconds: DurationSeconds;
}

export interface PairRoutingAnchors {
  driverStart: RoutingAnchor;
  riderPickup: RoutingAnchor;
  /** One mutually accepted vehicle drop-off for both people. */
  campusDropoff: RoutingAnchor;
}

export interface PairOccurrenceFacts {
  driverSkipped: boolean;
  riderSkipped: boolean;
  driverRoleConflict: boolean;
  riderRoleConflict: boolean;
  driverCommitmentConflict: boolean;
  riderCommitmentConflict: boolean;
}

export type StaticRouteEstimate =
  | {
      status: 'AVAILABLE';
      durationSeconds: DurationSeconds;
      distanceMeters: DistanceMeters;
    }
  | { status: 'UNREACHABLE' }
  | { status: 'MISSING' };

export interface PairTravelEstimates {
  startToPickup: StaticRouteEstimate;
  pickupToCampus: StaticRouteEstimate;
  startToCampus: StaticRouteEstimate;
}

export interface PairEvaluationInput {
  driver: DriverTripInput;
  rider: RiderTripInput;
  anchors: PairRoutingAnchors;
  facts: PairOccurrenceFacts;
  pickupServiceSeconds: DurationSeconds;
  travel: PairTravelEstimates;
}

export type InfeasibleReasonCode =
  | 'SELF_MATCH'
  | 'OCCURRENCE_MISMATCH'
  | 'SKIPPED_OCCURRENCE'
  | 'ROLE_CONFLICT'
  | 'COMMITMENT_CONFLICT'
  | 'NO_SEAT'
  | 'NO_ROAD_ROUTE'
  | 'WALK_LIMIT'
  | 'DRIVER_DETOUR_LIMIT'
  | 'RIDER_RIDE_LIMIT'
  | 'NO_FEASIBLE_DEPARTURE';

export type UnknownReasonCode =
  | 'UNSUPPORTED_DIRECTION'
  | 'LOCATION_UNCONFIRMED'
  | 'MISSING_TRAVEL_ESTIMATE'
  | 'MALFORMED_USER_ID'
  | 'MALFORMED_OCCURRENCE'
  | 'MALFORMED_WINDOW'
  | 'MALFORMED_COORDINATE'
  | 'MALFORMED_SEAT_COUNT'
  | 'MALFORMED_DURATION'
  | 'MALFORMED_LIMIT'
  | 'MALFORMED_FACTS'
  | 'MALFORMED_TRAVEL_ESTIMATE'
  | 'ZERO_BASELINE_PERCENTAGE_LIMIT'
  | 'INCONSISTENT_TRAVEL_ESTIMATES';

export interface PairMetrics {
  soloDurationSeconds: DurationSeconds;
  sharedDurationSeconds: DurationSeconds;
  driverExtraDurationSeconds: DurationSeconds;
  activeDriverDetourLimitSeconds: DurationSeconds;
  riderInVehicleSeconds: DurationSeconds;
  riderExtraInVehicleSeconds: DurationSeconds;
  sharedDistanceMeters: DistanceMeters;
  driverExtraDistanceMeters: DistanceMeters;
  accessWalkSeconds: DurationSeconds;
  egressWalkSeconds: DurationSeconds;
}

export interface FeasiblePairPlan {
  occurrence: DatedOccurrence;
  feasibleDepartureWindow: TimeWindow;
  departure: EpochSeconds;
  pickup: EpochSeconds;
  boardingComplete: EpochSeconds;
  vehicleCampusArrival: EpochSeconds;
  riderDestinationArrival: EpochSeconds;
}

export type PairEvaluation =
  | {
      status: 'FEASIBLE';
      plan: FeasiblePairPlan;
      metrics: PairMetrics;
    }
  | {
      status: 'INFEASIBLE';
      reasonCodes: InfeasibleReasonCode[];
    }
  | {
      status: 'UNKNOWN';
      reasonCodes: UnknownReasonCode[];
    };
