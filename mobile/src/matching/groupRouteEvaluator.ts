import type { StaticRouteEstimate } from './types';
import {
  DRIVER_OCCURRENCE_SCHEMA,
  DRIVER_OCCURRENCE_VERSION,
  GROUP_ROUTE_PLAN_SCHEMA,
  GROUP_ROUTE_PLAN_VERSION,
  type ConfirmedRoutePoint,
  type DriverOccurrenceV1,
  type GroupRiderPromiseV1,
  type GroupRoutePlanV1,
  type RiderIntentV1,
} from '../rides/groupRideContracts';

export const GROUP_ROUTE_MAX_STOPS = 4;
export const GROUP_ROUTE_MAX_ORDERS = 24;

export interface DirectedGroupTravelLeg {
  fromPointId: string;
  toPointId: string;
  estimate: StaticRouteEstimate;
}

export interface GroupTravelEstimates {
  solo: StaticRouteEstimate;
  legs: readonly DirectedGroupTravelLeg[];
  mode: 'FIXTURE' | 'LIVE';
  providerId: string;
  evaluatedAtEpochSeconds: number;
  revision: string;
}

export interface GroupOrderRestrictions {
  fixedRequestOrder?: readonly string[];
  precedence?: readonly { beforeRequestId: string; afterRequestId: string }[];
}

export interface GroupCandidateInput {
  requestId: string;
  proposalId: string;
  proposalRevision: string;
  intent: RiderIntentV1;
}

export interface EvaluateGroupRouteOptions {
  driver: DriverOccurrenceV1;
  acceptedMembers: readonly GroupRiderPromiseV1[];
  candidate?: GroupCandidateInput;
  restrictions?: GroupOrderRestrictions;
  travel: GroupTravelEstimates;
  /** Elapsed duration of the accepted group before adding candidate. */
  currentPlanElapsedDurationSeconds?: number;
  maxStops?: number;
  maxOrders?: number;
}

export type GroupInfeasibleReasonCode =
  | 'NO_SEAT'
  | 'OCCURRENCE_MISMATCH'
  | 'CAMPUS_MISMATCH'
  | 'WALK_LIMIT'
  | 'NO_ROAD_ROUTE'
  | 'DRIVER_DETOUR_LIMIT'
  | 'RIDER_RIDE_LIMIT'
  | 'DESTINATION_WINDOW'
  | 'NO_FEASIBLE_SCHEDULE'
  | 'ORDER_RESTRICTION_CONFLICT';

export type GroupUnknownReasonCode =
  | 'UNSUPPORTED_DIRECTION'
  | 'LOCATION_UNCONFIRMED'
  | 'MISSING_TRAVEL_ESTIMATE'
  | 'MALFORMED_INPUT'
  | 'MALFORMED_TRAVEL_ESTIMATE'
  | 'ZERO_BASELINE_PERCENTAGE_LIMIT'
  | 'INCONSISTENT_TRAVEL_ESTIMATES'
  | 'SEARCH_LIMIT';

export interface GroupEvaluationDiagnostics {
  permittedOrders: number;
  evaluatedOrders: number;
  unresolvedOrders: number;
  maxStops: number;
  maxOrders: number;
}

export type GroupRouteEvaluation =
  | {
      status: 'FEASIBLE';
      plan: GroupRoutePlanV1;
      diagnostics: GroupEvaluationDiagnostics;
    }
  | {
      status: 'INFEASIBLE';
      reasonCodes: GroupInfeasibleReasonCode[];
      diagnostics: GroupEvaluationDiagnostics;
    }
  | {
      status: 'UNKNOWN';
      reasonCodes: GroupUnknownReasonCode[];
      diagnostics: GroupEvaluationDiagnostics;
    };

interface AvailableEstimate {
  status: 'AVAILABLE';
  durationSeconds: number;
  distanceMeters: number;
}

interface FixedOrderSolution {
  order: GroupRiderPromiseV1[];
  feasibleDepartureWindow: { earliest: number; latest: number };
  departure: number;
  campusArrival: number;
  pickupServiceStarts: number[];
  physicalArrivals: number[];
  elapsedDurationSeconds: number;
  roadDurationSeconds: number;
  roadDistanceMeters: number;
  serviceDurationSeconds: number;
  waitingDurationSeconds: number;
  totalAddedDriverDurationSeconds: number;
  activeDriverDetourLimitSeconds: number;
  preferredDepartureDistanceSeconds: number;
}

type FixedOrderResult =
  | { status: 'FEASIBLE'; solution: FixedOrderSolution }
  | { status: 'INFEASIBLE'; reasonCodes: GroupInfeasibleReasonCode[] }
  | { status: 'UNKNOWN'; reasonCodes: GroupUnknownReasonCode[] };

interface Edge {
  from: number;
  to: number;
  maximumDifference: number;
}

interface TemporalClosure {
  distances: number[][];
}

