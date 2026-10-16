import {
  evaluateGroupRoute,
  type GroupOrderRestrictions,
  type GroupRouteEvaluation,
} from '../matching/groupRouteEvaluator';
import {
  batchToGroupTravelEstimates,
  type DirectedLegBatchResult,
  type DirectedLegRequest,
  type SelectedGeometryResult,
  type SelectedGeometryOptions,
  type TravelCacheOwnership,
} from '../routing/directedTravelSource';
import type { DatedRideProposalV1 } from './datedRideProposal';
import {
  RIDER_INTENT_SCHEMA,
  RIDER_INTENT_VERSION,
  datedProposalMatchesDriverOccurrence,
  getAcceptedMembers,
  getDriverCapacity,
  getRiderCommitment,
  type AcceptedRideMembershipV1,
  type DriverOccurrenceV1,
  type GroupRiderPromiseV1,
  type GroupRoutePlanV1,
  type MultiCarScenarioState,
  type OccurrenceRideRequestV1,
  type RiderIntentV1,
} from './groupRideContracts';

export const GROUP_ACCEPTANCE_MAX_RETRIES = 1;

export interface GroupPendingProposalV1 {
  requestId: string;
  proposalId: string;
  proposalRevision: string;
  driverOccurrenceId: string;
  driverOfferId: string;
  driverContractRevision: string;
  riderIntentId: string;
  riderIntentRevision: string;
  riderParticipantId: string;
  createdAtEpochSeconds: number;
  expiresAtEpochSeconds: number;
  promise: GroupRiderPromiseV1;
}

export interface MultiCarScenarioStoreData {
  scenario: MultiCarScenarioState;
  pendingProposals: GroupPendingProposalV1[];
  skippedDriverOccurrenceIds: string[];
  cancelledRequestIds: string[];
}

export interface ScenarioSnapshot extends MultiCarScenarioStoreData {
  storeRevision: number;
}

export type GroupAcceptanceCode =
  | 'ACCEPTED'
  | 'REQUEST_NOT_FOUND'
  | 'NOT_PENDING'
  | 'INVALID_PROPOSAL'
  | 'PROPOSAL_EXPIRED'
  | 'WRONG_OCCURRENCE'
  | 'OFFER_CHANGED'
  | 'RIDER_INTENT_CHANGED'
  | 'NO_REMAINING_CAPACITY'
  | 'DUPLICATE_COMMITMENT'
  | 'SCHEDULE_CONFLICT'
  | 'GROUP_INFEASIBLE'
  | 'ROUTING_UNKNOWN'
  | 'GEOMETRY_INVALID'
  | 'ACCEPTED_GROUP_INCOMPLETE'
  | 'GENERATION_CHANGED'
  | 'STALE_RETRY'
  | 'CANCELLED'
  | 'LEGACY_INCOMPLETE';

export type GroupCancellationCode =
  | 'CANCELLED_MEMBERSHIP'
  | 'MEMBERSHIP_NOT_FOUND'
  | 'ACCEPTED_GROUP_INCOMPLETE'
  | 'ROUTING_UNKNOWN'
  | 'GENERATION_CHANGED'
  | 'STALE_RETRY'
  | 'CANCELLED';

export interface GroupAcceptanceResult {
  ok: boolean;
  code: GroupAcceptanceCode;
  message: string;
  attempts: number;
  plan?: GroupRoutePlanV1;
  evaluation?: GroupRouteEvaluation;
  verification?: 'LIVE_GEOMETRY' | 'FIXTURE_SCHEMATIC';
}

export interface GroupCancellationResult {
  ok: boolean;
  code: GroupCancellationCode;
  message: string;
  attempts: number;
  plan?: GroupRoutePlanV1;
}

export interface AcceptanceTravelSource {
  getLegs(
    requests: readonly DirectedLegRequest[],
    ownership: TravelCacheOwnership,
    purpose: 'ACCEPTANCE',
    signal?: AbortSignal,
  ): Promise<DirectedLegBatchResult>;
  recordEvaluation?(evaluation: GroupRouteEvaluation, elapsedMs: number): void;
  routeSelectedGeometry?(options: SelectedGeometryOptions): Promise<SelectedGeometryResult>;
}

export interface AcceptGroupRequestOptions {
  store: MultiCarScenarioStore;
  requestId: string;
  source: AcceptanceTravelSource;
  routingOwnership: TravelCacheOwnership;
  nowEpochSeconds: () => number;
  signal?: AbortSignal;
  maxRetries?: number;
}

export interface CancelGroupMembershipOptions {
  store: MultiCarScenarioStore;
  requestId: string;
  source: AcceptanceTravelSource;
  routingOwnership: TravelCacheOwnership;
  signal?: AbortSignal;
  maxRetries?: number;
}

