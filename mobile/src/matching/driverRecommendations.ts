import type { CommuteSchedule, Weekday } from '../commute/commuteModel';
import { getCampusDestinationMapLocation } from '../map/campusDestinations';
import type { DriverOffer } from '../rides/rideModel';
import { participantIdForOffer } from '../profiles/publicProfiles';
import { sealDatedRideProposal, type DatedRideProposalV1 } from '../rides/datedRideProposal';
import type { RouteCoordinate, RoutingAdapter, RoutingResult } from '../routing/types';
import { evaluatePair } from './evaluatePair';
import { rankDriversForRider } from './rankDrivers';
import type { PairEvaluation, PairEvaluationInput, StaticRouteEstimate } from './types';

export const NORMAL_MATCHING_TIME_ZONE = 'America/New_York';
export const NORMAL_MATCHING_MAX_SNAP_METERS = 75;
export const NORMAL_MATCHING_CONCURRENCY = 3;

export interface MinuteWindow {
  earliest: number;
  latest: number;
}

export interface DriverRoutingProfile {
  offerId: string;
  driverStart: RouteCoordinate;
  departureWindowMinutes: MinuteWindow;
  campusArrivalWindowMinutes: MinuteWindow;
  preferredDepartureMinutes: number;
  maxExtraDurationSeconds: number;
  maxExtraDurationRatio?: number;
  pickupServiceSeconds: number;
  skippedDates: readonly string[];
  conflictDates: readonly string[];
}

export interface RiderRecommendationSetup {
  pickupPoint: { id: string; label: string; coordinate: RouteCoordinate } | null;
  pickupWindowMinutes: MinuteWindow | null;
  destinationArrivalWindowMinutes: MinuteWindow | null;
  seatsRequested: number | null;
  accessWalkSeconds: number | null;
  egressWalkSeconds: number | null;
  maxAccessWalkSeconds: number | null;
  maxEgressWalkSeconds: number | null;
  maxExtraInVehicleSeconds: number | null;
}

type CompleteRiderRecommendationSetup = {
  [Key in keyof RiderRecommendationSetup]-?: NonNullable<RiderRecommendationSetup[Key]>;
};

export type RecommendationExclusion =
  | 'NO_ROUTING_PROFILE'
  | 'NOT_OFFERED_ON_DATE'
  | 'NO_PASSENGER_CAPACITY';

export interface DriverRecommendation {
  offer: DriverOffer;
  input?: PairEvaluationInput;
  evaluation: PairEvaluation | null;
  proposal: DatedRideProposalV1 | null;
  excludedReason: RecommendationExclusion | null;
  rank: number | null;
  rankingExplanation: string | null;
  routingFailure: Exclude<RoutingResult, { status: 'SUCCESS' }> | null;
  routingMessage: string | null;
}

export interface DriverRecommendationResult {
  localDate: string;
  timeZone: string;
  recommendations: DriverRecommendation[];
}

export interface EvaluateDriverRecommendationsOptions {
  adapter: RoutingAdapter;
  commute: CommuteSchedule;
  localDate: string;
  timeZone: string;
  riderId: string;
  offers: readonly DriverOffer[];
  profiles: readonly DriverRoutingProfile[];
  setup: RiderRecommendationSetup;
  riderSkipped: boolean;
  riderCommitmentConflict: boolean;
  signal?: AbortSignal;
  concurrency?: number;
  maxSnapMeters?: number;
  /** Overrides the fixture-derived driver identity for a real/local signed-in driver. */
  driverId?: string;
  /** Test seam; production callers use the current clock. */
  evaluatedAtEpochSeconds?: number;
}

const missingEstimate: StaticRouteEstimate = { status: 'MISSING' };

export function validateRecommendationSetup(setup: RiderRecommendationSetup): string[] {
  const issues: string[] = [];
  if (!setup.pickupPoint) issues.push('Choose a public meeting point.');
  if (!setup.pickupWindowMinutes) issues.push('Enter the full pickup-ready window.');
  if (!setup.destinationArrivalWindowMinutes) issues.push('Enter the acceptable campus-arrival window.');
  if (!positiveInteger(setup.seatsRequested)) issues.push('Enter the number of passenger seats needed.');
  if (!nonnegativeInteger(setup.accessWalkSeconds) || !nonnegativeInteger(setup.egressWalkSeconds)) issues.push('Enter both walking estimates.');
  if (!nonnegativeInteger(setup.maxAccessWalkSeconds) || !nonnegativeInteger(setup.maxEgressWalkSeconds)) issues.push('Enter both walking limits.');
  if (!nonnegativeInteger(setup.maxExtraInVehicleSeconds)) issues.push('Enter the maximum extra in-vehicle time.');
  if (setup.pickupWindowMinutes && !validMinuteWindow(setup.pickupWindowMinutes)) issues.push('The pickup window must use valid ordered times.');
  if (setup.destinationArrivalWindowMinutes && !validMinuteWindow(setup.destinationArrivalWindowMinutes)) issues.push('The arrival window must use valid ordered times.');
  return issues;
}

