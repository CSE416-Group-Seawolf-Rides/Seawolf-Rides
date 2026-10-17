import { evaluatePair } from './evaluatePair';
import type { PairEvaluation, PairEvaluationInput, RiderTripInput } from './types';

/** The rider is supplied once; each candidate supplies its own driver and travel facts. */
export type DriverCandidate = Omit<PairEvaluationInput, 'rider'>;
export type FeasiblePairEvaluation = Extract<PairEvaluation, { status: 'FEASIBLE' }>;

export interface RankingWeights {
  detour: number;
  scheduleFlexibility: number;
}

export const DEFAULT_RANKING_WEIGHTS: Readonly<RankingWeights> = Object.freeze({
  detour: 60,
  scheduleFlexibility: 40,
});

export interface DriverRankingOptions {
  weights?: Partial<RankingWeights>;
}

export interface EvaluatedDriver {
  driverId: string;
  evaluation: PairEvaluation;
}

export interface DriverRecommendation {
  driverId: string;
  riderId: string;
  evaluation: FeasiblePairEvaluation;
  /** Weighted score from 0 to 100, rounded to two decimal places. */
  score: number;
  /** Each component is a fraction in [0, 1], before applying weights. */
  scoreComponents: RankingWeights;
  explanations: string[];
}

export interface DriverRankingResult {
  recommendations: DriverRecommendation[];
  /** All outcomes, in candidate order, including UNKNOWN and INFEASIBLE. */
  evaluations: EvaluatedDriver[];
}

function rankingWeights(options: DriverRankingOptions): RankingWeights {
  const weights = { ...DEFAULT_RANKING_WEIGHTS, ...options.weights };
  const total = weights.detour + weights.scheduleFlexibility;
  if (
    !Object.values(weights).every((weight) => Number.isFinite(weight) && weight >= 0) ||
    !Number.isFinite(total) || total <= 0
  ) {
    throw new Error('Ranking weights must be finite and non-negative, with a finite positive sum.');
  }
  return weights;
}

function recommendation(
  rider: RiderTripInput,
  candidate: DriverCandidate,
  evaluation: FeasiblePairEvaluation,
  weights: RankingWeights,
): DriverRecommendation {
  const { plan, metrics } = evaluation;
  const detour = metrics.activeDriverDetourLimitSeconds === 0
    ? 1 // Feasibility already guarantees zero detour when the limit is zero.
    : 1 - metrics.driverExtraDurationSeconds / metrics.activeDriverDetourLimitSeconds;
  const availableWindow = candidate.driver.departureWindow.latest - candidate.driver.departureWindow.earliest;
  const feasibleWindow = plan.feasibleDepartureWindow.latest - plan.feasibleDepartureWindow.earliest;
  const scheduleFlexibility = availableWindow === 0 ? 1 : feasibleWindow / availableWindow;
  // Divide weights before multiplication so very large finite weights cannot overflow.
  const totalWeight = weights.detour + weights.scheduleFlexibility;
  const weighted = detour * (weights.detour / totalWeight) +
    scheduleFlexibility * (weights.scheduleFlexibility / totalWeight);
  const score = Math.round(Math.min(1, Math.max(0, weighted)) * 10_000) / 100;

  return {
    driverId: candidate.driver.userId,
    riderId: rider.userId,
    evaluation,
    score,
    scoreComponents: { detour, scheduleFlexibility },
    explanations: [
      `Pickup adds ${metrics.driverExtraDurationSeconds} seconds of the driver's ${metrics.activeDriverDetourLimitSeconds}-second detour limit.`,
      `${feasibleWindow} seconds of feasible departure flexibility remain within the driver's ${availableWindow}-second departure window.`,
      `Departure ${plan.departure}, pickup ${plan.pickup}, campus arrival ${plan.vehicleCampusArrival}, and rider destination arrival ${plan.riderDestinationArrival} (Unix seconds).`,
    ],
  };
}

/** Evaluate candidates once with the canonical model, then rank only feasible plans. */
export function rankDriversForRider(
  rider: RiderTripInput,
  candidates: readonly DriverCandidate[],
  options: DriverRankingOptions = {},
): DriverRankingResult {
  const weights = rankingWeights(options);
  const ids = new Set<string>();
  const evaluations: EvaluatedDriver[] = [];
  const recommendations: DriverRecommendation[] = [];

  for (const candidate of candidates) {
    const driverId = candidate.driver.userId;
    if (ids.has(driverId)) {
      throw new Error('Candidate driver IDs must be unique within a dated ranking request.');
    }
    ids.add(driverId);
    const evaluation = evaluatePair({ ...candidate, rider });
    evaluations.push({ driverId, evaluation });
    if (evaluation.status === 'FEASIBLE') {
      recommendations.push(recommendation(rider, candidate, evaluation, weights));
    }
  }

  recommendations.sort((a, b) =>
    b.score - a.score ||
    a.evaluation.metrics.driverExtraDurationSeconds - b.evaluation.metrics.driverExtraDurationSeconds ||
    (a.driverId < b.driverId ? -1 : a.driverId > b.driverId ? 1 : 0),
  );
  return { recommendations, evaluations };
}