type SnapshotValidation =
  | {
      ok: true;
      driver: DriverOccurrenceV1;
      intent: RiderIntentV1;
      request: OccurrenceRideRequestV1;
      proposal: GroupPendingProposalV1;
      acceptedPromises: GroupRiderPromiseV1[];
      existingPlan: GroupRoutePlanV1 | null;
    }
  | { ok: false; code: GroupAcceptanceCode; message: string };

/** In-memory demo store. Its compare-and-swap transition is local, not backend authorization. */
export class MultiCarScenarioStore {
  private data: MultiCarScenarioStoreData;
  private revision = 0;

  constructor(data: MultiCarScenarioStoreData) {
    this.data = clone(data);
  }

  snapshot(): ScenarioSnapshot {
    return { ...clone(this.data), storeRevision: this.revision };
  }

  replace(data: MultiCarScenarioStoreData): void {
    this.data = clone(data);
    this.revision += 1;
  }

  setDriverSkipped(driverOccurrenceId: string, skipped: boolean): void {
    const values = new Set(this.data.skippedDriverOccurrenceIds);
    if (skipped) values.add(driverOccurrenceId);
    else values.delete(driverOccurrenceId);
    this.data.skippedDriverOccurrenceIds = [...values];
    this.revision += 1;
  }

  cancelPendingRequest(requestId: string): void {
    this.data.scenario.pendingRequests = this.data.scenario.pendingRequests.filter((item) => item.id !== requestId);
    this.data.pendingProposals = this.data.pendingProposals.filter((item) => item.requestId !== requestId);
    if (!this.data.cancelledRequestIds.includes(requestId)) this.data.cancelledRequestIds.push(requestId);
    this.revision += 1;
  }

  commitAcceptance(options: {
    snapshot: ScenarioSnapshot;
    requestId: string;
    plan: GroupRoutePlanV1;
    acceptedAtEpochSeconds: number;
  }): { ok: true } | { ok: false; code: GroupAcceptanceCode } {
    if (this.data.scenario.generationId !== options.snapshot.scenario.generationId) {
      return { ok: false, code: 'GENERATION_CHANGED' };
    }
    if (this.revision !== options.snapshot.storeRevision) return { ok: false, code: 'STALE_RETRY' };
    const validation = validateSnapshot(this.snapshot(), options.requestId, options.acceptedAtEpochSeconds);
    if (!validation.ok) return { ok: false, code: validation.code };
    if (!samePlanMembership(options.plan, validation.driver, validation.acceptedPromises, validation.proposal.promise)) {
      return { ok: false, code: 'STALE_RETRY' };
    }
    const membership: AcceptedRideMembershipV1 = {
      requestId: validation.request.id,
      driverOccurrenceId: validation.driver.id,
      riderIntentId: validation.intent.id,
      riderParticipantId: validation.intent.riderParticipantId,
      proposalId: validation.proposal.proposalId,
      proposalRevision: validation.proposal.proposalRevision,
      requestedSeats: validation.proposal.promise.requestedSeats,
      acceptedAtEpochSeconds: options.acceptedAtEpochSeconds,
    };
    this.data.scenario.acceptedMemberships.push(membership);
    this.data.scenario.combinedPlans = [
      ...this.data.scenario.combinedPlans.filter((plan) => plan.driverOccurrenceId !== validation.driver.id),
      clone(options.plan),
    ];
    this.data.scenario.pendingRequests = this.data.scenario.pendingRequests.filter((item) => item.id !== options.requestId);
    this.data.pendingProposals = this.data.pendingProposals.filter((item) => item.requestId !== options.requestId);
    this.revision += 1;
    return { ok: true };
  }