/** Pure bounded evaluator for one authoritative TO_CAMPUS car. */
export function evaluateGroupRoute(options: EvaluateGroupRouteOptions): GroupRouteEvaluation {
  const maxStops = options?.maxStops ?? GROUP_ROUTE_MAX_STOPS;
  const maxOrders = options?.maxOrders ?? GROUP_ROUTE_MAX_ORDERS;
  const emptyDiagnostics = diagnostics(0, 0, 0, maxStops, maxOrders);
  if (!options || !Array.isArray(options.acceptedMembers)
    || !validBound(maxStops, GROUP_ROUTE_MAX_STOPS) || !validBound(maxOrders, GROUP_ROUTE_MAX_ORDERS) || !validDriver(options.driver)
    || !validTravelMetadata(options.travel)
    || options.currentPlanElapsedDurationSeconds !== undefined
      && !nonnegativeInteger(options.currentPlanElapsedDurationSeconds)) {
    return unknown(['MALFORMED_INPUT'], emptyDiagnostics);
  }
  if (options.driver.occurrence.direction !== 'TO_CAMPUS') {
    return unknown(['UNSUPPORTED_DIRECTION'], emptyDiagnostics);
  }
  const candidate = options.candidate ? promiseFromCandidate(options.candidate) : null;
  if (candidate?.status === 'UNKNOWN') {
    return unknown(candidate.reasonCodes, emptyDiagnostics);
  }
  const members = [...options.acceptedMembers, ...(candidate?.status === 'READY' ? [candidate.promise] : [])];
  if (!members.every(validPromise) || hasDuplicateMembers(members)) {
    return unknown(['MALFORMED_INPUT'], emptyDiagnostics);
  }
  if (members.length > maxStops) {
    return unknown(['SEARCH_LIMIT'], emptyDiagnostics);
  }
  if (members.some((member) => !sameOccurrence(member.occurrence, options.driver.occurrence))) {
    return infeasible(['OCCURRENCE_MISMATCH'], emptyDiagnostics);
  }
  if (members.some((member) => !sameCampus(member.acceptedCampusDropoff, options.driver.campusDropoff))) {
    return infeasible(['CAMPUS_MISMATCH'], emptyDiagnostics);
  }
  const seats = members.reduce((total, member) => total + member.requestedSeats, 0);
  if (seats > options.driver.passengerCapacity) {
    return infeasible(['NO_SEAT'], emptyDiagnostics);
  }
  if (members.some((member) => member.accessWalkSeconds > member.maxAccessWalkSeconds
    || member.egressWalkSeconds > member.maxEgressWalkSeconds)) {
    return infeasible(['WALK_LIMIT'], emptyDiagnostics);
  }
  if (members.some((member) => (
    member.pickupWindow.earliest + member.pickupServiceSeconds + member.egressWalkSeconds
      > member.destinationArrivalWindow.latest
  ))) {
    return infeasible(['DESTINATION_WINDOW'], emptyDiagnostics);
  }

  const solo = classifyEstimate(options.travel.solo);
  if (solo.status === 'UNKNOWN') return unknown([solo.reason], emptyDiagnostics);
  if (solo.status === 'UNREACHABLE') return infeasible(['NO_ROAD_ROUTE'], emptyDiagnostics);
  if (solo.estimate.durationSeconds === 0 && options.driver.maxExtraDurationRatio !== undefined) {
    return unknown(['ZERO_BASELINE_PERCENTAGE_LIMIT'], emptyDiagnostics);
  }
  const estimateIndex = indexEstimates(options.travel.legs);
  if (estimateIndex.status === 'UNKNOWN') return unknown([estimateIndex.reason], emptyDiagnostics);

  const restrictions = normalizeRestrictions(options.restrictions, members);
  if (restrictions.status === 'UNKNOWN') return unknown(['MALFORMED_INPUT'], emptyDiagnostics);
  const orders = permittedOrders(members, restrictions.value);
  if (orders.length === 0 && members.length > 0) {
    return infeasible(['ORDER_RESTRICTION_CONFLICT'], emptyDiagnostics);
  }
  if (orders.length > maxOrders) {
    return unknown(['SEARCH_LIMIT'], diagnostics(orders.length, 0, orders.length, maxStops, maxOrders));
  }

  const results = orders.map((order) => solveFixedOrder(
    options.driver,
    order,
    solo.estimate,
    estimateIndex.estimates,
  ));
  const feasible = results
    .filter((result): result is Extract<FixedOrderResult, { status: 'FEASIBLE' }> => result.status === 'FEASIBLE')
    .map((result) => result.solution)
    .sort(compareSolutions);
  const unresolvedOrders = results.filter((result) => result.status === 'UNKNOWN').length;
  const evaluatedOrders = results.length - unresolvedOrders;
  const resultDiagnostics = diagnostics(orders.length, evaluatedOrders, unresolvedOrders, maxStops, maxOrders);
  const best = feasible[0];
  if (best) {
    return {
      status: 'FEASIBLE',
      plan: buildPlan(options, members, restrictions.value, best, solo.estimate, unresolvedOrders === 0),
      diagnostics: resultDiagnostics,
    };
  }
  if (unresolvedOrders > 0) {
    const reasonCodes = unique(results.flatMap((result) => result.status === 'UNKNOWN' ? result.reasonCodes : []));
    return unknown(reasonCodes, resultDiagnostics);
  }
  const reasonCodes = unique(results.flatMap((result) => result.status === 'INFEASIBLE' ? result.reasonCodes : []));
  return infeasible(reasonCodes.length > 0 ? reasonCodes : ['NO_FEASIBLE_SCHEDULE'], resultDiagnostics);
}

