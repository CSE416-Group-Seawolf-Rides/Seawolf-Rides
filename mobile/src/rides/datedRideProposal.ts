import type { CampusLotId } from '../commute/commuteModel';
import type {
  DatedOccurrence,
  FeasiblePairPlan,
  PairMetrics,
  PairTravelEstimates,
  TimeWindow,
} from '../matching/types';

export const DATED_RIDE_PROPOSAL_SCHEMA = 'seawolf-rides/dated-to-campus-proposal';
export const DATED_RIDE_PROPOSAL_VERSION = 1;
export const DATED_RIDE_PROPOSAL_TTL_SECONDS = 30 * 60;

export interface DatedRideProposalV1 {
  schema: typeof DATED_RIDE_PROPOSAL_SCHEMA;
  version: typeof DATED_RIDE_PROPOSAL_VERSION;
  proposalId: string;
  revision: string;
  createdAtEpochSeconds: number;
  expiresAtEpochSeconds: number;
  occurrence: DatedOccurrence & { timeZone: string };
  participants: {
    riderId: string;
    driverId: string;
    offerId: string;
  };
  /** Facts and constraints the participants are being asked to agree to. */
  agreed: {
    requestedSeats: number;
    driverStart: ConfirmedProposalPoint;
    pickup: ConfirmedProposalPoint & { pointId: string };
    campusDropoff: ConfirmedProposalPoint & { campusLot: CampusLotId };
    driverDepartureWindow: TimeWindow;
    driverCampusArrivalWindow: TimeWindow;
    driverPreferredDeparture: number;
    driverMaxExtraDurationSeconds: number;
    driverMaxExtraDurationRatio?: number;
    riderPickupWindow: TimeWindow;
    riderDestinationArrivalWindow: TimeWindow;
    pickupServiceSeconds: number;
    accessWalkSeconds: number;
    egressWalkSeconds: number;
    maxAccessWalkSeconds: number;
    maxEgressWalkSeconds: number;
    maxExtraInVehicleSeconds: number;
  };
  /** Provider-derived values. These are estimates, not participant-entered facts. */
  routingEstimates: {
    evaluatedAtEpochSeconds: number;
    travel: PairTravelEstimates;
    plan: FeasiblePairPlan;
    metrics: PairMetrics;
  };
}

export interface ConfirmedProposalPoint {
  label: string;
  coordinate: { latitude: number; longitude: number };
  accuracy: 'SELECTED_POINT';
}

type ProposalRevisionPayload = Omit<DatedRideProposalV1, 'revision' | 'createdAtEpochSeconds' | 'expiresAtEpochSeconds'>;

export function proposalRevisionFor(proposal: ProposalRevisionPayload): string {
  const {
    revision: _revision,
    createdAtEpochSeconds: _createdAt,
    expiresAtEpochSeconds: _expiresAt,
    ...payload
  } = proposal as DatedRideProposalV1;
  const value = JSON.stringify(payload);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function sealDatedRideProposal(
  payload: ProposalRevisionPayload,
  createdAtEpochSeconds: number,
  ttlSeconds = DATED_RIDE_PROPOSAL_TTL_SECONDS,
): DatedRideProposalV1 {
  return {
    ...payload,
    revision: proposalRevisionFor(payload),
    createdAtEpochSeconds,
    expiresAtEpochSeconds: createdAtEpochSeconds + ttlSeconds,
  };
}

export type ProposalValidationCode =
  | 'UNSUPPORTED_PROPOSAL'
  | 'INVALID_PROPOSAL'
  | 'OUTDATED_PROPOSAL';

export function validateDatedRideProposal(
  proposal: DatedRideProposalV1,
  nowEpochSeconds: number,
): { ok: true } | { ok: false; code: ProposalValidationCode } {
  if (proposal.schema !== DATED_RIDE_PROPOSAL_SCHEMA || proposal.version !== DATED_RIDE_PROPOSAL_VERSION) {
    return { ok: false, code: 'UNSUPPORTED_PROPOSAL' };
  }
  if (
    proposal.occurrence.direction !== 'TO_CAMPUS'
    || !/^\d{4}-\d{2}-\d{2}$/.test(proposal.occurrence.localDate)
    || proposal.occurrence.timeZone.length === 0
    || !Number.isInteger(proposal.agreed.requestedSeats)
    || proposal.agreed.requestedSeats < 1
    || proposal.revision !== proposalRevisionFor(proposal)
  ) {
    return { ok: false, code: 'INVALID_PROPOSAL' };
  }
  if (nowEpochSeconds > proposal.expiresAtEpochSeconds) {
    return { ok: false, code: 'OUTDATED_PROPOSAL' };
  }
  return { ok: true };
}
