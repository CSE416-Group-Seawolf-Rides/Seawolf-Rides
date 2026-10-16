import {
  getAcceptedMembers,
  getDriverCapacity,
  getRiderCommitment,
  type AcceptedRideMembershipV1,
  type DriverOccurrenceV1,
  type GroupRiderPromiseV1,
  type GroupRoutePlanV1,
  type MultiCarScenarioState,
  type RiderIntentV1,
} from '../rides/groupRideContracts';
import {
  batchToGroupTravelEstimates,
  type DirectedLegBatchResult,
  type DirectedLegRequest,
  type DirectedTravelPurpose,
  type TravelCacheOwnership,
} from '../routing/directedTravelSource';
import {
  evaluateGroupRoute,
  type GroupEvaluationDiagnostics,
  type GroupOrderRestrictions,
  type GroupRouteEvaluation,
  type GroupTravelEstimates,
} from './groupRouteEvaluator';

export type RecommendationEligibilityReasonCode =
  | 'RIDER_ALREADY_MEMBER'
  | 'RIDER_COMMITTED_TO_ANOTHER_CAR'
  | 'SELF_MATCH'
  | 'STALE_INPUT'
  | 'ACCEPTED_GROUP_INCOMPLETE'
  | 'CURRENT_GROUP_UNRESOLVED';

export type RecommendationReasonCode =
  | RecommendationEligibilityReasonCode
  | 'NO_SEAT'
  | 'OCCURRENCE_MISMATCH'
  | 'CAMPUS_MISMATCH'
  | 'WALK_LIMIT'
  | 'NO_ROAD_ROUTE'
  | 'DRIVER_DETOUR_LIMIT'
  | 'RIDER_RIDE_LIMIT'
  | 'DESTINATION_WINDOW'
  | 'NO_FEASIBLE_SCHEDULE'
  | 'ORDER_RESTRICTION_CONFLICT'
  | 'UNSUPPORTED_DIRECTION'
  | 'LOCATION_UNCONFIRMED'
  | 'MISSING_TRAVEL_ESTIMATE'
  | 'MALFORMED_INPUT'
  | 'MALFORMED_TRAVEL_ESTIMATE'
  | 'ZERO_BASELINE_PERCENTAGE_LIMIT'
  | 'INCONSISTENT_TRAVEL_ESTIMATES'
  | 'SEARCH_LIMIT';

export interface RecommendationOwnership {
  scenarioNamespace: string;
  generationId: string;
  rootGeneration: string;
  inputRevision: string;
  membershipRevision: string;
  driverOccurrenceId: string;
  driverContractRevision: string;
  riderIntentId: string;
  riderIntentRevision: string;
  routingMode: 'FIXTURE' | 'LIVE';
  providerId: string;
  profile: string;
  optionsKey: string;
  estimateVersion: string;
  estimateRevision: string;
}

export interface RecommendationRoutingProvenance {
  mode: 'FIXTURE' | 'LIVE';
  providerId: string;
  profile: string;
  optionsKey: string;
  estimateVersion: string;
  estimateRevision: string;
  evaluatedAtEpochSeconds: number;
}

interface RecommendationBase {
  driverOccurrenceId: string;
  riderIntentId: string;
  riderParticipantId: string;
  requestedSeats: number;
  rank: number | null;
  reasonCodes: RecommendationReasonCode[];
  explanation: string;
  ownership: RecommendationOwnership;
  routing: RecommendationRoutingProvenance;
  search: {
    complete: boolean;
    permittedOrders: number;
    evaluatedOrders: number;
    unresolvedOrders: number;
  };
}

export type GroupRecommendation =
  | RecommendationBase & {
      status: 'FEASIBLE';
      rank: number;
      plan: GroupRoutePlanV1;
      /** Exact estimates used for this plan; retained for lazy selected-route geometry validation. */
      planningTravel: GroupTravelEstimates;
      metrics: {
        incrementalAddedDriverDurationSeconds: number;
        totalAddedDriverDurationSeconds: number;
        riderWalkingSeconds: number;
        feasibleDepartureIntervalSeconds: number;
        currentGroupElapsedDurationSeconds: number;
        proposedGroupElapsedDurationSeconds: number;
      };
    }
  | RecommendationBase & { status: 'INFEASIBLE' | 'UNKNOWN' | 'EXCLUDED'; rank: null };