function solveFixedOrder(
  driver: DriverOccurrenceV1,
  order: GroupRiderPromiseV1[],
  solo: AvailableEstimate,
  estimates: Map<string, AvailableEstimate | 'MISSING' | 'UNREACHABLE'>,
): FixedOrderResult {
  const routeLegs: AvailableEstimate[] = [];
  const directToCampus: AvailableEstimate[] = [];
  const routePairs = order.length === 0
    ? []
    : [
        [driver.start.pointId, order[0].pickup.pointId] as const,
        ...order.slice(1).map((member, index) => [order[index].pickup.pointId, member.pickup.pointId] as const),
        [order[order.length - 1].pickup.pointId, driver.campusDropoff.pointId] as const,
      ];
  for (const [from, to] of routePairs) {
    const estimate = lookupEstimate(estimates, from, to);
    if (estimate === 'MISSING') return { status: 'UNKNOWN', reasonCodes: ['MISSING_TRAVEL_ESTIMATE'] };
    if (estimate === 'UNREACHABLE') return { status: 'INFEASIBLE', reasonCodes: ['NO_ROAD_ROUTE'] };
    routeLegs.push(estimate);
  }
  for (const member of order) {
    const estimate = lookupEstimate(estimates, member.pickup.pointId, driver.campusDropoff.pointId);
    if (estimate === 'MISSING') return { status: 'UNKNOWN', reasonCodes: ['MISSING_TRAVEL_ESTIMATE'] };
    if (estimate === 'UNREACHABLE') return { status: 'INFEASIBLE', reasonCodes: ['NO_ROAD_ROUTE'] };
    directToCampus.push(estimate);
  }

  const roadDurationSeconds = order.length === 0
    ? solo.durationSeconds
    : routeLegs.reduce((total, estimate) => total + estimate.durationSeconds, 0);
  if (roadDurationSeconds < solo.durationSeconds) {
    return { status: 'UNKNOWN', reasonCodes: ['INCONSISTENT_TRAVEL_ESTIMATES'] };
  }
  const serviceDurationSeconds = order.reduce((total, member) => total + member.pickupServiceSeconds, 0);
  const lowerElapsed = roadDurationSeconds + serviceDurationSeconds;
  const ratioLimit = driver.maxExtraDurationRatio === undefined
    ? Number.POSITIVE_INFINITY
    : Math.floor(driver.maxExtraDurationRatio * solo.durationSeconds);
  const activeDriverDetourLimitSeconds = Math.min(driver.maxExtraDurationSeconds, ratioLimit);
  const maximumElapsed = solo.durationSeconds + activeDriverDetourLimitSeconds;
  if (lowerElapsed > maximumElapsed) {
    return { status: 'INFEASIBLE', reasonCodes: ['DRIVER_DETOUR_LIMIT'] };
  }
  for (let index = 0; index < order.length; index += 1) {
    let minimumInVehicle = 0;
    let suffixRoadDuration = 0;
    for (let next = index + 1; next < order.length; next += 1) {
      minimumInVehicle += routeLegs[next].durationSeconds + order[next].pickupServiceSeconds;
      suffixRoadDuration += routeLegs[next].durationSeconds;
    }
    minimumInVehicle += routeLegs[routeLegs.length - 1].durationSeconds;
    suffixRoadDuration += routeLegs[routeLegs.length - 1].durationSeconds;
    if (suffixRoadDuration < directToCampus[index].durationSeconds) {
      return { status: 'UNKNOWN', reasonCodes: ['INCONSISTENT_TRAVEL_ESTIMATES'] };
    }
    if (minimumInVehicle > directToCampus[index].durationSeconds + order[index].maxExtraInVehicleSeconds) {
      return { status: 'INFEASIBLE', reasonCodes: ['RIDER_RIDE_LIMIT'] };
    }
  }

  const campusEarliest = Math.max(
    driver.campusArrivalWindow.earliest,
    ...order.map((member) => member.destinationArrivalWindow.earliest - member.egressWalkSeconds),
  );
  const campusLatest = Math.min(
    driver.campusArrivalWindow.latest,
    ...order.map((member) => member.destinationArrivalWindow.latest - member.egressWalkSeconds),
  );
  if (campusEarliest > campusLatest) {
    return { status: 'INFEASIBLE', reasonCodes: ['DESTINATION_WINDOW'] };
  }

  const temporal = temporalNetwork(driver, order, routeLegs, directToCampus, solo.durationSeconds, campusEarliest, campusLatest);
  const atMaximum = closeTemporal(temporal.variableCount, [
    ...temporal.edges,
    elapsedEdge(temporal.departureIndex, temporal.campusIndex, maximumElapsed),
  ]);
  if (!atMaximum) {
    return { status: 'INFEASIBLE', reasonCodes: ['NO_FEASIBLE_SCHEDULE'] };
  }
  let low = lowerElapsed;
  let high = maximumElapsed;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const closure = closeTemporal(temporal.variableCount, [
      ...temporal.edges,
      elapsedEdge(temporal.departureIndex, temporal.campusIndex, middle),
    ]);
    if (closure) high = middle;
    else low = middle + 1;
  }
  const minimumElapsed = low;
  const minimumClosure = closeTemporal(temporal.variableCount, [
    ...temporal.edges,
    elapsedEdge(temporal.departureIndex, temporal.campusIndex, minimumElapsed),
  ])!;
  const departureEarliest = -minimumClosure.distances[temporal.departureIndex][0];
  const departureLatest = minimumClosure.distances[0][temporal.departureIndex];
  const departure = clamp(driver.preferredDeparture, departureEarliest, departureLatest);
  const fixedDeparture = closeTemporal(temporal.variableCount, [
    ...temporal.edges,
    elapsedEdge(temporal.departureIndex, temporal.campusIndex, minimumElapsed),
    upperBound(temporal.departureIndex, departure),
    lowerBound(temporal.departureIndex, departure),
  ])!;
  const values = fixedDeparture.distances[0];
  const pickupServiceStarts = temporal.pickupIndices.map((index) => values[index]);
  const campusArrival = values[temporal.campusIndex];
  const physicalArrivals = pickupServiceStarts.map((_, index) => index === 0
    ? departure + routeLegs[0].durationSeconds
    : pickupServiceStarts[index - 1] + order[index - 1].pickupServiceSeconds + routeLegs[index].durationSeconds);
  const waitingDurationSeconds = pickupServiceStarts.reduce(
    (total, serviceStart, index) => total + serviceStart - physicalArrivals[index],
    0,
  );
  const roadDistanceMeters = order.length === 0
    ? solo.distanceMeters
    : routeLegs.reduce((total, estimate) => total + estimate.distanceMeters, 0);
  return {
    status: 'FEASIBLE',
    solution: {
      order,
      feasibleDepartureWindow: { earliest: departureEarliest, latest: departureLatest },
      departure,
      campusArrival,
      pickupServiceStarts,
      physicalArrivals,
      elapsedDurationSeconds: campusArrival - departure,
      roadDurationSeconds,
      roadDistanceMeters,
      serviceDurationSeconds,
      waitingDurationSeconds,
      totalAddedDriverDurationSeconds: campusArrival - departure - solo.durationSeconds,
      activeDriverDetourLimitSeconds,
      preferredDepartureDistanceSeconds: Math.abs(departure - driver.preferredDeparture),
    },
  };
}