  commitCancellation(options: {
    snapshot: ScenarioSnapshot;
    membership: AcceptedRideMembershipV1;
    replacementPlan: GroupRoutePlanV1;
  }): { ok: true } | { ok: false; code: GroupCancellationCode } {
    if (this.data.scenario.generationId !== options.snapshot.scenario.generationId) {
      return { ok: false, code: 'GENERATION_CHANGED' };
    }
    if (this.revision !== options.snapshot.storeRevision) return { ok: false, code: 'STALE_RETRY' };
    const current = this.data.scenario.acceptedMemberships.find((item) => item.requestId === options.membership.requestId);
    if (!current || JSON.stringify(current) !== JSON.stringify(options.membership)) {
      return { ok: false, code: 'MEMBERSHIP_NOT_FOUND' };
    }
    const remaining = this.data.scenario.acceptedMemberships.filter((item) => (
      item.driverOccurrenceId === current.driverOccurrenceId && item.requestId !== current.requestId
    ));
    if (!sameStrings([...options.replacementPlan.memberRequestIds].sort(), remaining.map((item) => item.requestId).sort())) {
      return { ok: false, code: 'STALE_RETRY' };
    }
    const driver = this.data.scenario.driverOccurrences.find((item) => item.id === current.driverOccurrenceId);
    const context = driver && acceptedContext(this.data.scenario, driver);
    if (!driver || !context || !context.ok
      || options.replacementPlan.driverOccurrenceId !== driver.id
      || options.replacementPlan.generationId !== this.data.scenario.generationId
      || options.replacementPlan.driverContractRevision !== driver.contractRevision) {
      return { ok: false, code: 'STALE_RETRY' };
    }
    const expectedPromises = context.promises.filter((item) => item.requestId !== current.requestId)
      .sort((left, right) => left.requestId.localeCompare(right.requestId));
    const actualPromises = [...options.replacementPlan.riderPromises]
      .sort((left, right) => left.requestId.localeCompare(right.requestId));
    if (JSON.stringify(expectedPromises) !== JSON.stringify(actualPromises)) return { ok: false, code: 'STALE_RETRY' };
    this.data.scenario.acceptedMemberships = this.data.scenario.acceptedMemberships.filter((item) => item.requestId !== current.requestId);
    this.data.scenario.combinedPlans = [
      ...this.data.scenario.combinedPlans.filter((plan) => plan.driverOccurrenceId !== current.driverOccurrenceId),
      clone(options.replacementPlan),
    ];
    this.revision += 1;
    return { ok: true };
  }
}

export class GroupAcceptanceService {
  private readonly inFlight = new Map<string, Promise<GroupAcceptanceResult>>();