export interface RecommendationSummary {
  feasible: number;
  infeasible: number;
  unknown: number;
  excluded: number;
}

export type GroupRecommendationRun =
  | {
      status: 'COMPLETE';
      recommendations: GroupRecommendation[];
      summary: RecommendationSummary;
      inputRevision: string;
      membershipRevision: string;
      estimateRevision: string;
      routingBatchStatus: DirectedLegBatchResult['status'];
    }
  | { status: 'STALE' | 'CANCELLED' | 'UNKNOWN'; message: string };

export interface RecommendationTravelSource {
  getLegs(
    requests: readonly DirectedLegRequest[],
    ownership: TravelCacheOwnership,
    purpose: DirectedTravelPurpose,
    signal?: AbortSignal,
  ): Promise<DirectedLegBatchResult>;
  recordEvaluation?(evaluation: GroupRouteEvaluation, elapsedMs: number): void;
}

export interface BuildGroupRecommendationsOptions {
  state: MultiCarScenarioState;
  source: RecommendationTravelSource;
  routingOwnership: TravelCacheOwnership;
  purpose?: DirectedTravelPurpose;
  signal?: AbortSignal;
}

interface DriverContext {
  driver: DriverOccurrenceV1;
  memberships: AcceptedRideMembershipV1[];
  promises: GroupRiderPromiseV1[];
  existingPlan: GroupRoutePlanV1 | null;
  error: RecommendationEligibilityReasonCode | null;
}

/**
 * Computes independent candidate additions. It snapshots its input and never
 * creates requests, memberships, plans in state, reservations, or assignments.
 */
export async function buildGroupRecommendations(
  options: BuildGroupRecommendationsOptions,
): Promise<GroupRecommendationRun> {
  const startingStateRevision = stateRevision(options.state);
  const state = cloneState(options.state);
  const inputRevision = inputRevisionFor(state);
  const membershipRevision = membershipRevisionFor(state);
  if (!validRunInput(state, options.routingOwnership)) {
    return { status: 'UNKNOWN', message: 'Recommendation state or routing ownership is malformed.' };
  }
  if (options.signal?.aborted) return { status: 'CANCELLED', message: 'Recommendation work was cancelled.' };

  const contexts = state.driverOccurrences.map((driver) => resolveDriverContext(state, driver));
  const routableIntents = state.riderIntents.filter((intent) => intent.pickup.status === 'CONFIRMED'
    && contexts.some((context) => safeEligibility(state, context, intent) === null));
  const acceptedPromises = contexts.flatMap((context) => context.promises);
  const requests = createRecommendationLegRequests(
    contexts.filter((context) => context.error === null).map((context) => context.driver),
    [...routableIntents.map((intent) => intent.pickup.status === 'CONFIRMED' ? intent.pickup.point : null)
      .filter((point): point is GroupRiderPromiseV1['pickup'] => point !== null),
    ...acceptedPromises.map((promise) => promise.pickup)],
  );

  let batch: DirectedLegBatchResult;
  try {
    batch = await options.source.getLegs(
      requests,
      options.routingOwnership,
      options.purpose ?? 'DISCOVERY',
      options.signal,
    );
  } catch (error) {
    return {
      status: options.signal?.aborted ? 'CANCELLED' : 'UNKNOWN',
      message: error instanceof Error ? error.message : 'The shared travel source failed.',
    };
  }
  if (batch.status === 'STALE') return { status: 'STALE', message: 'Routing estimates belong to an inactive root generation.' };
  if (batch.status === 'CANCELLED' || options.signal?.aborted) {
    return { status: 'CANCELLED', message: 'Recommendation work was cancelled.' };
  }
  if (stateRevision(options.state) !== startingStateRevision) {
    return { status: 'STALE', message: 'Recommendation inputs changed while routing was in progress.' };
  }

  const estimateRevision = estimateRevisionFor(options.routingOwnership, batch);
  const recommendations: GroupRecommendation[] = [];
  for (const context of contexts) {
    const travel = travelForDriver(context.driver, batch, options.routingOwnership, estimateRevision);
    const current = context.error ? null : evaluateMeasured(options.source, {
      driver: context.driver,
      acceptedMembers: context.promises,
      restrictions: currentRestrictions(context.existingPlan),
      travel,
    });
    for (const intent of state.riderIntents) {
      const ownership = resultOwnership(
        state,
        context.driver,
        intent,
        options.routingOwnership,
        inputRevision,
        membershipRevision,
        estimateRevision,
      );
      const routing = routingProvenance(options.routingOwnership, estimateRevision, travel.evaluatedAtEpochSeconds);
      const eligibility = safeEligibility(state, context, intent);
      if (eligibility) {
        recommendations.push(blockedRecommendation(context.driver, intent, eligibility.status, eligibility.reason, ownership, routing));
        continue;
      }
      if (!current || current.status !== 'FEASIBLE') {
        const reasons = context.error
          ? [context.error]
          : ['CURRENT_GROUP_UNRESOLVED' as const, ...currentReasons(current)];
        recommendations.push(blockedRecommendation(context.driver, intent, 'UNKNOWN', reasons, ownership, routing));
        continue;
      }
      const evaluation = evaluateMeasured(options.source, {
        driver: context.driver,
        acceptedMembers: context.promises,
        candidate: candidateFromIntent(context.driver, intent),
        restrictions: proposedRestrictions(context.existingPlan),
        travel,
        currentPlanElapsedDurationSeconds: current.plan.metrics.elapsedDurationSeconds,
      });
      recommendations.push(fromEvaluation(
        context.driver,
        intent,
        evaluation,
        current.plan.metrics.elapsedDurationSeconds,
        ownership,
        routing,
        travel,
      ));
    }
  }
  const ranked = rankRecommendations(recommendations);
  return {
    status: 'COMPLETE',
    recommendations: ranked,
    summary: summarize(ranked),
    inputRevision,
    membershipRevision,
    estimateRevision,
    routingBatchStatus: batch.status,
  };
}