function temporalNetwork(
  driver: DriverOccurrenceV1,
  order: GroupRiderPromiseV1[],
  routeLegs: AvailableEstimate[],
  directToCampus: AvailableEstimate[],
  soloDurationSeconds: number,
  campusEarliest: number,
  campusLatest: number,
) {
  const departureIndex = 1;
  const pickupIndices = order.map((_, index) => index + 2);
  const campusIndex = order.length + 2;
  const variableCount = campusIndex + 1;
  const edges: Edge[] = [
    lowerBound(departureIndex, driver.departureWindow.earliest),
    upperBound(departureIndex, driver.departureWindow.latest),
    lowerBound(campusIndex, campusEarliest),
    upperBound(campusIndex, campusLatest),
  ];
  if (order.length === 0) {
    addEquality(edges, departureIndex, campusIndex, soloDurationSeconds);
  } else {
    order.forEach((member, index) => {
      const pickupIndex = pickupIndices[index];
      edges.push(lowerBound(pickupIndex, member.pickupWindow.earliest));
      edges.push(upperBound(pickupIndex, member.pickupWindow.latest));
      if (index === 0) {
        // departure - pickup <= -travel
        edges.push({ from: pickupIndex, to: departureIndex, maximumDifference: -routeLegs[0].durationSeconds });
      } else {
        // previous pickup - next pickup <= -(service + travel)
        edges.push({
          from: pickupIndex,
          to: pickupIndices[index - 1],
          maximumDifference: -(order[index - 1].pickupServiceSeconds + routeLegs[index].durationSeconds),
        });
      }
      // campus - pickup <= service + direct road + allowed extra ride time
      edges.push({
        from: pickupIndex,
        to: campusIndex,
        maximumDifference: member.pickupServiceSeconds
          + directToCampus[index].durationSeconds
          + member.maxExtraInVehicleSeconds,
      });
    });
    const last = order.length - 1;
    addEquality(
      edges,
      pickupIndices[last],
      campusIndex,
      order[last].pickupServiceSeconds + routeLegs[routeLegs.length - 1].durationSeconds,
    );
  }
  return { variableCount, edges, departureIndex, pickupIndices, campusIndex };
}

