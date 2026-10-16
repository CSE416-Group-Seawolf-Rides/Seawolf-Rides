import type { CampusLotId } from '../commute/commuteModel';
import type {
  Coordinates,
  DistanceMeters,
  DurationSeconds,
  EpochSeconds,
  TimeWindow,
  TripDirection,
} from '../matching/types';
import type { DatedRideProposalV1 } from './datedRideProposal';
import type { DriverOccurrenceOverride, DriverOffer, IncomingRequest } from './rideModel';

export const DRIVER_OCCURRENCE_SCHEMA = 'seawolf-rides/driver-occurrence';
export const DRIVER_OCCURRENCE_VERSION = 1;
export const RIDER_INTENT_SCHEMA = 'seawolf-rides/rider-intent';
export const RIDER_INTENT_VERSION = 1;
export const GROUP_ROUTE_PLAN_SCHEMA = 'seawolf-rides/group-route-plan';
export const GROUP_ROUTE_PLAN_VERSION = 1;

export interface ZonedOccurrence {
  localDate: string;
  direction: TripDirection;
  timeZone: string;
}

export interface ConfirmedRoutePoint {
  pointId: string;
  label: string;
  coordinate: Coordinates;
  accuracy: 'SELECTED_POINT';
}

/** One authoritative car contract. Its identity is never inferred from a date. */
export interface DriverOccurrenceV1 {
  schema: typeof DRIVER_OCCURRENCE_SCHEMA;
  version: typeof DRIVER_OCCURRENCE_VERSION;
  id: string;
  offerId: string;
  driverParticipantId: string;
  scenarioNamespace: string;
  generationId: string;
  contractRevision: string;
  occurrence: ZonedOccurrence;
  passengerCapacity: number;
  start: ConfirmedRoutePoint;
  campusDropoff: ConfirmedRoutePoint & { campusLot: CampusLotId };
  departureWindow: TimeWindow;
  preferredDeparture: EpochSeconds;
  campusArrivalWindow: TimeWindow;
  maxExtraDurationSeconds: DurationSeconds;
  maxExtraDurationRatio?: number;
}

export interface RiderIntentV1 {
  schema: typeof RIDER_INTENT_SCHEMA;
  version: typeof RIDER_INTENT_VERSION;
  id: string;
  riderParticipantId: string;
  scenarioNamespace: string;
  generationId: string;
  intentRevision: string;
  occurrence: ZonedOccurrence;
  availability: 'AVAILABLE';
  requestedSeats: number;
  pickup:
    | { status: 'CONFIRMED'; point: ConfirmedRoutePoint }
    | { status: 'UNCONFIRMED'; areaLabel: string; approximateCoordinate?: Coordinates };
  acceptedCampusDropoff: ConfirmedRoutePoint & { campusLot: CampusLotId };
  pickupWindow: TimeWindow;
  destinationArrivalWindow: TimeWindow;
  pickupServiceSeconds: DurationSeconds;
  accessWalkSeconds: DurationSeconds;
  egressWalkSeconds: DurationSeconds;
  maxAccessWalkSeconds: DurationSeconds;
  maxEgressWalkSeconds: DurationSeconds;
  maxExtraInVehicleSeconds: DurationSeconds;
}

/** A request is materialized only by an explicit later action, never by fixture loading. */
export interface OccurrenceRideRequestV1 {
  id: string;
  driverOccurrenceId: string;
  riderIntentId: string;
  riderParticipantId: string;
  proposalId: string;
  proposalRevision: string;
  status: 'PENDING';
}

export interface AcceptedRideMembershipV1 {
  requestId: string;
  driverOccurrenceId: string;
  riderIntentId: string;
  riderParticipantId: string;
  proposalId: string;
  proposalRevision: string;
  requestedSeats: number;
  acceptedAtEpochSeconds: EpochSeconds;
}

export interface GroupRiderPromiseV1 {
  requestId: string;
  proposalId: string;
  proposalRevision: string;
  riderIntentId: string;
  riderParticipantId: string;
  occurrence: ZonedOccurrence;
  requestedSeats: number;
  pickup: ConfirmedRoutePoint;
  acceptedCampusDropoff: ConfirmedRoutePoint & { campusLot: CampusLotId };
  pickupWindow: TimeWindow;
  destinationArrivalWindow: TimeWindow;
  pickupServiceSeconds: DurationSeconds;
  accessWalkSeconds: DurationSeconds;
  egressWalkSeconds: DurationSeconds;
  maxAccessWalkSeconds: DurationSeconds;
  maxEgressWalkSeconds: DurationSeconds;
  maxExtraInVehicleSeconds: DurationSeconds;
}