/** Owns latest-result semantics for consumers that issue overlapping runs. */
export class GroupRecommendationCoordinator {
  private revision = 0;
  private activeController: AbortController | null = null;

  async recommend(options: BuildGroupRecommendationsOptions): Promise<GroupRecommendationRun> {
    this.revision += 1;
    const revision = this.revision;
    this.activeController?.abort();
    const controller = new AbortController();
    this.activeController = controller;
    const forwardAbort = () => controller.abort();
    options.signal?.addEventListener('abort', forwardAbort, { once: true });
    if (options.signal?.aborted) controller.abort();
    try {
      const result = await buildGroupRecommendations({ ...options, signal: controller.signal });
      if (revision !== this.revision) {
        return { status: 'STALE', message: 'A newer recommendation run superseded this result.' };
      }
      return result;
    } catch (error) {
      if (revision !== this.revision) {
        return { status: 'STALE', message: 'A late failure from a superseded recommendation run was ignored.' };
      }
      return { status: 'UNKNOWN', message: error instanceof Error ? error.message : 'Recommendation work failed.' };
    } finally {
      options.signal?.removeEventListener('abort', forwardAbort);
      if (revision === this.revision) this.activeController = null;
    }
  }

  invalidate(): void {
    this.revision += 1;
    this.activeController?.abort();
    this.activeController = null;
  }
}

export function rankRecommendations(recommendations: readonly GroupRecommendation[]): GroupRecommendation[] {
  const ranks = new Map<string, number>();
  const driverIds = [...new Set(recommendations.map((item) => item.driverOccurrenceId))];
  for (const driverId of driverIds) {
    recommendations
      .filter((item): item is Extract<GroupRecommendation, { status: 'FEASIBLE' }> => (
        item.driverOccurrenceId === driverId && item.status === 'FEASIBLE'
      ))
      .sort((left, right) => (
        left.metrics.incrementalAddedDriverDurationSeconds - right.metrics.incrementalAddedDriverDurationSeconds
        || left.metrics.riderWalkingSeconds - right.metrics.riderWalkingSeconds
        || right.metrics.feasibleDepartureIntervalSeconds - left.metrics.feasibleDepartureIntervalSeconds
        || left.riderParticipantId.localeCompare(right.riderParticipantId)
      ))
      .forEach((item, index) => ranks.set(edgeKey(item.driverOccurrenceId, item.riderIntentId), index + 1));
  }
  return recommendations.map((item) => item.status === 'FEASIBLE'
    ? { ...item, rank: ranks.get(edgeKey(item.driverOccurrenceId, item.riderIntentId))! }
    : { ...item, rank: null });
}