function buildPlan(
  options: EvaluateGroupRouteOptions,
  members: GroupRiderPromiseV1[],
  restrictions: Required<GroupOrderRestrictions>,
  solution: FixedOrderSolution,
  solo: AvailableEstimate,
  searchComplete: boolean,
): GroupRoutePlanV1 {
  const payload = {
    driverOccurrenceId: options.driver.id,
    driverContractRevision: options.driver.contractRevision,
    requestOrder: solution.order.map((member) => member.requestId),
    proposalRevisions: solution.order.map((member) => member.proposalRevision),
    departure: solution.departure,
    campusArrival: solution.campusArrival,
    estimateRevision: options.travel.revision,
  };
  const revision = stableRevision(payload);
  return {
    schema: GROUP_ROUTE_PLAN_SCHEMA,
    version: GROUP_ROUTE_PLAN_VERSION,
    id: `group-plan:${options.driver.id}:${revision}`,
    revision,
    scenarioNamespace: options.driver.scenarioNamespace,
    generationId: options.driver.generationId,
    driverOccurrenceId: options.driver.id,
    driverContractRevision: options.driver.contractRevision,
    occurrence: { ...options.driver.occurrence },
    memberRequestIds: solution.order.map((member) => member.requestId),
    memberParticipantIds: solution.order.map((member) => member.riderParticipantId),
    proposalRevisions: Object.fromEntries(members.map((member) => [member.requestId, member.proposalRevision])),
    driverStart: clonePoint(options.driver.start),
    campusDropoff: { ...clonePoint(options.driver.campusDropoff), campusLot: options.driver.campusDropoff.campusLot },
    riderPromises: solution.order.map(clonePromise),
    selectedRequestOrder: solution.order.map((member) => member.requestId),
    orderRestrictions: {
      fixedRequestOrder: restrictions.fixedRequestOrder.length > 0 ? [...restrictions.fixedRequestOrder] : undefined,
      precedence: restrictions.precedence.map((item) => ({ ...item })),
    },
    feasibleDepartureWindow: { ...solution.feasibleDepartureWindow },
    chosenDeparture: solution.departure,
    pickups: solution.order.map((member, index) => {
      const serviceStart = solution.pickupServiceStarts[index];
      const boardingComplete = serviceStart + member.pickupServiceSeconds;
      const inVehicleDurationSeconds = solution.campusArrival - boardingComplete;
      const direct = lookupAvailableLeg(options.travel.legs, member.pickup.pointId, options.driver.campusDropoff.pointId)!;
      return {
        requestId: member.requestId,
        riderParticipantId: member.riderParticipantId,
        physicalArrival: solution.physicalArrivals[index],
        serviceStart,
        boardingComplete,
        plannedWaitingSeconds: serviceStart - solution.physicalArrivals[index],
        destinationArrival: solution.campusArrival + member.egressWalkSeconds,
        inVehicleDurationSeconds,
        extraInVehicleDurationSeconds: inVehicleDurationSeconds - direct.durationSeconds,
      };
    }),
    vehicleCampusArrival: solution.campusArrival,
    metrics: {
      roadDurationSeconds: solution.roadDurationSeconds,
      roadDistanceMeters: solution.roadDistanceMeters,
      serviceDurationSeconds: solution.serviceDurationSeconds,
      waitingDurationSeconds: solution.waitingDurationSeconds,
      elapsedDurationSeconds: solution.elapsedDurationSeconds,
      soloReferenceDurationSeconds: solo.durationSeconds,
      totalAddedDriverDurationSeconds: solution.totalAddedDriverDurationSeconds,
      incrementalAddedDriverDurationSeconds: solution.elapsedDurationSeconds
        - (options.currentPlanElapsedDurationSeconds ?? solo.durationSeconds),
    },
    routing: {
      mode: options.travel.mode,
      providerId: options.travel.providerId,
      estimateTimestampEpochSeconds: options.travel.evaluatedAtEpochSeconds,
      estimateRevision: options.travel.revision,
      geometryValidity: 'NOT_REQUESTED',
    },
    searchComplete,
  };
}