export interface GroupPickupScheduleV1 {
  requestId: string;
  riderParticipantId: string;
  physicalArrival: EpochSeconds;
  serviceStart: EpochSeconds;
  boardingComplete: EpochSeconds;
  plannedWaitingSeconds: DurationSeconds;
  destinationArrival: EpochSeconds;
  inVehicleDurationSeconds: DurationSeconds;
  extraInVehicleDurationSeconds: DurationSeconds;
}

/**
 * A complete shared-route result. This supplements DatedRideProposalV1; it does
 * not replace or mutate any participant's original pair agreement.
 */
export interface GroupRoutePlanV1 {
  schema: typeof GROUP_ROUTE_PLAN_SCHEMA;
  version: typeof GROUP_ROUTE_PLAN_VERSION;
  id: string;
  revision: string;
  scenarioNamespace: string;
  generationId: string;
  driverOccurrenceId: string;
  driverContractRevision: string;
  occurrence: ZonedOccurrence;
  memberRequestIds: string[];
  memberParticipantIds: string[];
  proposalRevisions: Record<string, string>;
  driverStart: ConfirmedRoutePoint;
  campusDropoff: ConfirmedRoutePoint & { campusLot: CampusLotId };
  riderPromises: GroupRiderPromiseV1[];
  selectedRequestOrder: string[];
  orderRestrictions: {
    fixedRequestOrder?: string[];
    precedence: { beforeRequestId: string; afterRequestId: string }[];
  };
  feasibleDepartureWindow: TimeWindow;
  chosenDeparture: EpochSeconds;
  pickups: GroupPickupScheduleV1[];
  vehicleCampusArrival: EpochSeconds;
  metrics: {
    roadDurationSeconds: DurationSeconds;
    roadDistanceMeters: DistanceMeters;
    serviceDurationSeconds: DurationSeconds;
    waitingDurationSeconds: DurationSeconds;
    elapsedDurationSeconds: DurationSeconds;
    soloReferenceDurationSeconds: DurationSeconds;
    totalAddedDriverDurationSeconds: DurationSeconds;
    incrementalAddedDriverDurationSeconds: DurationSeconds;
  };
  routing: {
    mode: 'FIXTURE' | 'LIVE';
    providerId: string;
    estimateTimestampEpochSeconds: EpochSeconds;
    estimateRevision: string;
    geometryValidity: 'NOT_REQUESTED' | 'VALID' | 'STALE' | 'INVALID';
  };
  searchComplete: boolean;
}

export interface MultiCarScenarioState {
  namespace: string;
  generationId: string;
  offers: DriverOffer[];
  driverOccurrences: DriverOccurrenceV1[];
  riderIntents: RiderIntentV1[];
  pendingRequests: OccurrenceRideRequestV1[];
  acceptedMemberships: AcceptedRideMembershipV1[];
  combinedPlans: GroupRoutePlanV1[];
}

export function getAcceptedMembers(
  state: Pick<MultiCarScenarioState, 'acceptedMemberships'>,
  driverOccurrenceId: string,
): AcceptedRideMembershipV1[] {
  return state.acceptedMemberships.filter(
    (membership) => membership.driverOccurrenceId === driverOccurrenceId,
  );
}

export interface DriverCapacitySelection {
  passengerCapacity: number;
  committedSeats: number;
  remainingSeats: number;
}

export function getDriverCapacity(
  state: Pick<MultiCarScenarioState, 'driverOccurrences' | 'acceptedMemberships'>,
  driverOccurrenceId: string,
): DriverCapacitySelection | null {
  const occurrence = state.driverOccurrences.find((item) => item.id === driverOccurrenceId);
  if (!occurrence) return null;
  const committedSeats = getAcceptedMembers(state, driverOccurrenceId)
    .reduce((total, membership) => total + membership.requestedSeats, 0);
  return {
    passengerCapacity: occurrence.passengerCapacity,
    committedSeats,
    remainingSeats: occurrence.passengerCapacity - committedSeats,
  };
}

export function getRiderCommitment(
  state: Pick<MultiCarScenarioState, 'driverOccurrences' | 'acceptedMemberships'>,
  riderParticipantId: string,
  localDate: string,
  direction: TripDirection,
  timeZone: string,
): AcceptedRideMembershipV1 | null {
  const occurrenceIds = new Set(state.driverOccurrences
    .filter((item) => item.occurrence.localDate === localDate
      && item.occurrence.direction === direction
      && item.occurrence.timeZone === timeZone)
    .map((item) => item.id));
  return state.acceptedMemberships.find((membership) => (
    membership.riderParticipantId === riderParticipantId
    && occurrenceIds.has(membership.driverOccurrenceId)
  )) ?? null;
}

