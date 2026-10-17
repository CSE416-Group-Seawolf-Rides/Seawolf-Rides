import { evaluatePair } from './evaluatePair';
import type { RiderDemoCandidate } from './riderDemoFixtures';
import { riderDemoDriver } from './riderDemoFixtures';
import type {
  InfeasibleReasonCode,
  PairEvaluation,
  PairEvaluationInput,
  StaticRouteEstimate,
  UnknownReasonCode,
} from './types';
import type { RoadRoute, RouteCoordinate, RoutingAdapter, RoutingFailureCode, RoutingResult } from '../routing/types';

export type RiderDemoMode = 'LIVE_OSRM' | 'FIXTURE';

export const DEFAULT_RIDER_DEMO_MAX_SNAP_METERS = 75;
export const DEFAULT_RIDER_DEMO_CONCURRENCY = 3;

export type RiderDemoRoutingIssue =
  | { kind: 'UNCONFIRMED_PICKUP'; message: string }
  | { kind: 'MISSING_BY_DESIGN'; message: string }
  | { kind: 'SNAP_EXCEEDED'; message: string; distanceMeters: number }
  | {
      kind: 'ROUTING_FAILURE';
      message: string;
      code: RoutingFailureCode;
      retryable: boolean;
    }
  | { kind: 'MALFORMED_LEGS'; message: string };

export interface EvaluatedRiderDemoCandidate {
  candidate: RiderDemoCandidate;
  evaluation: PairEvaluation;
  route: RoadRoute | null;
  routingIssue: RiderDemoRoutingIssue | null;
  rank: number | null;
  rankingExplanation: string | null;
}

export interface RiderDemoEvaluationResult {
  mode: RiderDemoMode;
  providerLabel: string;
  baselineRoute: RoadRoute | null;
  baselineFailure: Exclude<RoutingResult, { status: 'SUCCESS' }> | null;
  candidates: EvaluatedRiderDemoCandidate[];
  maxSnapMeters: number;
}

interface EvaluateRiderDemoOptions {
  adapter: RoutingAdapter;
  candidates: readonly RiderDemoCandidate[];
  campus?: RouteCoordinate;
  driverStart?: RouteCoordinate;
  mode: RiderDemoMode;
  signal?: AbortSignal;
  concurrency?: number;
  maxSnapMeters?: number;
}

const missingEstimate: StaticRouteEstimate = { status: 'MISSING' };
const unreachableEstimate: StaticRouteEstimate = { status: 'UNREACHABLE' };

function available(durationSeconds: number, distanceMeters: number): StaticRouteEstimate {
  // OSRM commonly returns fractional SI units, while the domain evaluator's
  // explicit contract uses integer seconds and meters.
  return {
    status: 'AVAILABLE',
    durationSeconds: Math.round(durationSeconds),
    distanceMeters: Math.round(distanceMeters),
  };
}

function failureEstimate(result: Exclude<RoutingResult, { status: 'SUCCESS' }>): StaticRouteEstimate {
  return result.code === 'NO_ROUTE' ? unreachableEstimate : missingEstimate;
}

function cloneInput(candidate: RiderDemoCandidate): PairEvaluationInput {
  return structuredClone(candidate.input);
}

async function mapWithConcurrency<T, U>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(values.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, runWorker),
  );
  return results;
}

function evaluateWithoutCandidateRoute(
  candidate: RiderDemoCandidate,
  baseline: StaticRouteEstimate,
): EvaluatedRiderDemoCandidate {
  const input = cloneInput(candidate);
  input.travel.startToCampus = baseline;
  const unconfirmed = candidate.pickupAccuracy === 'APPROXIMATE_AREA';
  return {
    candidate,
    evaluation: evaluatePair(input),
    route: null,
    routingIssue: unconfirmed
      ? {
          kind: 'UNCONFIRMED_PICKUP',
          message: 'Routing was not requested because this pickup is only an approximate area.',
        }
      : {
          kind: 'MISSING_BY_DESIGN',
          message: 'This demo deliberately omits the rider route estimate.',
        },
    rank: null,
    rankingExplanation: null,
  };
}

function candidateFailure(
  candidate: RiderDemoCandidate,
  baseline: StaticRouteEstimate,
  result: Exclude<RoutingResult, { status: 'SUCCESS' }>,
): EvaluatedRiderDemoCandidate {
  const input = cloneInput(candidate);
  input.travel = {
    startToCampus: baseline,
    startToPickup: failureEstimate(result),
    pickupToCampus: failureEstimate(result),
  };
  return {
    candidate,
    evaluation: evaluatePair(input),
    route: null,
    routingIssue: {
      kind: 'ROUTING_FAILURE',
      code: result.code,
      message: result.message,
      retryable: result.retryable,
    },
    rank: null,
    rankingExplanation: null,
  };
}