function promiseFromCandidate(candidate: GroupCandidateInput):
  | { status: 'READY'; promise: GroupRiderPromiseV1 }
  | { status: 'UNKNOWN'; reasonCodes: GroupUnknownReasonCode[] } {
  if (!nonempty(candidate.requestId) || !nonempty(candidate.proposalId) || !nonempty(candidate.proposalRevision)
    || !candidate.intent || candidate.intent.pickup?.status !== 'CONFIRMED') {
    return { status: 'UNKNOWN', reasonCodes: candidate.intent?.pickup?.status === 'UNCONFIRMED'
      ? ['LOCATION_UNCONFIRMED']
      : ['MALFORMED_INPUT'] };
  }
  const intent = candidate.intent;
  const pickup = intent.pickup;
  if (pickup.status !== 'CONFIRMED') {
    return { status: 'UNKNOWN', reasonCodes: ['LOCATION_UNCONFIRMED'] };
  }
  return {
    status: 'READY',
    promise: {
      requestId: candidate.requestId,
      proposalId: candidate.proposalId,
      proposalRevision: candidate.proposalRevision,
      riderIntentId: intent.id,
      riderParticipantId: intent.riderParticipantId,
      occurrence: { ...intent.occurrence },
      requestedSeats: intent.requestedSeats,
      pickup: clonePoint(pickup.point),
      acceptedCampusDropoff: { ...clonePoint(intent.acceptedCampusDropoff), campusLot: intent.acceptedCampusDropoff.campusLot },
      pickupWindow: { ...intent.pickupWindow },
      destinationArrivalWindow: { ...intent.destinationArrivalWindow },
      pickupServiceSeconds: intent.pickupServiceSeconds,
      accessWalkSeconds: intent.accessWalkSeconds,
      egressWalkSeconds: intent.egressWalkSeconds,
      maxAccessWalkSeconds: intent.maxAccessWalkSeconds,
      maxEgressWalkSeconds: intent.maxEgressWalkSeconds,
      maxExtraInVehicleSeconds: intent.maxExtraInVehicleSeconds,
    },
  };
}

function normalizeRestrictions(
  restrictions: GroupOrderRestrictions | undefined,
  members: GroupRiderPromiseV1[],
): { status: 'VALID'; value: Required<GroupOrderRestrictions> } | { status: 'UNKNOWN' } {
  if (restrictions && (restrictions.fixedRequestOrder !== undefined && !Array.isArray(restrictions.fixedRequestOrder)
    || restrictions.precedence !== undefined && !Array.isArray(restrictions.precedence))) {
    return { status: 'UNKNOWN' };
  }
  const ids = new Set(members.map((member) => member.requestId));
  const fixedRequestOrder = [...(restrictions?.fixedRequestOrder ?? [])];
  const precedence = (restrictions?.precedence ?? []).map((item) => ({ ...item }));
  if (fixedRequestOrder.length > 0
    && (fixedRequestOrder.length !== ids.size || new Set(fixedRequestOrder).size !== ids.size
      || fixedRequestOrder.some((id) => !ids.has(id)))) return { status: 'UNKNOWN' };
  if (precedence.some((item) => !nonempty(item.beforeRequestId) || !nonempty(item.afterRequestId)
    || item.beforeRequestId === item.afterRequestId || !ids.has(item.beforeRequestId) || !ids.has(item.afterRequestId))) {
    return { status: 'UNKNOWN' };
  }
  return { status: 'VALID', value: { fixedRequestOrder, precedence } };
}

function permittedOrders(
  members: GroupRiderPromiseV1[],
  restrictions: Required<GroupOrderRestrictions>,
): GroupRiderPromiseV1[][] {
  const all = restrictions.fixedRequestOrder.length > 0
    ? [restrictions.fixedRequestOrder.map((id) => members.find((member) => member.requestId === id)!)]
    : permutations(members);
  return all.filter((order) => restrictions.precedence.every((item) => (
    order.findIndex((member) => member.requestId === item.beforeRequestId)
      < order.findIndex((member) => member.requestId === item.afterRequestId)
  )));
}

function permutations<T>(values: readonly T[]): T[][] {
  if (values.length <= 1) return [Array.from(values)];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index),
    ...values.slice(index + 1),
  ]).map((rest) => [value, ...rest]));
}

function indexEstimates(legs: readonly DirectedGroupTravelLeg[]):
  | { status: 'READY'; estimates: Map<string, AvailableEstimate | 'MISSING' | 'UNREACHABLE'> }
  | { status: 'UNKNOWN'; reason: GroupUnknownReasonCode } {
  if (!Array.isArray(legs)) return { status: 'UNKNOWN', reason: 'MALFORMED_TRAVEL_ESTIMATE' };
  const estimates = new Map<string, AvailableEstimate | 'MISSING' | 'UNREACHABLE'>();
  for (const leg of legs) {
    if (!nonempty(leg?.fromPointId) || !nonempty(leg?.toPointId)) {
      return { status: 'UNKNOWN', reason: 'MALFORMED_TRAVEL_ESTIMATE' };
    }
    const key = legKey(leg.fromPointId, leg.toPointId);
    let value: AvailableEstimate | 'MISSING' | 'UNREACHABLE';
    if (leg.estimate?.status === 'MISSING') value = 'MISSING';
    else if (leg.estimate?.status === 'UNREACHABLE') value = 'UNREACHABLE';
    else {
      const classified = classifyEstimate(leg.estimate);
      if (classified.status !== 'AVAILABLE') {
        return { status: 'UNKNOWN', reason: 'MALFORMED_TRAVEL_ESTIMATE' };
      }
      value = classified.estimate;
    }
    const existing = estimates.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(value)) {
      return { status: 'UNKNOWN', reason: 'MALFORMED_TRAVEL_ESTIMATE' };
    }
    estimates.set(key, value);
  }
  return { status: 'READY', estimates };
}