  accept(options: AcceptGroupRequestOptions): Promise<GroupAcceptanceResult> {
    const key = `${options.routingOwnership.rootGeneration}\u0000${options.requestId}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const work = acceptGroupRequest(options).finally(() => {
      if (this.inFlight.get(key) === work) this.inFlight.delete(key);
    });
    this.inFlight.set(key, work);
    return work;
  }
}

export async function acceptGroupRequest(options: AcceptGroupRequestOptions): Promise<GroupAcceptanceResult> {
  const maxRetries = options.maxRetries ?? GROUP_ACCEPTANCE_MAX_RETRIES;
  if (!Number.isInteger(maxRetries) || maxRetries < 0) return failure('ROUTING_UNKNOWN', 'The retry limit is invalid.', 0);
  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    if (options.signal?.aborted) return failure('CANCELLED', 'Acceptance checking was cancelled.', attempt);
    const snapshot = options.store.snapshot();
    if (snapshot.scenario.generationId !== options.routingOwnership.rootGeneration) {
      return failure('GENERATION_CHANGED', 'The routing generation no longer matches the scenario.', attempt);
    }
    const checkedAt = options.nowEpochSeconds();
    const validation = validateSnapshot(snapshot, options.requestId, checkedAt);
    if (!validation.ok) return failure(validation.code, validation.message, attempt);
    const requests = travelRequests(validation.driver, [...validation.acceptedPromises, validation.proposal.promise]);
    let batch: DirectedLegBatchResult;
    try {
      batch = await options.source.getLegs(requests, options.routingOwnership, 'ACCEPTANCE', options.signal);
    } catch (error) {
      return failure('ROUTING_UNKNOWN', error instanceof Error ? error.message : 'Acceptance routing failed.', attempt);
    }
    if (options.signal?.aborted || batch.status === 'CANCELLED') return failure('CANCELLED', 'Acceptance checking was cancelled.', attempt);
    if (batch.status === 'STALE') return failure('GENERATION_CHANGED', 'Acceptance routing became stale.', attempt);
    const travel = batchToGroupTravelEstimates({
      batch,
      baseline: { from: endpoint(validation.driver.start), to: endpoint(validation.driver.campusDropoff) },
      mode: options.routingOwnership.mode,
      providerId: options.routingOwnership.providerId,
      revision: acceptanceEstimateRevision(options.routingOwnership, batch),
    });
    const currentEvaluation = evaluateMeasured(options.source, {
      driver: validation.driver,
      acceptedMembers: validation.acceptedPromises,
      restrictions: currentRestrictions(validation.existingPlan),
      travel,
    });
    if (currentEvaluation.status !== 'FEASIBLE') {
      return failure('ACCEPTED_GROUP_INCOMPLETE', 'The existing accepted group could not be verified without dropping its promises.', attempt, currentEvaluation);
    }
    const evaluation = evaluateMeasured(options.source, {
      driver: validation.driver,
      acceptedMembers: validation.acceptedPromises,
      candidate: {
        requestId: validation.request.id,
        proposalId: validation.proposal.proposalId,
        proposalRevision: validation.proposal.proposalRevision,
        intent: validation.intent,
      },
      restrictions: proposedRestrictions(validation.existingPlan),
      travel,
      currentPlanElapsedDurationSeconds: currentEvaluation.plan.metrics.elapsedDurationSeconds,
    });
    if (evaluation.status === 'INFEASIBLE') {
      return failure('GROUP_INFEASIBLE', explainEvaluation(evaluation, validation.intent), attempt, evaluation);
    }
    if (evaluation.status === 'UNKNOWN') {
      return failure('ROUTING_UNKNOWN', explainEvaluation(evaluation), attempt, evaluation);
    }

    let plan = evaluation.plan;
    let verification: GroupAcceptanceResult['verification'] = 'FIXTURE_SCHEMATIC';
    if (options.routingOwnership.mode === 'LIVE') {
      if (!options.source.routeSelectedGeometry) {
        return failure('GEOMETRY_INVALID', 'Live acceptance requires selected-route geometry validation.', attempt, evaluation);
      }
      const geometry = await options.source.routeSelectedGeometry({
        driver: validation.driver,
        plan,
        planningTravel: travel,
        ownership: options.routingOwnership,
        signal: options.signal,
      });
      if (options.signal?.aborted) return failure('CANCELLED', 'Acceptance checking was cancelled.', attempt, evaluation);
      if (geometry.status === 'STALE') return failure('GENERATION_CHANGED', geometry.message, attempt, evaluation);
      if (geometry.status === 'STALE_PLAN') {
        return failure('GROUP_INFEASIBLE', 'Current ordered-route metrics no longer fit the group promises.', attempt, geometry.evaluation);
      }
      if (geometry.status === 'UNKNOWN') return failure('GEOMETRY_INVALID', geometry.message, attempt, evaluation);
      plan = geometry.plan;
      verification = 'LIVE_GEOMETRY';
    }

    const committed = options.store.commitAcceptance({
      snapshot,
      requestId: options.requestId,
      plan,
      acceptedAtEpochSeconds: options.nowEpochSeconds(),
    });
    if (committed.ok) {
      return { ok: true, code: 'ACCEPTED', message: 'Membership and the complete group plan were committed together.', attempts: attempt, plan, evaluation, verification };
    }
    if (committed.code === 'GENERATION_CHANGED') return failure('GENERATION_CHANGED', 'The scenario was reset or reloaded during acceptance.', attempt, evaluation);
    if (committed.code !== 'STALE_RETRY') return failure(committed.code, transitionMessage(committed.code), attempt, evaluation);
    if (attempt > maxRetries) return failure('STALE_RETRY', 'State changed during acceptance; retry with a current recommendation.', attempt, evaluation);
  }
  return failure('STALE_RETRY', 'State changed during acceptance.', maxRetries + 1);
}

export async function cancelGroupMembership(options: CancelGroupMembershipOptions): Promise<GroupCancellationResult> {
  const maxRetries = options.maxRetries ?? GROUP_ACCEPTANCE_MAX_RETRIES;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    if (options.signal?.aborted) return cancellationFailure('CANCELLED', 'Cancellation checking was cancelled.', attempt);
    const snapshot = options.store.snapshot();
    if (snapshot.scenario.generationId !== options.routingOwnership.rootGeneration) {
      return cancellationFailure('GENERATION_CHANGED', 'The routing generation no longer matches the scenario.', attempt);
    }
    const membership = snapshot.scenario.acceptedMemberships.find((item) => item.requestId === options.requestId);
    if (!membership) return cancellationFailure('MEMBERSHIP_NOT_FOUND', 'The accepted membership no longer exists.', attempt);
    const driver = snapshot.scenario.driverOccurrences.find((item) => item.id === membership.driverOccurrenceId);
    if (!driver) {
      return cancellationFailure('ACCEPTED_GROUP_INCOMPLETE', 'The accepted plan cannot supply every immutable rider promise.', attempt);
    }
    const context = acceptedContext(snapshot.scenario, driver);
    if (!context.ok || !context.plan) {
      return cancellationFailure('ACCEPTED_GROUP_INCOMPLETE', 'The accepted plan cannot supply every immutable rider promise.', attempt);
    }
    const remaining = context.promises.filter((promise) => promise.requestId !== membership.requestId);
    let batch: DirectedLegBatchResult;
    try {
      batch = await options.source.getLegs(travelRequests(driver, remaining), options.routingOwnership, 'ACCEPTANCE', options.signal);
    } catch {
      return cancellationFailure('ROUTING_UNKNOWN', 'The remaining accepted route could not be refreshed.', attempt);
    }
    if (options.signal?.aborted || batch.status === 'CANCELLED') return cancellationFailure('CANCELLED', 'Cancellation checking was cancelled.', attempt);
    if (batch.status === 'STALE') return cancellationFailure('GENERATION_CHANGED', 'Cancellation routing became stale.', attempt);
    const travel = batchToGroupTravelEstimates({
      batch,
      baseline: { from: endpoint(driver.start), to: endpoint(driver.campusDropoff) },
      mode: options.routingOwnership.mode,
      providerId: options.routingOwnership.providerId,
      revision: acceptanceEstimateRevision(options.routingOwnership, batch),
    });
    const evaluation = evaluateMeasured(options.source, {
      driver,
      acceptedMembers: remaining,
      restrictions: remainingRestrictions(context.plan, membership.requestId),
      travel,
    });
    if (evaluation.status !== 'FEASIBLE') {
      return cancellationFailure('ROUTING_UNKNOWN', 'The remaining accepted promises could not be recomputed safely.', attempt);
    }
    let replacementPlan = evaluation.plan;
    if (options.routingOwnership.mode === 'LIVE') {
      if (!options.source.routeSelectedGeometry) {
        return cancellationFailure('ROUTING_UNKNOWN', 'Live cancellation requires selected-route geometry validation.', attempt);
      }
      const geometry = await options.source.routeSelectedGeometry({
        driver, plan: replacementPlan, planningTravel: travel,
        ownership: options.routingOwnership, signal: options.signal,
      });
      if (geometry.status === 'STALE') return cancellationFailure('GENERATION_CHANGED', geometry.message, attempt);
      if (geometry.status === 'UNKNOWN' || geometry.status === 'STALE_PLAN') {
        return cancellationFailure('ROUTING_UNKNOWN', 'The remaining accepted route could not be validated.', attempt);
      }
      replacementPlan = geometry.plan;
    }
    const committed = options.store.commitCancellation({ snapshot, membership, replacementPlan });
    if (committed.ok) {
      return { ok: true, code: 'CANCELLED_MEMBERSHIP', message: 'Only the selected membership was removed and the remaining plan was recomputed.', attempts: attempt, plan: replacementPlan };
    }
    if (committed.code === 'GENERATION_CHANGED') return cancellationFailure('GENERATION_CHANGED', 'The scenario was reset or reloaded during cancellation.', attempt);
    if (committed.code !== 'STALE_RETRY') return cancellationFailure(committed.code, 'The membership changed before cancellation.', attempt);
    if (attempt > maxRetries) return cancellationFailure('STALE_RETRY', 'State changed during cancellation; retry.', attempt);
  }
  return cancellationFailure('STALE_RETRY', 'State changed during cancellation.', maxRetries + 1);
}

export function createPendingGroupProposal(options: {
  driver: DriverOccurrenceV1;
  intent: RiderIntentV1;
  requestId: string;
  proposalId: string;
  proposalRevision: string;
  createdAtEpochSeconds: number;
  expiresAtEpochSeconds: number;
}): { request: OccurrenceRideRequestV1; proposal: GroupPendingProposalV1 } {
  if (options.intent.pickup.status !== 'CONFIRMED') throw new Error('A pending group proposal requires a confirmed pickup.');
  const request: OccurrenceRideRequestV1 = {
    id: options.requestId,
    driverOccurrenceId: options.driver.id,
    riderIntentId: options.intent.id,
    riderParticipantId: options.intent.riderParticipantId,
    proposalId: options.proposalId,
    proposalRevision: options.proposalRevision,
    status: 'PENDING',
  };
  const promise: GroupRiderPromiseV1 = {
    requestId: options.requestId,
    proposalId: options.proposalId,
    proposalRevision: options.proposalRevision,
    riderIntentId: options.intent.id,
    riderParticipantId: options.intent.riderParticipantId,
    occurrence: { ...options.intent.occurrence },
    requestedSeats: options.intent.requestedSeats,
    pickup: clone(options.intent.pickup.point),
    acceptedCampusDropoff: clone(options.intent.acceptedCampusDropoff),
    pickupWindow: { ...options.intent.pickupWindow },
    destinationArrivalWindow: { ...options.intent.destinationArrivalWindow },
    pickupServiceSeconds: options.intent.pickupServiceSeconds,
    accessWalkSeconds: options.intent.accessWalkSeconds,
    egressWalkSeconds: options.intent.egressWalkSeconds,
    maxAccessWalkSeconds: options.intent.maxAccessWalkSeconds,
    maxEgressWalkSeconds: options.intent.maxEgressWalkSeconds,
    maxExtraInVehicleSeconds: options.intent.maxExtraInVehicleSeconds,
  };
  return { request, proposal: {
    requestId: options.requestId,
    proposalId: options.proposalId,
    proposalRevision: options.proposalRevision,
    driverOccurrenceId: options.driver.id,
    driverOfferId: options.driver.offerId,
    driverContractRevision: options.driver.contractRevision,
    riderIntentId: options.intent.id,
    riderIntentRevision: options.intent.intentRevision,
    riderParticipantId: options.intent.riderParticipantId,
    createdAtEpochSeconds: options.createdAtEpochSeconds,
    expiresAtEpochSeconds: options.expiresAtEpochSeconds,
    promise,
  } };
}

export function groupContractsFromDatedProposal(options: {
  proposal: DatedRideProposalV1;
  requestId: string;
  driver: DriverOccurrenceV1;
  scenarioNamespace: string;
  generationId: string;
}): { intent: RiderIntentV1; request: OccurrenceRideRequestV1; pendingProposal: GroupPendingProposalV1 } | null {
  const { proposal, driver } = options;
  if (!datedProposalMatchesDriverOccurrence(proposal, driver)) return null;
  const intent: RiderIntentV1 = {
    schema: RIDER_INTENT_SCHEMA, version: RIDER_INTENT_VERSION,
    id: `${options.scenarioNamespace}:intent:${proposal.participants.riderId}:${proposal.occurrence.localDate}`,
    riderParticipantId: proposal.participants.riderId,
    scenarioNamespace: options.scenarioNamespace,
    generationId: options.generationId,
    intentRevision: proposal.revision,
    occurrence: { ...proposal.occurrence }, availability: 'AVAILABLE',
    requestedSeats: proposal.agreed.requestedSeats,
    pickup: { status: 'CONFIRMED', point: { ...clone(proposal.agreed.pickup), pointId: proposal.agreed.pickup.pointId } },
    acceptedCampusDropoff: { ...clone(proposal.agreed.campusDropoff), pointId: driver.campusDropoff.pointId },
    pickupWindow: { ...proposal.agreed.riderPickupWindow },
    destinationArrivalWindow: { ...proposal.agreed.riderDestinationArrivalWindow },
    pickupServiceSeconds: proposal.agreed.pickupServiceSeconds,
    accessWalkSeconds: proposal.agreed.accessWalkSeconds,
    egressWalkSeconds: proposal.agreed.egressWalkSeconds,
    maxAccessWalkSeconds: proposal.agreed.maxAccessWalkSeconds,
    maxEgressWalkSeconds: proposal.agreed.maxEgressWalkSeconds,
    maxExtraInVehicleSeconds: proposal.agreed.maxExtraInVehicleSeconds,
  };
  const pending = createPendingGroupProposal({
    driver, intent, requestId: options.requestId,
    proposalId: proposal.proposalId, proposalRevision: proposal.revision,
    createdAtEpochSeconds: proposal.createdAtEpochSeconds,
    expiresAtEpochSeconds: proposal.expiresAtEpochSeconds,
  });
  return { intent, request: pending.request, pendingProposal: pending.proposal };
}

function validateSnapshot(snapshot: ScenarioSnapshot, requestId: string, now: number): SnapshotValidation {
  const request = snapshot.scenario.pendingRequests.find((item) => item.id === requestId);
  if (!request) return { ok: false, code: snapshot.cancelledRequestIds.includes(requestId) ? 'NOT_PENDING' : 'REQUEST_NOT_FOUND', message: 'The pending request no longer exists.' };
  if (request.status !== 'PENDING') return { ok: false, code: 'NOT_PENDING', message: 'The request is no longer pending.' };
  if (snapshot.cancelledRequestIds.includes(requestId)) return { ok: false, code: 'NOT_PENDING', message: 'The request was cancelled.' };
  const proposal = snapshot.pendingProposals.find((item) => item.requestId === requestId);
  if (!proposal || proposal.proposalId !== request.proposalId || proposal.proposalRevision !== request.proposalRevision) {
    return { ok: false, code: 'INVALID_PROPOSAL', message: 'The pending proposal identity or revision does not match.' };
  }
  if (now > proposal.expiresAtEpochSeconds) return { ok: false, code: 'PROPOSAL_EXPIRED', message: 'The pending proposal expired before it could be accepted.' };
  const driver = snapshot.scenario.driverOccurrences.find((item) => item.id === request.driverOccurrenceId);
  if (!driver) return { ok: false, code: 'WRONG_OCCURRENCE', message: 'The driver occurrence no longer exists.' };
  if (snapshot.skippedDriverOccurrenceIds.includes(driver.id)) return { ok: false, code: 'SCHEDULE_CONFLICT', message: 'The driver occurrence is skipped or cancelled.' };
  if (proposal.driverOccurrenceId !== driver.id || proposal.driverOfferId !== driver.offerId
    || proposal.driverContractRevision !== driver.contractRevision) {
    return { ok: false, code: 'OFFER_CHANGED', message: 'The authoritative driver contract changed.' };
  }
  const intent = snapshot.scenario.riderIntents.find((item) => item.id === request.riderIntentId);
  if (!intent || proposal.riderIntentId !== intent.id || proposal.riderIntentRevision !== intent.intentRevision
    || request.riderParticipantId !== intent.riderParticipantId || proposal.riderParticipantId !== intent.riderParticipantId) {
    return { ok: false, code: 'RIDER_INTENT_CHANGED', message: 'The rider intent changed after this proposal was created.' };
  }
  if (!sameOccurrence(intent.occurrence, driver.occurrence) || !sameOccurrence(proposal.promise.occurrence, driver.occurrence)) {
    return { ok: false, code: 'WRONG_OCCURRENCE', message: 'The request occurrence does not match the car occurrence.' };
  }
  if (!proposalMatchesIntent(proposal, intent, driver)) return { ok: false, code: 'INVALID_PROPOSAL', message: 'The immutable proposal promises no longer match the requested agreement.' };
  const commitment = getRiderCommitment(snapshot.scenario, intent.riderParticipantId,
    driver.occurrence.localDate, driver.occurrence.direction, driver.occurrence.timeZone);
  if (commitment) return { ok: false, code: 'DUPLICATE_COMMITMENT', message: 'The rider is already committed to a car for this occurrence.' };
  const capacity = getDriverCapacity(snapshot.scenario, driver.id);
  if (!capacity || proposal.promise.requestedSeats > capacity.remainingSeats) {
    return { ok: false, code: 'NO_REMAINING_CAPACITY', message: 'The exact car occurrence no longer has enough seats.' };
  }
  const context = acceptedContext(snapshot.scenario, driver);
  if (!context.ok) return { ok: false, code: 'ACCEPTED_GROUP_INCOMPLETE', message: context.message };
  return { ok: true, driver, intent, request, proposal, acceptedPromises: context.promises, existingPlan: context.plan };
}

function acceptedContext(state: MultiCarScenarioState, driver: DriverOccurrenceV1):
  | { ok: true; promises: GroupRiderPromiseV1[]; plan: GroupRoutePlanV1 | null }
  | { ok: false; message: string } {
  const memberships = getAcceptedMembers(state, driver.id);
  if (memberships.length === 0) return { ok: true, promises: [], plan: null };
  const ids = memberships.map((item) => item.requestId).sort();
  const plans = state.combinedPlans.filter((plan) => plan.driverOccurrenceId === driver.id
    && plan.generationId === state.generationId && plan.driverContractRevision === driver.contractRevision
    && sameStrings([...plan.memberRequestIds].sort(), ids));
  if (plans.length !== 1) return { ok: false, message: 'Accepted memberships do not have one matching combined plan.' };
  const plan = plans[0];
  const promises = memberships.map((membership) => plan.riderPromises.find((promise) => (
    promise.requestId === membership.requestId && promise.riderIntentId === membership.riderIntentId
    && promise.riderParticipantId === membership.riderParticipantId && promise.proposalId === membership.proposalId
    && promise.proposalRevision === membership.proposalRevision && promise.requestedSeats === membership.requestedSeats
  ))).filter((promise): promise is GroupRiderPromiseV1 => Boolean(promise));
  return promises.length === memberships.length
    ? { ok: true, promises: clone(promises), plan: clone(plan) }
    : { ok: false, message: 'The combined plan is missing at least one accepted immutable promise.' };
}

function proposalMatchesIntent(proposal: GroupPendingProposalV1, intent: RiderIntentV1, driver: DriverOccurrenceV1): boolean {
  if (intent.pickup.status !== 'CONFIRMED') return false;
  const expected = createPendingGroupProposal({
    driver, intent, requestId: proposal.requestId, proposalId: proposal.proposalId,
    proposalRevision: proposal.proposalRevision, createdAtEpochSeconds: proposal.createdAtEpochSeconds,
    expiresAtEpochSeconds: proposal.expiresAtEpochSeconds,
  }).proposal.promise;
  return JSON.stringify(expected) === JSON.stringify(proposal.promise);
}

function travelRequests(driver: DriverOccurrenceV1, promises: readonly GroupRiderPromiseV1[]): DirectedLegRequest[] {
  const pickups = [...new Map(promises.map((promise) => [promise.pickup.pointId, promise.pickup])).values()];
  const requests: DirectedLegRequest[] = [{ from: endpoint(driver.start), to: endpoint(driver.campusDropoff) }];
  for (const pickup of pickups) requests.push({ from: endpoint(driver.start), to: endpoint(pickup) });
  for (const from of pickups) {
    for (const to of pickups) if (from.pointId !== to.pointId) requests.push({ from: endpoint(from), to: endpoint(to) });
    requests.push({ from: endpoint(from), to: endpoint(driver.campusDropoff) });
  }
  return requests;
}

function evaluateMeasured(source: AcceptanceTravelSource, options: Parameters<typeof evaluateGroupRoute>[0]): GroupRouteEvaluation {
  const startedAt = Date.now();
  const result = evaluateGroupRoute(options);
  source.recordEvaluation?.(result, Date.now() - startedAt);
  return result;
}

function currentRestrictions(plan: GroupRoutePlanV1 | null): GroupOrderRestrictions | undefined {
  return plan ? { fixedRequestOrder: plan.selectedRequestOrder } : undefined;
}

function proposedRestrictions(plan: GroupRoutePlanV1 | null): GroupOrderRestrictions | undefined {
  if (!plan) return undefined;
  const precedence = [...plan.orderRestrictions.precedence];
  for (let index = 1; index < plan.selectedRequestOrder.length; index += 1) {
    precedence.push({ beforeRequestId: plan.selectedRequestOrder[index - 1], afterRequestId: plan.selectedRequestOrder[index] });
  }
  return { precedence };
}

function remainingRestrictions(plan: GroupRoutePlanV1, removedRequestId: string): GroupOrderRestrictions | undefined {
  const order = plan.selectedRequestOrder.filter((id) => id !== removedRequestId);
  return order.length > 0 ? { fixedRequestOrder: order } : undefined;
}

function samePlanMembership(
  plan: GroupRoutePlanV1,
  driver: DriverOccurrenceV1,
  accepted: readonly GroupRiderPromiseV1[],
  candidate: GroupRiderPromiseV1,
): boolean {
  const expectedPromises = [...accepted, candidate].sort((left, right) => left.requestId.localeCompare(right.requestId));
  const actualPromises = [...plan.riderPromises].sort((left, right) => left.requestId.localeCompare(right.requestId));
  return plan.driverOccurrenceId === driver.id && plan.generationId === driver.generationId
    && plan.driverContractRevision === driver.contractRevision
    && sameOccurrence(plan.occurrence, driver.occurrence)
    && sameStrings([...plan.memberRequestIds].sort(), expectedPromises.map((item) => item.requestId))
    && JSON.stringify(actualPromises) === JSON.stringify(expectedPromises);
}

function acceptanceEstimateRevision(ownership: TravelCacheOwnership, batch: DirectedLegBatchResult): string {
  return `acceptance:${hash({ ownership, items: batch.items.map((item) => ({
    from: item.request.from.pointId, to: item.request.to.pointId,
    result: item.result.status === 'UNKNOWN' ? { status: item.result.status, code: item.result.code } : item.result.estimate,
  })) })}`;
}

function explainEvaluation(evaluation: GroupRouteEvaluation, intent?: RiderIntentV1): string {
  if (evaluation.status === 'INFEASIBLE' && intent
    && evaluation.reasonCodes.includes('DESTINATION_WINDOW')
    && intent.pickupWindow.earliest + intent.pickupServiceSeconds + intent.egressWalkSeconds
      > intent.destinationArrivalWindow.latest) {
    return 'The rider is not ready for pickup until after their destination-arrival deadline can still be met.';
  }
  return evaluation.status === 'FEASIBLE'
    ? 'The complete group is feasible.'
    : `The complete group was not accepted: ${evaluation.reasonCodes.join(', ')}.`;
}

function failure(code: GroupAcceptanceCode, message: string, attempts: number, evaluation?: GroupRouteEvaluation): GroupAcceptanceResult {
  return { ok: false, code, message, attempts, evaluation };
}

function cancellationFailure(code: GroupCancellationCode, message: string, attempts: number): GroupCancellationResult {
  return { ok: false, code, message, attempts };
}

function transitionMessage(code: GroupAcceptanceCode): string {
  return ({
    REQUEST_NOT_FOUND: 'The request no longer exists.', NOT_PENDING: 'The request is no longer pending.',
    PROPOSAL_EXPIRED: 'The proposal expired.', INVALID_PROPOSAL: 'The proposal changed.',
    WRONG_OCCURRENCE: 'The occurrence changed.', OFFER_CHANGED: 'The driver contract changed.',
    RIDER_INTENT_CHANGED: 'The rider intent changed.', NO_REMAINING_CAPACITY: 'The car no longer has enough seats.',
    DUPLICATE_COMMITMENT: 'The rider is already committed.', SCHEDULE_CONFLICT: 'The occurrence is skipped or cancelled.',
  } as Partial<Record<GroupAcceptanceCode, string>>)[code] ?? 'Acceptance could not be committed.';
}

function endpoint(point: { pointId: string; coordinate: { latitude: number; longitude: number } }) {
  return { pointId: point.pointId, coordinate: { ...point.coordinate } };
}

function sameOccurrence(left: DriverOccurrenceV1['occurrence'], right: DriverOccurrenceV1['occurrence']): boolean {
  return left.localDate === right.localDate && left.direction === right.direction && left.timeZone === right.timeZone;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hash(value: unknown): string {
  const text = JSON.stringify(value);
  let valueHash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    valueHash ^= text.charCodeAt(index);
    valueHash = Math.imul(valueHash, 16777619);
  }
  return (valueHash >>> 0).toString(16).padStart(8, '0');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