async function evaluateRoutedCandidate(
  adapter: RoutingAdapter,
  candidate: RiderDemoCandidate,
  baseline: StaticRouteEstimate,
  driverStart: RouteCoordinate,
  campus: RouteCoordinate,
  maxSnapMeters: number,
  signal?: AbortSignal,
): Promise<EvaluatedRiderDemoCandidate> {
  const result = await adapter.route(
    [driverStart, candidate.pickup, campus],
    { signal },
  );
  if (result.status === 'FAILURE') return candidateFailure(candidate, baseline, result);

  if (result.route.legs.length !== 2 || result.route.snappedWaypoints.length !== 3) {
    const input = cloneInput(candidate);
    input.travel.startToCampus = baseline;
    return {
      candidate,
      evaluation: evaluatePair(input),
      route: null,
      routingIssue: {
        kind: 'MALFORMED_LEGS',
        message: 'The provider did not return exactly two ordered rider-route legs.',
      },
      rank: null,
      rankingExplanation: null,
    };
  }

  const pickupSnap = result.route.snappedWaypoints[1].distanceMeters;
  const input = cloneInput(candidate);
  input.travel = {
    startToCampus: baseline,
    startToPickup: available(
      result.route.legs[0].durationSeconds,
      result.route.legs[0].distanceMeters,
    ),
    pickupToCampus: available(
      result.route.legs[1].durationSeconds,
      result.route.legs[1].distanceMeters,
    ),
  };

  if (pickupSnap > maxSnapMeters) {
    input.anchors.riderPickup.accuracy = 'APPROXIMATE_AREA';
    return {
      candidate,
      evaluation: evaluatePair(input),
      route: null,
      routingIssue: {
        kind: 'SNAP_EXCEEDED',
        distanceMeters: pickupSnap,
        message: `OSRM snapped the pickup ${pickupSnap.toFixed(1)} m away, above the ${maxSnapMeters} m demo limit.`,
      },
      rank: null,
      rankingExplanation: null,
    };
  }

  return {
    candidate,
    evaluation: evaluatePair(input),
    route: result.route,
    routingIssue: null,
    rank: null,
    rankingExplanation: null,
  };
}

function feasibleWidth(candidate: EvaluatedRiderDemoCandidate): number {
  return candidate.evaluation.status === 'FEASIBLE'
    ? candidate.evaluation.plan.feasibleDepartureWindow.latest -
        candidate.evaluation.plan.feasibleDepartureWindow.earliest
    : 0;
}

function walkingSeconds(candidate: EvaluatedRiderDemoCandidate): number {
  return candidate.candidate.input.rider.accessWalkSeconds +
    candidate.candidate.input.rider.egressWalkSeconds;
}

export function rankRiderDemoCandidates(
  candidates: readonly EvaluatedRiderDemoCandidate[],
): EvaluatedRiderDemoCandidate[] {
  const feasible = candidates
    .filter((candidate) => candidate.evaluation.status === 'FEASIBLE')
    .sort((a, b) => {
      if (a.evaluation.status !== 'FEASIBLE' || b.evaluation.status !== 'FEASIBLE') return 0;
      return (
        a.evaluation.metrics.driverExtraDurationSeconds -
          b.evaluation.metrics.driverExtraDurationSeconds ||
        walkingSeconds(a) - walkingSeconds(b) ||
        feasibleWidth(b) - feasibleWidth(a) ||
        a.candidate.id.localeCompare(b.candidate.id)
      );
    });

  const ranked = new Map<string, { rank: number; explanation: string }>();
  feasible.forEach((current, index) => {
    if (index === 0) {
      ranked.set(current.candidate.id, {
        rank: 1,
        explanation: 'Ranks first under the demo policy after comparing all feasible candidates.',
      });
      return;
    }
    const previous = feasible[index - 1];
    if (current.evaluation.status !== 'FEASIBLE' || previous.evaluation.status !== 'FEASIBLE') return;
    let explanation: string;
    if (
      current.evaluation.metrics.driverExtraDurationSeconds !==
      previous.evaluation.metrics.driverExtraDurationSeconds
    ) {
      explanation = `Ranks below ${previous.candidate.name} because it adds ${formatMinutes(current.evaluation.metrics.driverExtraDurationSeconds)} versus ${formatMinutes(previous.evaluation.metrics.driverExtraDurationSeconds)} of driver time.`;
    } else if (walkingSeconds(current) !== walkingSeconds(previous)) {
      explanation = `Ranks below ${previous.candidate.name} because total fixture walking is ${formatMinutes(walkingSeconds(current))} versus ${formatMinutes(walkingSeconds(previous))}.`;
    } else if (feasibleWidth(current) !== feasibleWidth(previous)) {
      explanation = `Ranks below ${previous.candidate.name} because its feasible departure interval is narrower.`;
    } else {
      explanation = `Tied on numeric policy metrics; stable candidate ID places it after ${previous.candidate.name}.`;
    }
    ranked.set(current.candidate.id, { rank: index + 1, explanation });
  });

  return candidates.map((candidate) => {
    const entry = ranked.get(candidate.candidate.id);
    return entry
      ? { ...candidate, rank: entry.rank, rankingExplanation: entry.explanation }
      : { ...candidate, rank: null, rankingExplanation: null };
  });
}