function lookupEstimate(
  estimates: Map<string, AvailableEstimate | 'MISSING' | 'UNREACHABLE'>,
  from: string,
  to: string,
): AvailableEstimate | 'MISSING' | 'UNREACHABLE' {
  if (from === to) return { status: 'AVAILABLE', durationSeconds: 0, distanceMeters: 0 };
  return estimates.get(legKey(from, to)) ?? 'MISSING';
}

function lookupAvailableLeg(
  legs: readonly DirectedGroupTravelLeg[],
  from: string,
  to: string,
): AvailableEstimate | null {
  if (from === to) return { status: 'AVAILABLE', durationSeconds: 0, distanceMeters: 0 };
  const estimate = legs.find((leg) => leg.fromPointId === from && leg.toPointId === to)?.estimate;
  return estimate?.status === 'AVAILABLE' ? estimate : null;
}

function classifyEstimate(estimate: StaticRouteEstimate | undefined):
  | { status: 'AVAILABLE'; estimate: AvailableEstimate }
  | { status: 'UNREACHABLE' }
  | { status: 'UNKNOWN'; reason: GroupUnknownReasonCode } {
  if (!estimate) return { status: 'UNKNOWN', reason: 'MISSING_TRAVEL_ESTIMATE' };
  if (estimate.status === 'MISSING') return { status: 'UNKNOWN', reason: 'MISSING_TRAVEL_ESTIMATE' };
  if (estimate.status === 'UNREACHABLE') return { status: 'UNREACHABLE' };
  if (!nonnegativeInteger(estimate.durationSeconds) || !nonnegativeInteger(estimate.distanceMeters)) {
    return { status: 'UNKNOWN', reason: 'MALFORMED_TRAVEL_ESTIMATE' };
  }
  return { status: 'AVAILABLE', estimate };
}

function closeTemporal(variableCount: number, edges: readonly Edge[]): TemporalClosure | null {
  const distances = Array.from({ length: variableCount }, (_, from) => (
    Array.from({ length: variableCount }, (_, to) => from === to ? 0 : Number.POSITIVE_INFINITY)
  ));
  for (const edge of edges) {
    distances[edge.from][edge.to] = Math.min(distances[edge.from][edge.to], edge.maximumDifference);
  }
  for (let via = 0; via < variableCount; via += 1) {
    for (let from = 0; from < variableCount; from += 1) {
      if (!Number.isFinite(distances[from][via])) continue;
      for (let to = 0; to < variableCount; to += 1) {
        const candidate = distances[from][via] + distances[via][to];
        if (candidate < distances[from][to]) distances[from][to] = candidate;
      }
    }
  }
  return distances.some((row, index) => row[index] < 0) ? null : { distances };
}

function upperBound(variable: number, upper: number): Edge {
  return { from: 0, to: variable, maximumDifference: upper };
}

function lowerBound(variable: number, lower: number): Edge {
  return { from: variable, to: 0, maximumDifference: -lower };
}

function elapsedEdge(departure: number, campus: number, maximum: number): Edge {
  return { from: departure, to: campus, maximumDifference: maximum };
}

function addEquality(edges: Edge[], from: number, to: number, difference: number): void {
  edges.push({ from, to, maximumDifference: difference });
  edges.push({ from: to, to: from, maximumDifference: -difference });
}

function compareSolutions(left: FixedOrderSolution, right: FixedOrderSolution): number {
  return left.elapsedDurationSeconds - right.elapsedDurationSeconds
    || left.preferredDepartureDistanceSeconds - right.preferredDepartureDistanceSeconds
    || left.order.map((member) => member.requestId).join('|')
      .localeCompare(right.order.map((member) => member.requestId).join('|'));
}

function validDriver(driver: DriverOccurrenceV1): boolean {
  return Boolean(driver) && driver.schema === DRIVER_OCCURRENCE_SCHEMA
    && driver.version === DRIVER_OCCURRENCE_VERSION && nonempty(driver.id) && nonempty(driver.offerId)
    && nonempty(driver.driverParticipantId) && nonempty(driver.scenarioNamespace)
    && nonempty(driver.generationId) && nonempty(driver.contractRevision)
    && validOccurrence(driver.occurrence) && validPoint(driver.start) && validPoint(driver.campusDropoff)
    && positiveInteger(driver.passengerCapacity) && validWindow(driver.departureWindow)
    && validWindow(driver.campusArrivalWindow) && integer(driver.preferredDeparture)
    && nonnegativeInteger(driver.maxExtraDurationSeconds)
    && (driver.maxExtraDurationRatio === undefined
      || Number.isFinite(driver.maxExtraDurationRatio) && driver.maxExtraDurationRatio >= 0);
}