function resolveDriverContext(state: MultiCarScenarioState, driver: DriverOccurrenceV1): DriverContext {
  const memberships = getAcceptedMembers(state, driver.id);
  if (memberships.length === 0) return { driver, memberships, promises: [], existingPlan: null, error: null };
  const memberIds = [...memberships.map((item) => item.requestId)].sort();
  const plans = state.combinedPlans.filter((plan) => plan.driverOccurrenceId === driver.id
    && plan.generationId === state.generationId
    && plan.driverContractRevision === driver.contractRevision
    && sameStrings([...plan.memberRequestIds].sort(), memberIds));
  if (plans.length !== 1) {
    return { driver, memberships, promises: [], existingPlan: null, error: 'ACCEPTED_GROUP_INCOMPLETE' };
  }
  const plan = plans[0];
  const promises = memberships.map((membership) => plan.riderPromises.find((promise) => (
    promise.requestId === membership.requestId
    && promise.riderIntentId === membership.riderIntentId
    && promise.riderParticipantId === membership.riderParticipantId
    && promise.proposalId === membership.proposalId
    && promise.proposalRevision === membership.proposalRevision
    && promise.requestedSeats === membership.requestedSeats
  ))).filter((promise): promise is GroupRiderPromiseV1 => Boolean(promise));
  return promises.length === memberships.length
    ? { driver, memberships, promises, existingPlan: plan, error: null }
    : { driver, memberships, promises: [], existingPlan: null, error: 'ACCEPTED_GROUP_INCOMPLETE' };
}

function safeEligibility(
  state: MultiCarScenarioState,
  context: DriverContext,
  intent: RiderIntentV1,
): { status: 'INFEASIBLE' | 'UNKNOWN' | 'EXCLUDED'; reason: RecommendationReasonCode | RecommendationReasonCode[] } | null {
  if (context.error) return { status: 'UNKNOWN', reason: context.error };
  if (intent.scenarioNamespace !== state.namespace || intent.generationId !== state.generationId
    || context.driver.scenarioNamespace !== state.namespace || context.driver.generationId !== state.generationId) {
    return { status: 'UNKNOWN', reason: 'STALE_INPUT' };
  }
  const commitment = getRiderCommitment(
    state,
    intent.riderParticipantId,
    context.driver.occurrence.localDate,
    context.driver.occurrence.direction,
    context.driver.occurrence.timeZone,
  );
  if (commitment) {
    return commitment.driverOccurrenceId === context.driver.id
      ? { status: 'EXCLUDED', reason: 'RIDER_ALREADY_MEMBER' }
      : { status: 'EXCLUDED', reason: 'RIDER_COMMITTED_TO_ANOTHER_CAR' };
  }
  if (intent.riderParticipantId === context.driver.driverParticipantId) {
    return { status: 'INFEASIBLE', reason: 'SELF_MATCH' };
  }
  if (context.driver.occurrence.direction !== 'TO_CAMPUS') {
    return { status: 'UNKNOWN', reason: 'UNSUPPORTED_DIRECTION' };
  }
  if (!sameOccurrence(intent.occurrence, context.driver.occurrence)) {
    return { status: 'INFEASIBLE', reason: 'OCCURRENCE_MISMATCH' };
  }
  if (!sameCampus(intent.acceptedCampusDropoff, context.driver.campusDropoff)) {
    return { status: 'INFEASIBLE', reason: 'CAMPUS_MISMATCH' };
  }
  const capacity = getDriverCapacity(state, context.driver.id);
  if (!capacity || intent.requestedSeats > capacity.remainingSeats) {
    return { status: 'INFEASIBLE', reason: 'NO_SEAT' };
  }
  if (intent.pickup.status !== 'CONFIRMED') return { status: 'UNKNOWN', reason: 'LOCATION_UNCONFIRMED' };
  if (intent.accessWalkSeconds > intent.maxAccessWalkSeconds || intent.egressWalkSeconds > intent.maxEgressWalkSeconds) {
    return { status: 'INFEASIBLE', reason: 'WALK_LIMIT' };
  }
  return null;
}