export async function evaluateRiderDemo(
  options: EvaluateRiderDemoOptions,
): Promise<RiderDemoEvaluationResult> {
  const maxSnapMeters = options.maxSnapMeters ?? DEFAULT_RIDER_DEMO_MAX_SNAP_METERS;
  const driverStart = options.driverStart ?? riderDemoDriver.start;
  const campus = options.campus ?? riderDemoDriver.campus;
  const baselineResult = await options.adapter.route(
    [driverStart, campus],
    { signal: options.signal },
  );
  const baseline =
    baselineResult.status === 'SUCCESS'
      ? available(baselineResult.route.durationSeconds, baselineResult.route.distanceMeters)
      : failureEstimate(baselineResult);

  const evaluated = await mapWithConcurrency(
    options.candidates,
    options.concurrency ?? DEFAULT_RIDER_DEMO_CONCURRENCY,
    (candidate) =>
      candidate.skipLiveRouting
        ? Promise.resolve(evaluateWithoutCandidateRoute(candidate, baseline))
        : evaluateRoutedCandidate(
            options.adapter,
            candidate,
            baseline,
            driverStart,
            campus,
            maxSnapMeters,
            options.signal,
          ),
  );

  return {
    mode: options.mode,
    providerLabel:
      baselineResult.status === 'SUCCESS'
        ? baselineResult.route.provider.name
        : options.mode === 'FIXTURE'
          ? 'Fixture road data'
          : 'OSRM',
    baselineRoute: baselineResult.status === 'SUCCESS' ? baselineResult.route : null,
    baselineFailure: baselineResult.status === 'FAILURE' ? baselineResult : null,
    candidates: rankRiderDemoCandidates(evaluated),
    maxSnapMeters,
  };
}

export type LatestRiderDemoResult =
  | { status: 'CURRENT'; result: RiderDemoEvaluationResult }
  | { status: 'STALE' };

/** Aborts superseded evaluations and prevents their responses from becoming UI state. */
export class LatestRiderDemoEvaluation {
  private generation = 0;
  private controller: AbortController | null = null;

  async run(
    evaluate: (signal: AbortSignal) => Promise<RiderDemoEvaluationResult>,
  ): Promise<LatestRiderDemoResult> {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const result = await evaluate(controller.signal);
    if (generation !== this.generation || controller.signal.aborted) return { status: 'STALE' };
    this.controller = null;
    return { status: 'CURRENT', result };
  }

  cancel(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }
}

export const riderDemoReasonExplanations: Record<
  InfeasibleReasonCode | UnknownReasonCode,
  string
> = {
  SELF_MATCH: 'The driver and rider are the same person.',
  OCCURRENCE_MISMATCH: 'The dated trip or travel direction does not match.',
  SKIPPED_OCCURRENCE: 'The driver or rider skipped this dated trip.',
  ROLE_CONFLICT: 'A commute role conflicts with this trip.',
  COMMITMENT_CONFLICT: 'An existing commitment conflicts with this trip.',
  NO_SEAT: 'The driver does not have enough available passenger seats.',
  NO_ROAD_ROUTE: 'The routing provider explicitly reported no road route.',
  WALK_LIMIT: 'A fixture walking assumption exceeds the rider limit.',
  DRIVER_DETOUR_LIMIT: 'The road route exceeds the active driver detour limit.',
  RIDER_RIDE_LIMIT: 'The rider in-vehicle detour exceeds their limit.',
  NO_FEASIBLE_DEPARTURE: 'No driver departure can satisfy all pickup and arrival windows.',
  UNSUPPORTED_DIRECTION: 'This evaluator does not yet support that trip direction.',
  LOCATION_UNCONFIRMED: 'The pickup is not confirmed precisely enough for routing.',
  MISSING_TRAVEL_ESTIMATE: 'A required road estimate is missing or the provider failed.',
  MALFORMED_USER_ID: 'A user identifier is malformed.',
  MALFORMED_OCCURRENCE: 'The dated occurrence is malformed.',
  MALFORMED_WINDOW: 'A schedule window is malformed.',
  MALFORMED_COORDINATE: 'A route coordinate is malformed.',
  MALFORMED_SEAT_COUNT: 'A seat count is malformed.',
  MALFORMED_DURATION: 'A duration is malformed.',
  MALFORMED_LIMIT: 'A configured limit is malformed.',
  MALFORMED_FACTS: 'A trip fact is malformed.',
  MALFORMED_TRAVEL_ESTIMATE: 'A road estimate is malformed.',
  ZERO_BASELINE_PERCENTAGE_LIMIT: 'A percentage detour limit cannot use a zero baseline.',
  INCONSISTENT_TRAVEL_ESTIMATES: 'The supplied road estimates are internally inconsistent.',
};

function formatMinutes(seconds: number): string {
  const minutes = seconds / 60;
  return Number.isInteger(minutes) ? `${minutes} min` : `${minutes.toFixed(1)} min`;
}