function validPromise(member: GroupRiderPromiseV1): boolean {
  return Boolean(member) && [member.requestId, member.proposalId, member.proposalRevision,
    member.riderIntentId, member.riderParticipantId].every(nonempty)
    && validOccurrence(member.occurrence) && validPoint(member.pickup)
    && validPoint(member.acceptedCampusDropoff) && positiveInteger(member.requestedSeats)
    && validWindow(member.pickupWindow) && validWindow(member.destinationArrivalWindow)
    && [member.pickupServiceSeconds, member.accessWalkSeconds, member.egressWalkSeconds,
      member.maxAccessWalkSeconds, member.maxEgressWalkSeconds,
      member.maxExtraInVehicleSeconds].every(nonnegativeInteger);
}

function validTravelMetadata(travel: GroupTravelEstimates): boolean {
  return Boolean(travel) && Array.isArray(travel.legs) && (travel.mode === 'FIXTURE' || travel.mode === 'LIVE')
    && nonempty(travel.providerId) && nonempty(travel.revision) && nonnegativeInteger(travel.evaluatedAtEpochSeconds);
}

function validOccurrence(occurrence: DriverOccurrenceV1['occurrence']): boolean {
  return Boolean(occurrence) && /^\d{4}-\d{2}-\d{2}$/.test(occurrence.localDate)
    && nonempty(occurrence.timeZone)
    && (occurrence.direction === 'TO_CAMPUS' || occurrence.direction === 'FROM_CAMPUS');
}

function validPoint(point: ConfirmedRoutePoint): boolean {
  return Boolean(point) && nonempty(point.pointId) && nonempty(point.label)
    && point.accuracy === 'SELECTED_POINT' && Number.isFinite(point.coordinate?.latitude)
    && Number.isFinite(point.coordinate?.longitude) && Math.abs(point.coordinate.latitude) <= 90
    && Math.abs(point.coordinate.longitude) <= 180;
}

function validWindow(window: { earliest: number; latest: number }): boolean {
  return Boolean(window) && integer(window.earliest) && integer(window.latest) && window.earliest <= window.latest;
}

function sameOccurrence(left: DriverOccurrenceV1['occurrence'], right: DriverOccurrenceV1['occurrence']): boolean {
  return left.localDate === right.localDate && left.direction === right.direction && left.timeZone === right.timeZone;
}

function sameCampus(left: ConfirmedRoutePoint & { campusLot: string }, right: ConfirmedRoutePoint & { campusLot: string }): boolean {
  return left.campusLot === right.campusLot && left.pointId === right.pointId
    && left.coordinate.latitude === right.coordinate.latitude
    && left.coordinate.longitude === right.coordinate.longitude;
}

function hasDuplicateMembers(members: GroupRiderPromiseV1[]): boolean {
  return new Set(members.map((member) => member.requestId)).size !== members.length
    || new Set(members.map((member) => member.riderIntentId)).size !== members.length
    || new Set(members.map((member) => member.riderParticipantId)).size !== members.length;
}

function clonePromise(member: GroupRiderPromiseV1): GroupRiderPromiseV1 {
  return {
    ...member,
    occurrence: { ...member.occurrence },
    pickup: clonePoint(member.pickup),
    acceptedCampusDropoff: { ...clonePoint(member.acceptedCampusDropoff), campusLot: member.acceptedCampusDropoff.campusLot },
    pickupWindow: { ...member.pickupWindow },
    destinationArrivalWindow: { ...member.destinationArrivalWindow },
  };
}

function clonePoint<T extends ConfirmedRoutePoint>(point: T): T {
  return { ...point, coordinate: { ...point.coordinate } };
}

function stableRevision(value: unknown): string {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `group-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function diagnostics(permittedOrders: number, evaluatedOrders: number, unresolvedOrders: number, maxStops: number, maxOrders: number): GroupEvaluationDiagnostics {
  return { permittedOrders, evaluatedOrders, unresolvedOrders, maxStops, maxOrders };
}

function infeasible(reasonCodes: GroupInfeasibleReasonCode[], value: GroupEvaluationDiagnostics): GroupRouteEvaluation {
  return { status: 'INFEASIBLE', reasonCodes: unique(reasonCodes), diagnostics: value };
}

function unknown(reasonCodes: GroupUnknownReasonCode[], value: GroupEvaluationDiagnostics): GroupRouteEvaluation {
  return { status: 'UNKNOWN', reasonCodes: unique(reasonCodes), diagnostics: value };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function legKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function nonnegativeInteger(value: unknown): value is number {
  return integer(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return integer(value) && value > 0;
}

function validBound(value: unknown, maximum: number): value is number {
  return positiveInteger(value) && value <= maximum;
}