function createRecommendationLegRequests(
  drivers: readonly DriverOccurrenceV1[],
  rawPickups: readonly GroupRiderPromiseV1['pickup'][],
): DirectedLegRequest[] {
  const pickups = new Map<string, GroupRiderPromiseV1['pickup']>();
  for (const pickup of rawPickups) pickups.set(pickup.pointId, pickup);
  const values = [...pickups.values()];
  const campuses = [...new Map(drivers.map((driver) => [
    driver.campusDropoff.pointId,
    driver.campusDropoff,
  ])).values()];
  const requests: DirectedLegRequest[] = [];
  for (const driver of drivers) {
    requests.push({ from: endpoint(driver.start), to: endpoint(driver.campusDropoff) });
    for (const pickup of values) requests.push({ from: endpoint(driver.start), to: endpoint(pickup) });
  }
  for (const from of values) {
    for (const to of values) if (from.pointId !== to.pointId) requests.push({ from: endpoint(from), to: endpoint(to) });
    for (const campus of campuses) requests.push({ from: endpoint(from), to: endpoint(campus) });
  }
  return requests;
}

function travelForDriver(
  driver: DriverOccurrenceV1,
  batch: DirectedLegBatchResult,
  ownership: TravelCacheOwnership,
  revision: string,
): GroupTravelEstimates {
  return batchToGroupTravelEstimates({
    batch,
    baseline: { from: endpoint(driver.start), to: endpoint(driver.campusDropoff) },
    mode: ownership.mode,
    providerId: ownership.providerId,
    revision,
  });
}

function currentRestrictions(plan: GroupRoutePlanV1 | null): GroupOrderRestrictions | undefined {
  return plan ? { fixedRequestOrder: plan.selectedRequestOrder } : undefined;
}

function proposedRestrictions(plan: GroupRoutePlanV1 | null): GroupOrderRestrictions | undefined {
  if (!plan) return undefined;
  const precedence = [...plan.orderRestrictions.precedence];
  for (let index = 1; index < plan.selectedRequestOrder.length; index += 1) {
    precedence.push({
      beforeRequestId: plan.selectedRequestOrder[index - 1],
      afterRequestId: plan.selectedRequestOrder[index],
    });
  }
  return { precedence: deduplicatePrecedence(precedence) };
}

function candidateFromIntent(driver: DriverOccurrenceV1, intent: RiderIntentV1) {
  const key = stableRevision([driver.id, intent.id, driver.contractRevision, intent.intentRevision]);
  return {
    requestId: `recommendation-request:${key}`,
    proposalId: `recommendation-proposal:${key}`,
    proposalRevision: `recommendation-proposal-revision:${key}`,
    intent,
  };
}

function evaluateMeasured(
  source: RecommendationTravelSource,
  options: Parameters<typeof evaluateGroupRoute>[0],
): GroupRouteEvaluation {
  const startedAt = Date.now();
  const evaluation = evaluateGroupRoute(options);
  source.recordEvaluation?.(evaluation, Date.now() - startedAt);
  return evaluation;
}

function fromEvaluation(
  driver: DriverOccurrenceV1,
  intent: RiderIntentV1,
  evaluation: GroupRouteEvaluation,
  currentElapsed: number,
  ownership: RecommendationOwnership,
  routing: RecommendationRoutingProvenance,
  planningTravel: GroupTravelEstimates,
): GroupRecommendation {
  if (evaluation.status === 'FEASIBLE') {
    const interval = evaluation.plan.feasibleDepartureWindow;
    return {
      status: 'FEASIBLE', driverOccurrenceId: driver.id, riderIntentId: intent.id,
      riderParticipantId: intent.riderParticipantId, requestedSeats: intent.requestedSeats,
      rank: 1, reasonCodes: [], explanation: evaluation.plan.searchComplete
        ? 'The complete accepted group plus this rider has a feasible schedule.'
        : 'A feasible schedule was found, but unresolved pickup orders may have a lower cost.',
      ownership, routing, plan: evaluation.plan, planningTravel,
      metrics: {
        incrementalAddedDriverDurationSeconds: evaluation.plan.metrics.incrementalAddedDriverDurationSeconds,
        totalAddedDriverDurationSeconds: evaluation.plan.metrics.totalAddedDriverDurationSeconds,
        riderWalkingSeconds: intent.accessWalkSeconds + intent.egressWalkSeconds,
        feasibleDepartureIntervalSeconds: interval.latest - interval.earliest,
        currentGroupElapsedDurationSeconds: currentElapsed,
        proposedGroupElapsedDurationSeconds: evaluation.plan.metrics.elapsedDurationSeconds,
      },
      search: searchMetadata(evaluation.diagnostics, evaluation.plan.searchComplete),
    };
  }
  return {
    status: evaluation.status, driverOccurrenceId: driver.id, riderIntentId: intent.id,
    riderParticipantId: intent.riderParticipantId, requestedSeats: intent.requestedSeats,
    rank: null, reasonCodes: evaluation.reasonCodes, explanation: explain(evaluation.reasonCodes, intent),
    ownership, routing, search: searchMetadata(evaluation.diagnostics, evaluation.diagnostics.unresolvedOrders === 0),
  };
}