export interface DatedProposalOccurrenceAdapterOptions {
  driverOccurrenceId: string;
  scenarioNamespace: string;
  generationId: string;
  driverContractRevision: string;
  passengerCapacity: number;
}

/** Explicit compatibility adapter for the existing immutable V1 agreement. */
export function driverOccurrenceFromDatedProposal(
  proposal: DatedRideProposalV1,
  options: DatedProposalOccurrenceAdapterOptions,
): DriverOccurrenceV1 {
  return {
    schema: DRIVER_OCCURRENCE_SCHEMA,
    version: DRIVER_OCCURRENCE_VERSION,
    id: options.driverOccurrenceId,
    offerId: proposal.participants.offerId,
    driverParticipantId: proposal.participants.driverId,
    scenarioNamespace: options.scenarioNamespace,
    generationId: options.generationId,
    contractRevision: options.driverContractRevision,
    occurrence: { ...proposal.occurrence },
    passengerCapacity: options.passengerCapacity,
    start: { ...proposal.agreed.driverStart, pointId: `${options.driverOccurrenceId}:start`, coordinate: { ...proposal.agreed.driverStart.coordinate } },
    campusDropoff: { ...proposal.agreed.campusDropoff, pointId: `${options.driverOccurrenceId}:campus`, coordinate: { ...proposal.agreed.campusDropoff.coordinate } },
    departureWindow: { ...proposal.agreed.driverDepartureWindow },
    preferredDeparture: proposal.agreed.driverPreferredDeparture,
    campusArrivalWindow: { ...proposal.agreed.driverCampusArrivalWindow },
    maxExtraDurationSeconds: proposal.agreed.driverMaxExtraDurationSeconds,
    maxExtraDurationRatio: proposal.agreed.driverMaxExtraDurationRatio,
  };
}

/** Checks a pair proposal against the car contract without replacing that contract. */
export function datedProposalMatchesDriverOccurrence(
  proposal: DatedRideProposalV1,
  occurrence: DriverOccurrenceV1,
): boolean {
  return proposal.participants.offerId === occurrence.offerId
    && proposal.participants.driverId === occurrence.driverParticipantId
    && proposal.occurrence.localDate === occurrence.occurrence.localDate
    && proposal.occurrence.direction === occurrence.occurrence.direction
    && proposal.occurrence.timeZone === occurrence.occurrence.timeZone
    && proposal.agreed.campusDropoff.campusLot === occurrence.campusDropoff.campusLot
    && samePoint(proposal.agreed.driverStart, occurrence.start)
    && samePoint(proposal.agreed.campusDropoff, occurrence.campusDropoff)
    && sameWindow(proposal.agreed.driverDepartureWindow, occurrence.departureWindow)
    && sameWindow(proposal.agreed.driverCampusArrivalWindow, occurrence.campusArrivalWindow)
    && proposal.agreed.driverPreferredDeparture === occurrence.preferredDeparture
    && proposal.agreed.driverMaxExtraDurationSeconds === occurrence.maxExtraDurationSeconds
    && proposal.agreed.driverMaxExtraDurationRatio === occurrence.maxExtraDurationRatio;
}

export function driverOccurrenceToLegacyOverride(
  occurrence: DriverOccurrenceV1,
): DriverOccurrenceOverride {
  return {
    id: occurrence.id,
    driverId: occurrence.driverParticipantId,
    localDate: occurrence.occurrence.localDate,
    direction: 'TO_CAMPUS',
    timeZone: occurrence.occurrence.timeZone,
    campusLot: occurrence.campusDropoff.campusLot,
    passengerCapacity: occurrence.passengerCapacity,
    source: 'DEVELOPMENT_TEST',
  };
}

export type IncomingRequestContractAdapter =
  | { status: 'DATED_PROPOSAL'; proposal: DatedRideProposalV1 }
  | { status: 'LEGACY_INCOMPLETE'; requestId: string };

/** Legacy recurring records remain explicit and are not promoted with invented facts. */
export function adaptIncomingRequestContract(
  request: Pick<IncomingRequest, 'id' | 'proposal'>,
): IncomingRequestContractAdapter {
  return request.proposal
    ? { status: 'DATED_PROPOSAL', proposal: request.proposal }
    : { status: 'LEGACY_INCOMPLETE', requestId: request.id };
}

function samePoint(
  left: { coordinate: Coordinates },
  right: { coordinate: Coordinates },
): boolean {
  return left.coordinate.latitude === right.coordinate.latitude
    && left.coordinate.longitude === right.coordinate.longitude;
}

function sameWindow(left: TimeWindow, right: TimeWindow): boolean {
  return left.earliest === right.earliest && left.latest === right.latest;
}