function positiveInteger(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value > 0;
}

function nonnegativeInteger(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 0;
}

function validMinuteWindow(value: MinuteWindow): boolean {
  return Number.isInteger(value.earliest) && Number.isInteger(value.latest) && value.earliest >= 0 && value.latest < 24 * 60 && value.earliest <= value.latest;
}

export function weekdayForLocalDate(localDate: string): Weekday | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[date.getUTCDay()];
}

export function parseClockMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60
    ? hours * 60 + minutes
    : null;
}

/** Converts a wall-clock minute on a local date into an epoch using the named zone. */
export function localMinuteToEpochSeconds(localDate: string, minutes: number, timeZone: string): number {
  if (!validMinuteWindow({ earliest: minutes, latest: minutes }) || !weekdayForLocalDate(localDate)) throw new Error('Invalid local date or minute.');
  const [year, month, day] = localDate.split('-').map(Number);
  const wanted = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  let guess = wanted;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  for (let index = 0; index < 3; index += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    guess += wanted - represented;
  }
  return Math.round(guess / 1000);
}

function available(result: Extract<RoutingResult, { status: 'SUCCESS' }>, leg?: number): StaticRouteEstimate {
  const source = leg === undefined ? result.route : result.route.legs[leg];
  return { status: 'AVAILABLE', durationSeconds: Math.round(source.durationSeconds), distanceMeters: Math.round(source.distanceMeters) };
}

function failedEstimate(result: Exclude<RoutingResult, { status: 'SUCCESS' }>): StaticRouteEstimate {
  return result.code === 'NO_ROUTE' ? { status: 'UNREACHABLE' } : missingEstimate;
}

function buildInput(options: EvaluateDriverRecommendationsOptions, setup: CompleteRiderRecommendationSetup, offer: DriverOffer, profile: DriverRoutingProfile, baseline: StaticRouteEstimate, shared: StaticRouteEstimate[], driverSkipped: boolean, riderRoleConflict: boolean): PairEvaluationInput {
  const campus = getCampusDestinationMapLocation(offer.campusLot).coordinate;
  const occurrence = { localDate: options.localDate, direction: 'TO_CAMPUS' as const };
  const epochWindow = (window: MinuteWindow) => ({ earliest: localMinuteToEpochSeconds(options.localDate, window.earliest, options.timeZone), latest: localMinuteToEpochSeconds(options.localDate, window.latest, options.timeZone) });
  return {
    driver: {
      userId: options.driverId ?? participantIdForOffer(offer),
      occurrence,
      departureWindow: epochWindow(profile.departureWindowMinutes),
      campusArrivalWindow: epochWindow(profile.campusArrivalWindowMinutes),
      preferredDeparture: localMinuteToEpochSeconds(options.localDate, profile.preferredDepartureMinutes, options.timeZone),
      seatsRemaining: offer.seatsLeft,
      maxExtraDurationSeconds: profile.maxExtraDurationSeconds,
      maxExtraDurationRatio: profile.maxExtraDurationRatio,
    },
    rider: {
      userId: options.riderId,
      occurrence,
      pickupWindow: epochWindow(setup.pickupWindowMinutes),
      destinationArrivalWindow: epochWindow(setup.destinationArrivalWindowMinutes),
      seatsRequested: setup.seatsRequested,
      accessWalkSeconds: setup.accessWalkSeconds,
      egressWalkSeconds: setup.egressWalkSeconds,
      maxAccessWalkSeconds: setup.maxAccessWalkSeconds,
      maxEgressWalkSeconds: setup.maxEgressWalkSeconds,
      maxExtraInVehicleSeconds: setup.maxExtraInVehicleSeconds,
    },
    anchors: {
      driverStart: { coordinate: profile.driverStart, accuracy: 'SELECTED_POINT' },
      riderPickup: { coordinate: setup.pickupPoint.coordinate, accuracy: 'SELECTED_POINT' },
      campusDropoff: { coordinate: campus, accuracy: 'SELECTED_POINT' },
    },
    facts: {
      driverSkipped,
      riderSkipped: options.riderSkipped,
      driverRoleConflict: false,
      riderRoleConflict,
      driverCommitmentConflict: profile.conflictDates.includes(options.localDate),
      riderCommitmentConflict: options.riderCommitmentConflict,
    },
    pickupServiceSeconds: profile.pickupServiceSeconds,
    travel: { startToCampus: baseline, startToPickup: shared[0] ?? missingEstimate, pickupToCampus: shared[1] ?? missingEstimate },
  };
}