function blockedRecommendation(
  driver: DriverOccurrenceV1,
  intent: RiderIntentV1,
  status: 'INFEASIBLE' | 'UNKNOWN' | 'EXCLUDED',
  reason: RecommendationReasonCode | RecommendationReasonCode[],
  ownership: RecommendationOwnership,
  routing: RecommendationRoutingProvenance,
): GroupRecommendation {
  const reasonCodes = Array.isArray(reason) ? reason : [reason];
  return {
    status, driverOccurrenceId: driver.id, riderIntentId: intent.id,
    riderParticipantId: intent.riderParticipantId, requestedSeats: intent.requestedSeats,
    rank: null, reasonCodes, explanation: explain(reasonCodes), ownership, routing,
    search: { complete: status !== 'UNKNOWN', permittedOrders: 0, evaluatedOrders: 0, unresolvedOrders: 0 },
  };
}

function resultOwnership(
  state: MultiCarScenarioState,
  driver: DriverOccurrenceV1,
  intent: RiderIntentV1,
  routing: TravelCacheOwnership,
  inputRevision: string,
  membershipRevision: string,
  estimateRevision: string,
): RecommendationOwnership {
  return {
    scenarioNamespace: state.namespace, generationId: state.generationId,
    rootGeneration: routing.rootGeneration, inputRevision, membershipRevision,
    driverOccurrenceId: driver.id, driverContractRevision: driver.contractRevision,
    riderIntentId: intent.id, riderIntentRevision: intent.intentRevision,
    routingMode: routing.mode, providerId: routing.providerId, profile: routing.profile,
    optionsKey: routing.optionsKey, estimateVersion: routing.estimateVersion, estimateRevision,
  };
}

function routingProvenance(
  ownership: TravelCacheOwnership,
  estimateRevision: string,
  evaluatedAtEpochSeconds: number,
): RecommendationRoutingProvenance {
  return {
    mode: ownership.mode, providerId: ownership.providerId, profile: ownership.profile,
    optionsKey: ownership.optionsKey, estimateVersion: ownership.estimateVersion,
    estimateRevision, evaluatedAtEpochSeconds,
  };
}

function searchMetadata(diagnostics: GroupEvaluationDiagnostics, complete: boolean) {
  return {
    complete, permittedOrders: diagnostics.permittedOrders,
    evaluatedOrders: diagnostics.evaluatedOrders, unresolvedOrders: diagnostics.unresolvedOrders,
  };
}

function edgeKey(driverId: string, intentId: string): string {
  return `${driverId}\u0000${intentId}`;
}

function summarize(items: readonly GroupRecommendation[]): RecommendationSummary {
  return items.reduce((summary, item) => {
    if (item.status === 'FEASIBLE') summary.feasible += 1;
    else if (item.status === 'INFEASIBLE') summary.infeasible += 1;
    else if (item.status === 'UNKNOWN') summary.unknown += 1;
    else summary.excluded += 1;
    return summary;
  }, { feasible: 0, infeasible: 0, unknown: 0, excluded: 0 });
}

function currentReasons(evaluation: GroupRouteEvaluation | null): RecommendationReasonCode[] {
  return evaluation && evaluation.status !== 'FEASIBLE' ? evaluation.reasonCodes : [];
}

function explain(reasonCodes: readonly RecommendationReasonCode[], intent?: RiderIntentV1): string {
  const messages: Partial<Record<RecommendationReasonCode, string>> = {
    RIDER_ALREADY_MEMBER: 'This rider is already a member of this car.',
    RIDER_COMMITTED_TO_ANOTHER_CAR: 'This rider is already committed to another car for this occurrence.',
    NO_SEAT: 'This car does not have enough remaining seats for the rider party.',
    LOCATION_UNCONFIRMED: 'An exact confirmed pickup point is required before routing.',
    CURRENT_GROUP_UNRESOLVED: 'The current accepted group could not be verified on the same routing estimates.',
    ACCEPTED_GROUP_INCOMPLETE: 'Accepted membership promises or their combined plan are incomplete.',
    MISSING_TRAVEL_ESTIMATE: 'At least one required directed travel estimate is missing.',
    DRIVER_DETOUR_LIMIT: 'The complete route exceeds the driver’s total detour limit.',
    NO_FEASIBLE_SCHEDULE: 'No permitted pickup order satisfies every member’s schedule.',
  };
  if (intent && reasonCodes.includes('DESTINATION_WINDOW')
    && intent.pickupWindow.earliest + intent.pickupServiceSeconds + intent.egressWalkSeconds
      > intent.destinationArrivalWindow.latest) {
    return 'The rider is not ready for pickup until after their destination-arrival deadline can still be met.';
  }
  return reasonCodes.map((code) => messages[code] ?? code.toLowerCase().replaceAll('_', ' ')).join(' ');
}

function estimateRevisionFor(ownership: TravelCacheOwnership, batch: DirectedLegBatchResult): string {
  return `recommendation-estimates:${stableRevision({
    ownership,
    items: batch.items.map((item) => ({
      from: item.request.from.pointId, to: item.request.to.pointId,
      result: item.result.status === 'UNKNOWN'
        ? { status: item.result.status, code: item.result.code }
        : { status: item.result.status, estimate: item.result.estimate, at: item.result.evaluatedAtEpochSeconds },
    })),
  })}`;
}

function inputRevisionFor(state: MultiCarScenarioState): string {
  return `recommendation-inputs:${stableRevision({
    namespace: state.namespace, generationId: state.generationId,
    drivers: state.driverOccurrences,
    intents: state.riderIntents,
  })}`;
}

function membershipRevisionFor(state: MultiCarScenarioState): string {
  return `recommendation-memberships:${stableRevision({
    memberships: [...state.acceptedMemberships].sort((a, b) => a.requestId.localeCompare(b.requestId)),
    plans: [...state.combinedPlans].sort((a, b) => a.id.localeCompare(b.id)),
  })}`;
}

function stateRevision(state: MultiCarScenarioState): string {
  return stableRevision({
    input: inputRevisionFor(state), membership: membershipRevisionFor(state),
  });
}

function stableRevision(value: unknown): string {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function validRunInput(state: MultiCarScenarioState, ownership: TravelCacheOwnership): boolean {
  return Boolean(state) && typeof state.namespace === 'string' && state.namespace.length > 0
    && typeof state.generationId === 'string' && state.generationId.length > 0
    && Array.isArray(state.driverOccurrences) && Array.isArray(state.riderIntents)
    && Array.isArray(state.acceptedMemberships) && Array.isArray(state.combinedPlans)
    && (ownership.mode === 'FIXTURE' || ownership.mode === 'LIVE')
    && [ownership.providerId, ownership.profile, ownership.optionsKey,
      ownership.rootGeneration, ownership.estimateVersion].every((value) => typeof value === 'string' && value.length > 0);
}

function cloneState(state: MultiCarScenarioState): MultiCarScenarioState {
  return JSON.parse(JSON.stringify(state)) as MultiCarScenarioState;
}

function endpoint(point: GroupRiderPromiseV1['pickup']): { pointId: string; coordinate: { latitude: number; longitude: number } } {
  return { pointId: point.pointId, coordinate: { ...point.coordinate } };
}

function sameOccurrence(left: DriverOccurrenceV1['occurrence'], right: DriverOccurrenceV1['occurrence']): boolean {
  return left.localDate === right.localDate && left.direction === right.direction && left.timeZone === right.timeZone;
}

function sameCampus(left: RiderIntentV1['acceptedCampusDropoff'], right: DriverOccurrenceV1['campusDropoff']): boolean {
  return left.campusLot === right.campusLot && left.pointId === right.pointId
    && left.coordinate.latitude === right.coordinate.latitude
    && left.coordinate.longitude === right.coordinate.longitude;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function deduplicatePrecedence(
  values: readonly { beforeRequestId: string; afterRequestId: string }[],
): { beforeRequestId: string; afterRequestId: string }[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.beforeRequestId}\u0000${value.afterRequestId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((value) => ({ ...value }));
}