async function mapWithConcurrency<T, U>(values: readonly T[], concurrency: number, worker: (value: T) => Promise<U>): Promise<U[]> {
  const output = new Array<U>(values.length);
  let next = 0;
  async function work() { while (next < values.length) { const index = next; next += 1; output[index] = await worker(values[index]); } }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, work));
  return output;
}

export async function evaluateDriverRecommendations(options: EvaluateDriverRecommendationsOptions): Promise<DriverRecommendationResult> {
  const setupIssues = validateRecommendationSetup(options.setup);
  if (setupIssues.length > 0) throw new Error(setupIssues.join(' '));
  const setup = options.setup as CompleteRiderRecommendationSetup;
  const weekday = weekdayForLocalDate(options.localDate);
  if (!weekday) throw new Error('A valid selected local date is required.');
  const riderPlan = options.commute.days.find((plan) => plan.day === weekday);
  const riderRoleConflict = !riderPlan || riderPlan.mode === 'drive' || riderPlan.arriveBy === null;
  const profiles = new Map(options.profiles.map((profile) => [profile.offerId, profile]));
  const excluded: DriverRecommendation[] = [];
  const eligible: { offer: DriverOffer; profile: DriverRoutingProfile }[] = [];
  for (const offer of options.offers) {
    const profile = profiles.get(offer.id);
    const reason: RecommendationExclusion | null = !profile ? 'NO_ROUTING_PROFILE' : !offer.days.includes(weekday) ? 'NOT_OFFERED_ON_DATE' : offer.seatsLeft < setup.seatsRequested ? 'NO_PASSENGER_CAPACITY' : null;
    if (reason || !profile) excluded.push({ offer, evaluation: null, proposal: null, excludedReason: reason, rank: null, rankingExplanation: null, routingFailure: null, routingMessage: null });
    else eligible.push({ offer, profile });
  }
  const evaluated = await mapWithConcurrency(eligible, options.concurrency ?? NORMAL_MATCHING_CONCURRENCY, async ({ offer, profile }) => {
    const campusLocation = getCampusDestinationMapLocation(offer.campusLot);
    const campus = campusLocation.coordinate;
    const baselineResult = await options.adapter.route([profile.driverStart, campus], { signal: options.signal });
    const sharedResult = await options.adapter.route([profile.driverStart, setup.pickupPoint.coordinate, campus], { signal: options.signal });
    const baseline = baselineResult.status === 'SUCCESS' ? available(baselineResult) : failedEstimate(baselineResult);
    let shared: StaticRouteEstimate[];
    let routingMessage: string | null = null;
    if (sharedResult.status === 'SUCCESS' && sharedResult.route.legs.length === 2) {
      const pickupSnap = sharedResult.route.snappedWaypoints[1]?.distanceMeters ?? Number.POSITIVE_INFINITY;
      if (pickupSnap <= (options.maxSnapMeters ?? NORMAL_MATCHING_MAX_SNAP_METERS)) {
        shared = [available(sharedResult, 0), available(sharedResult, 1)];
      } else {
        shared = [missingEstimate, missingEstimate];
        routingMessage = `The provider snapped the selected meeting point ${pickupSnap.toFixed(0)} m away, so this route was not confirmed.`;
      }
    } else if (sharedResult.status === 'FAILURE') {
      shared = [failedEstimate(sharedResult), failedEstimate(sharedResult)];
      routingMessage = sharedResult.message;
    } else {
      shared = [missingEstimate, missingEstimate];
      routingMessage = 'The routing provider did not return two ordered route legs.';
    }
    const input = buildInput(options, setup, offer, profile, baseline, shared, profile.skippedDates.includes(options.localDate), riderRoleConflict);
    const routingFailure = baselineResult.status === 'FAILURE' ? baselineResult : sharedResult.status === 'FAILURE' ? sharedResult : null;
    if (!routingMessage && baselineResult.status === 'FAILURE') routingMessage = baselineResult.message;
    const evaluation = evaluatePair(input);
    const evaluatedAtEpochSeconds = options.evaluatedAtEpochSeconds ?? Math.floor(Date.now() / 1000);
    const proposal = evaluation.status === 'FEASIBLE'
      ? sealDatedRideProposal({
          schema: 'seawolf-rides/dated-to-campus-proposal',
          version: 1,
          proposalId: `proposal-${offer.id}-${options.localDate}-${options.riderId}-${evaluatedAtEpochSeconds}`,
          occurrence: { ...input.driver.occurrence, timeZone: options.timeZone },
          participants: { riderId: input.rider.userId, driverId: input.driver.userId, offerId: offer.id },
          agreed: {
            requestedSeats: input.rider.seatsRequested,
            driverStart: { label: `${offer.driverName} confirmed route origin`, coordinate: { ...profile.driverStart }, accuracy: 'SELECTED_POINT' },
            pickup: { pointId: setup.pickupPoint.id, label: setup.pickupPoint.label, coordinate: { ...setup.pickupPoint.coordinate }, accuracy: 'SELECTED_POINT' },
            campusDropoff: { campusLot: offer.campusLot, label: campusLocation.title, coordinate: { ...campus }, accuracy: 'SELECTED_POINT' },
            driverDepartureWindow: { ...input.driver.departureWindow },
            driverCampusArrivalWindow: { ...input.driver.campusArrivalWindow },
            driverPreferredDeparture: input.driver.preferredDeparture,
            driverMaxExtraDurationSeconds: input.driver.maxExtraDurationSeconds,
            driverMaxExtraDurationRatio: input.driver.maxExtraDurationRatio,
            riderPickupWindow: { ...input.rider.pickupWindow },
            riderDestinationArrivalWindow: { ...input.rider.destinationArrivalWindow },
            pickupServiceSeconds: input.pickupServiceSeconds,
            accessWalkSeconds: input.rider.accessWalkSeconds,
            egressWalkSeconds: input.rider.egressWalkSeconds,
            maxAccessWalkSeconds: input.rider.maxAccessWalkSeconds,
            maxEgressWalkSeconds: input.rider.maxEgressWalkSeconds,
            maxExtraInVehicleSeconds: input.rider.maxExtraInVehicleSeconds,
          },
          routingEstimates: {
            evaluatedAtEpochSeconds,
            travel: input.travel,
            plan: evaluation.plan,
            metrics: evaluation.metrics,
          },
        }, evaluatedAtEpochSeconds)
      : null;
    return { offer, input, evaluation, proposal, excludedReason: null, rank: null, rankingExplanation: null, routingFailure, routingMessage } satisfies DriverRecommendation;
  });
  return { localDate: options.localDate, timeZone: options.timeZone, recommendations: rankRecommendations([...evaluated, ...excluded]) };
}

export function rankRecommendations(items: readonly DriverRecommendation[]): DriverRecommendation[] {
  const supplied = items.filter((item) => item.input !== undefined);
  if (!supplied.length) return items.map((item) => ({ ...item, rank: null, rankingExplanation: null }));
  const ranked = rankDriversForRider(supplied[0].input!.rider, supplied.map((item) => item.input!)).recommendations;
  return items.map((item) => {
    const index = ranked.findIndex((recommendation) => recommendation.driverId === item.input?.driver.userId);
    return { ...item, rank: index < 0 ? null : index + 1, rankingExplanation: index < 0 ? null : ranked[index].explanations.join(' ') };
  });
}

export class LatestDriverRecommendationEvaluation {
  private generation = 0;
  private controller: AbortController | null = null;
  async run(evaluate: (signal: AbortSignal) => Promise<DriverRecommendationResult>): Promise<{ status: 'CURRENT'; result: DriverRecommendationResult } | { status: 'STALE' }> {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const result = await evaluate(controller.signal);
    if (generation !== this.generation || controller.signal.aborted) return { status: 'STALE' };
    this.controller = null;
    return { status: 'CURRENT', result };
  }
  cancel() { this.generation += 1; this.controller?.abort(); this.controller = null; }
}
