import type { DriverOccurrenceV1, GroupRoutePlanV1, RiderIntentV1 } from '../rides/groupRideContracts';
import {
  evaluateGroupRoute,
  type DirectedGroupTravelLeg,
  type EvaluateGroupRouteOptions,
  type GroupRouteEvaluation,
  type GroupTravelEstimates,
} from '../matching/groupRouteEvaluator';
import type { StaticRouteEstimate } from '../matching/types';
import {
  isValidRouteCoordinate,
  type RoadRoute,
  type RouteCoordinate,
  type RoutingAdapter,
  type RoutingFailureCode,
} from './types';

export const DIRECTED_TRAVEL_DEFAULT_CONCURRENCY = 3;
export const DIRECTED_TRAVEL_MAX_PICKUP_SNAP_METERS = 75;
/** Local demo discovery reuse; this timestamp is not a live-traffic guarantee. */
export const DIRECTED_TRAVEL_DISCOVERY_TTL_MS = 5 * 60 * 1000;
/** Stricter local acceptance reuse; Stage 5 still owns authoritative freshness checks. */
export const DIRECTED_TRAVEL_ACCEPTANCE_TTL_MS = 30 * 1000;

export interface DirectedTravelEndpoint {
  pointId: string;
  coordinate: RouteCoordinate;
}

export interface DirectedLegRequest {
  from: DirectedTravelEndpoint;
  to: DirectedTravelEndpoint;
}

export type DirectedTravelPurpose = 'DISCOVERY' | 'ACCEPTANCE';

export interface TravelCacheOwnership {
  mode: 'FIXTURE' | 'LIVE';
  providerId: string;
  profile: string;
  optionsKey: string;
  rootGeneration: string;
  estimateVersion: string;
}

export type DirectedLegResult =
  | {
      status: 'AVAILABLE';
      estimate: Extract<StaticRouteEstimate, { status: 'AVAILABLE' }>;
      source: 'ZERO' | 'FIXTURE' | 'CACHE' | 'PROVIDER';
      evaluatedAtEpochSeconds: number;
    }
  | {
      status: 'UNREACHABLE';
      estimate: Extract<StaticRouteEstimate, { status: 'UNREACHABLE' }>;
      source: 'FIXTURE' | 'CACHE' | 'PROVIDER';
      evaluatedAtEpochSeconds: number;
    }
  | {
      status: 'UNKNOWN';
      code: RoutingFailureCode | 'STALE' | 'MALFORMED_RESULT' | 'MODE_MISMATCH';
      retryable: boolean;
      message: string;
    };

export interface DirectedLegBatchItem {
  request: DirectedLegRequest;
  result: DirectedLegResult;
}

export interface DirectedLegBatchResult {
  status: 'COMPLETE' | 'PARTIAL' | 'CANCELLED' | 'STALE';
  items: DirectedLegBatchItem[];
  ownership: TravelCacheOwnership;
}

export interface DirectedTravelDiagnostics {
  uniqueLegWork: number;
  directedLegProviderRequests: number;
  cacheHits: number;
  zeroLegs: number;
  geometryRequests: number;
  activeProviderRequests: number;
  maxConcurrentProviderRequests: number;
  ordersEvaluated: number;
  evaluationTimeMs: number;
  providerTimeMs: number;
  staleResponses: number;
  statusCounts: {
    available: number;
    unreachable: number;
    unknown: number;
    cancelled: number;
    stale: number;
  };
}

interface CacheEntry {
  estimate: Extract<StaticRouteEstimate, { status: 'AVAILABLE' | 'UNREACHABLE' }>;
  evaluatedAtEpochSeconds: number;
  storedAtMs: number;
}

interface InFlightEntry {
  controller: AbortController;
  subscribers: Set<symbol>;
  promise: Promise<DirectedLegResult>;
  settled: boolean;
}

export interface SharedLiveDirectedTravelSourceOptions {
  adapter: RoutingAdapter;
  rootGeneration: string;
  concurrency?: number;
  discoveryTtlMs?: number;
  acceptanceTtlMs?: number;
  maxSnapMeters?: number;
  nowMs?: () => number;
}

export class SharedLiveDirectedTravelSource {
  private readonly adapter: RoutingAdapter;
  private readonly concurrency: number;
  private readonly discoveryTtlMs: number;
  private readonly acceptanceTtlMs: number;
  private readonly maxSnapMeters: number;
  private readonly nowMs: () => number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, InFlightEntry>();
  private readonly queued: (() => void)[] = [];
  private readonly geometryControllers = new Set<AbortController>();
  private rootGeneration: string;
  private generationRevision = 0;
  private active = 0;
  private counters = freshDiagnostics();

  constructor(options: SharedLiveDirectedTravelSourceOptions) {
    if (!nonempty(options.rootGeneration)) throw new Error('A root generation is required.');
    const concurrency = options.concurrency ?? DIRECTED_TRAVEL_DEFAULT_CONCURRENCY;
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Concurrency must be a positive integer.');
    this.adapter = options.adapter;
    this.rootGeneration = options.rootGeneration;
    this.concurrency = concurrency;
    this.discoveryTtlMs = validTtl(options.discoveryTtlMs ?? DIRECTED_TRAVEL_DISCOVERY_TTL_MS);
    this.acceptanceTtlMs = validTtl(options.acceptanceTtlMs ?? DIRECTED_TRAVEL_ACCEPTANCE_TTL_MS);
    this.maxSnapMeters = validNonnegative(options.maxSnapMeters ?? DIRECTED_TRAVEL_MAX_PICKUP_SNAP_METERS);
    this.nowMs = options.nowMs ?? Date.now;
  }

  beginRootGeneration(rootGeneration: string): void {
    if (!nonempty(rootGeneration)) throw new Error('A root generation is required.');
    if (rootGeneration === this.rootGeneration) return;
    this.rootGeneration = rootGeneration;
    this.generationRevision += 1;
    for (const entry of this.inFlight.values()) entry.controller.abort();
    for (const controller of this.geometryControllers) controller.abort();
    this.cache.clear();
  }

  async getLeg(
    request: DirectedLegRequest,
    ownership: TravelCacheOwnership,
    purpose: DirectedTravelPurpose,
    signal?: AbortSignal,
  ): Promise<DirectedLegResult> {
    if (!validRequest(request) || !validOwnership(ownership) || ownership.mode !== 'LIVE') {
      return this.count({ status: 'UNKNOWN', code: 'MALFORMED_RESULT', retryable: false, message: 'The directed leg request or cache ownership is invalid.' });
    }
    if (ownership.rootGeneration !== this.rootGeneration) {
      return this.count(staleResult('The directed leg belongs to an inactive root generation.'));
    }
    if (signal?.aborted) return this.count(cancelledResult());
    if (sameCoordinate(request.from.coordinate, request.to.coordinate)) {
      this.counters.zeroLegs += 1;
      return this.count({
        status: 'AVAILABLE',
        estimate: { status: 'AVAILABLE', durationSeconds: 0, distanceMeters: 0 },
        source: 'ZERO',
        evaluatedAtEpochSeconds: Math.floor(this.nowMs() / 1000),
      });
    }

    const key = cacheKey(request, ownership);
    const cached = this.cache.get(key);
    const ttl = purpose === 'ACCEPTANCE' ? this.acceptanceTtlMs : this.discoveryTtlMs;
    if (cached && this.nowMs() - cached.storedAtMs <= ttl) {
      this.counters.cacheHits += 1;
      return this.count(cacheResult(cached));
    }

    let entry = this.inFlight.get(key);
    if (!entry) {
      const controller = new AbortController();
      const generationRevision = this.generationRevision;
      const created: InFlightEntry = {
        controller,
        subscribers: new Set(),
        promise: Promise.resolve(staleResult('Work has not started.')),
        settled: false,
      };
      this.counters.uniqueLegWork += 1;
      created.promise = this.schedule(async () => this.fetchProviderLeg(
        request,
        ownership,
        key,
        controller,
        generationRevision,
      )).finally(() => {
        created.settled = true;
        if (this.inFlight.get(key) === created) this.inFlight.delete(key);
      });
      entry = created;
      this.inFlight.set(key, entry);
    }
    return this.subscribe(entry, signal);
  }

  async getLegs(
    requests: readonly DirectedLegRequest[],
    ownership: TravelCacheOwnership,
    purpose: DirectedTravelPurpose,
    signal?: AbortSignal,
  ): Promise<DirectedLegBatchResult> {
    if (!Array.isArray(requests)) {
      return { status: 'PARTIAL', items: [], ownership };
    }
    const results = await Promise.all(requests.map(async (request) => ({
      request,
      result: await this.getLeg(request, ownership, purpose, signal),
    })));
    return { status: batchStatus(results), items: results, ownership };
  }

  recordEvaluation(evaluation: GroupRouteEvaluation, elapsedMs: number): void {
    this.counters.ordersEvaluated += evaluation.diagnostics.evaluatedOrders;
    if (Number.isFinite(elapsedMs) && elapsedMs >= 0) this.counters.evaluationTimeMs += elapsedMs;
  }

  evaluateGroup(options: EvaluateGroupRouteOptions): GroupRouteEvaluation {
    const startedAt = this.nowMs();
    const evaluation = evaluateGroupRoute(options);
    this.recordEvaluation(evaluation, this.nowMs() - startedAt);
    return evaluation;
  }

  diagnostics(): DirectedTravelDiagnostics {
    return cloneDiagnostics(this.counters);
  }

  resetDiagnostics(): void {
    this.counters = freshDiagnostics();
  }

  async routeSelectedGeometry(options: SelectedGeometryOptions): Promise<SelectedGeometryResult> {
    if (!validOwnership(options.ownership)) {
      return { status: 'UNKNOWN', code: 'MALFORMED_RESULT', message: 'The geometry cache ownership is invalid.' };
    }
    if (options.ownership.mode !== 'LIVE' || options.planningTravel.mode !== 'LIVE') {
      return { status: 'UNKNOWN', code: 'MODE_MISMATCH', message: 'Fixture metrics cannot be combined with live road geometry.' };
    }
    if (options.planningTravel.providerId !== options.ownership.providerId
      || options.plan.routing.mode !== options.planningTravel.mode
      || options.plan.routing.providerId !== options.planningTravel.providerId) {
      return { status: 'UNKNOWN', code: 'MODE_MISMATCH', message: 'Planning metrics, plan routing, and geometry ownership must use one provider and mode.' };
    }
    if (options.plan.routing.estimateRevision !== options.planningTravel.revision
      || options.plan.generationId !== options.driver.generationId) {
      this.counters.staleResponses += 1;
      return { status: 'STALE', message: 'The selected plan no longer matches its planning estimates or driver generation.' };
    }
    if (options.ownership.rootGeneration !== this.rootGeneration) {
      this.counters.staleResponses += 1;
      return { status: 'STALE', message: 'The selected plan belongs to an inactive root generation.' };
    }
    const ordered = orderedPlanEndpoints(options.driver, options.plan);
    if (!ordered) return { status: 'UNKNOWN', code: 'MALFORMED_RESULT', message: 'The selected plan does not contain one complete ordered pickup manifest.' };
    const controller = new AbortController();
    const generationRevision = this.generationRevision;
    const cancel = () => controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) controller.abort();
    this.geometryControllers.add(controller);
    this.counters.geometryRequests += 1;
    try {
      const result = await this.schedule(async () => {
        if (controller.signal.aborted) return null;
        const startedAt = this.nowMs();
        this.startProviderRequest();
        try {
          return await this.adapter.route(ordered.map((endpoint) => endpoint.coordinate), { signal: controller.signal });
        } finally {
          this.finishProviderRequest(startedAt);
        }
      });
      if (generationRevision !== this.generationRevision || options.ownership.rootGeneration !== this.rootGeneration) {
        this.counters.staleResponses += 1;
        return { status: 'STALE', message: 'The geometry response arrived after its root generation changed.' };
      }
      if (!result) return { status: 'UNKNOWN', code: 'CANCELLED', message: 'The geometry request was cancelled.' };
      if (result.status === 'FAILURE') {
        if (result.code === 'CANCELLED') return { status: 'UNKNOWN', code: 'CANCELLED', message: result.message };
        return { status: 'UNKNOWN', code: result.code, message: result.message };
      }
      if (result.route.provider.id !== options.ownership.providerId) {
        return { status: 'UNKNOWN', code: 'MALFORMED_RESULT', message: 'The geometry provider does not match the cache owner.' };
      }
      const validation = validateOrderedGeometry(result.route, ordered, this.maxSnapMeters);
      if (!validation.ok) return { status: 'UNKNOWN', code: 'MALFORMED_RESULT', message: validation.message };
      const updatedTravel = updateTravelFromGeometry(
        options.planningTravel,
        ordered,
        result.route,
        Math.floor(this.nowMs() / 1000),
      );
      const changed = geometryChanged(options.planningTravel, ordered, result.route);
      this.storeGeometryLegs(ordered, result.route, options.ownership);
      if (!changed) {
        return {
          status: 'VALIDATED',
          route: result.route,
          travel: updatedTravel,
          plan: withGeometryValid(options.plan, updatedTravel),
        };
      }
      const previousElapsed = options.plan.metrics.elapsedDurationSeconds
        - options.plan.metrics.incrementalAddedDriverDurationSeconds;
      const evaluationStartedAt = this.nowMs();
      const evaluation = evaluateGroupRoute({
        driver: options.driver,
        acceptedMembers: options.plan.riderPromises,
        restrictions: { fixedRequestOrder: options.plan.selectedRequestOrder },
        travel: updatedTravel,
        currentPlanElapsedDurationSeconds: previousElapsed,
      });
      this.recordEvaluation(evaluation, this.nowMs() - evaluationStartedAt);
      if (evaluation.status !== 'FEASIBLE') {
        return { status: 'STALE_PLAN', route: result.route, travel: updatedTravel, evaluation };
      }
      return {
        status: 'REVALIDATED',
        route: result.route,
        travel: updatedTravel,
        plan: withGeometryValid(evaluation.plan, updatedTravel),
        evaluation,
      };
    } finally {
      options.signal?.removeEventListener('abort', cancel);
      this.geometryControllers.delete(controller);
    }
  }

  private async fetchProviderLeg(
    request: DirectedLegRequest,
    ownership: TravelCacheOwnership,
    key: string,
    controller: AbortController,
    generationRevision: number,
  ): Promise<DirectedLegResult> {
    if (generationRevision !== this.generationRevision || ownership.rootGeneration !== this.rootGeneration) {
      this.counters.staleResponses += 1;
      return staleResult('The directed leg work belongs to an inactive root generation.');
    }
    if (controller.signal.aborted) return cancelledResult();
    const startedAt = this.nowMs();
    this.counters.directedLegProviderRequests += 1;
    this.startProviderRequest();
    try {
      const result = await this.adapter.route([request.from.coordinate, request.to.coordinate], { signal: controller.signal });
      if (generationRevision !== this.generationRevision || ownership.rootGeneration !== this.rootGeneration) {
        this.counters.staleResponses += 1;
        return staleResult('The directed leg response arrived after its root generation changed.');
      }
      if (result.status === 'FAILURE') {
        if (result.code === 'NO_ROUTE') {
          const storedAtMs = this.nowMs();
          const entry: CacheEntry = {
            estimate: { status: 'UNREACHABLE' },
            evaluatedAtEpochSeconds: Math.floor(storedAtMs / 1000),
            storedAtMs,
          };
          this.cache.set(key, entry);
          return { status: 'UNREACHABLE', estimate: { status: 'UNREACHABLE' }, source: 'PROVIDER', evaluatedAtEpochSeconds: entry.evaluatedAtEpochSeconds };
        }
        return {
          status: 'UNKNOWN',
          code: result.code,
          retryable: result.retryable,
          message: result.message,
        };
      }
      if (result.route.provider.id !== ownership.providerId) {
        return { status: 'UNKNOWN', code: 'MALFORMED_RESULT', retryable: true, message: 'The provider response does not match the cache owner.' };
      }
      const estimate = numericalEstimate(result.route, request, this.maxSnapMeters);
      if (!estimate) {
        return { status: 'UNKNOWN', code: 'MALFORMED_RESULT', retryable: true, message: 'The provider did not return one valid ordered numerical leg.' };
      }
      const storedAtMs = this.nowMs();
      const entry: CacheEntry = {
        estimate,
        evaluatedAtEpochSeconds: Math.floor(storedAtMs / 1000),
        storedAtMs,
      };
      this.cache.set(key, entry);
      return { status: 'AVAILABLE', estimate, source: 'PROVIDER', evaluatedAtEpochSeconds: entry.evaluatedAtEpochSeconds };
    } catch (error) {
      if (generationRevision !== this.generationRevision || ownership.rootGeneration !== this.rootGeneration) {
        this.counters.staleResponses += 1;
        return staleResult('The directed leg error arrived after its root generation changed.');
      }
      const message = error instanceof Error ? error.message : 'The routing adapter threw an unknown error.';
      return { status: 'UNKNOWN', code: 'NETWORK_ERROR', retryable: true, message };
    } finally {
      this.finishProviderRequest(startedAt);
    }
  }

  private subscribe(entry: InFlightEntry, signal?: AbortSignal): Promise<DirectedLegResult> {
    const token = Symbol('directed-leg-subscriber');
    entry.subscribers.add(token);
    return new Promise((resolve) => {
      let completed = false;
      const finish = (result: DirectedLegResult) => {
        if (completed) return;
        completed = true;
        signal?.removeEventListener('abort', cancel);
        entry.subscribers.delete(token);
        resolve(this.count(result));
      };
      const cancel = () => {
        finish(cancelledResult());
        if (!entry.settled && entry.subscribers.size === 0) entry.controller.abort();
      };
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      else entry.promise.then(finish, (error) => finish({
        status: 'UNKNOWN', code: 'NETWORK_ERROR', retryable: true,
        message: error instanceof Error ? error.message : 'The shared leg work failed.',
      }));
    });
  }

  private schedule<T>(work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active += 1;
        Promise.resolve().then(work).then(resolve, reject).finally(() => {
          this.active -= 1;
          this.queued.shift()?.();
        });
      };
      if (this.active < this.concurrency) start();
      else this.queued.push(start);
    });
  }

  private startProviderRequest(): void {
    this.counters.activeProviderRequests += 1;
    this.counters.maxConcurrentProviderRequests = Math.max(
      this.counters.maxConcurrentProviderRequests,
      this.counters.activeProviderRequests,
    );
  }

  private finishProviderRequest(startedAt: number): void {
    this.counters.activeProviderRequests -= 1;
    this.counters.providerTimeMs += Math.max(0, this.nowMs() - startedAt);
  }

  private count(result: DirectedLegResult): DirectedLegResult {
    if (result.status === 'AVAILABLE') this.counters.statusCounts.available += 1;
    else if (result.status === 'UNREACHABLE') this.counters.statusCounts.unreachable += 1;
    else if (result.code === 'CANCELLED') this.counters.statusCounts.cancelled += 1;
    else if (result.code === 'STALE') this.counters.statusCounts.stale += 1;
    else this.counters.statusCounts.unknown += 1;
    return result;
  }

  private storeGeometryLegs(
    ordered: DirectedTravelEndpoint[],
    route: RoadRoute,
    ownership: TravelCacheOwnership,
  ): void {
    const storedAtMs = this.nowMs();
    ordered.slice(1).forEach((to, index) => {
      const from = ordered[index];
      const leg = route.legs[index];
      this.cache.set(cacheKey({ from, to }, ownership), {
        estimate: {
          status: 'AVAILABLE',
          durationSeconds: Math.round(leg.durationSeconds),
          distanceMeters: Math.round(leg.distanceMeters),
        },
        evaluatedAtEpochSeconds: Math.floor(storedAtMs / 1000),
        storedAtMs,
      });
    });
  }
}

export interface FixtureDirectedTravelSourceOptions {
  rootGeneration: string;
  providerId: string;
  evaluatedAtEpochSeconds: number;
  resolve: (from: RouteCoordinate, to: RouteCoordinate) => StaticRouteEstimate | undefined;
}

export class FixtureDirectedTravelSource {
  private readonly options: FixtureDirectedTravelSourceOptions;
  private readonly cache = new Map<string, StaticRouteEstimate | undefined>();
  private counters = freshDiagnostics();

  constructor(options: FixtureDirectedTravelSourceOptions) {
    this.options = options;
  }

  async getLegs(
    requests: readonly DirectedLegRequest[],
    ownership: TravelCacheOwnership,
    _purpose: DirectedTravelPurpose,
    signal?: AbortSignal,
  ): Promise<DirectedLegBatchResult> {
    const items = requests.map((request): DirectedLegBatchItem => {
      let result: DirectedLegResult;
      if (signal?.aborted) result = cancelledResult();
      else if (ownership.mode !== 'FIXTURE') {
        result = { status: 'UNKNOWN', code: 'MODE_MISMATCH', retryable: false, message: 'Fixture estimates require fixture cache ownership.' };
      } else if (ownership.providerId !== this.options.providerId) {
        result = { status: 'UNKNOWN', code: 'MODE_MISMATCH', retryable: false, message: 'The fixture provider does not match the cache owner.' };
      } else if (ownership.rootGeneration !== this.options.rootGeneration) {
        result = staleResult('The fixture request belongs to an inactive root generation.');
      } else if (!validRequest(request)) {
        result = { status: 'UNKNOWN', code: 'MALFORMED_RESULT', retryable: false, message: 'The fixture leg request is invalid.' };
      } else if (sameCoordinate(request.from.coordinate, request.to.coordinate)) {
        this.counters.zeroLegs += 1;
        result = { status: 'AVAILABLE', estimate: { status: 'AVAILABLE', durationSeconds: 0, distanceMeters: 0 }, source: 'ZERO', evaluatedAtEpochSeconds: this.options.evaluatedAtEpochSeconds };
      } else {
        const key = cacheKey(request, ownership);
        let estimate = this.cache.get(key);
        if (this.cache.has(key)) this.counters.cacheHits += 1;
        else {
          this.counters.uniqueLegWork += 1;
          estimate = this.options.resolve(request.from.coordinate, request.to.coordinate);
          this.cache.set(key, estimate);
        }
        if (!estimate || estimate.status === 'MISSING') {
          result = { status: 'UNKNOWN', code: 'MALFORMED_RESULT', retryable: false, message: 'The fixture has no directed estimate for these endpoints.' };
        } else if (estimate.status === 'UNREACHABLE') {
          result = { status: 'UNREACHABLE', estimate, source: 'FIXTURE', evaluatedAtEpochSeconds: this.options.evaluatedAtEpochSeconds };
        } else {
          result = { status: 'AVAILABLE', estimate: { ...estimate }, source: 'FIXTURE', evaluatedAtEpochSeconds: this.options.evaluatedAtEpochSeconds };
        }
      }
      countInto(this.counters, result);
      return { request, result };
    });
    return { status: batchStatus(items), items, ownership };
  }

  diagnostics(): DirectedTravelDiagnostics {
    return cloneDiagnostics(this.counters);
  }

  recordEvaluation(evaluation: GroupRouteEvaluation, elapsedMs: number): void {
    this.counters.ordersEvaluated += evaluation.diagnostics.evaluatedOrders;
    if (Number.isFinite(elapsedMs) && elapsedMs >= 0) this.counters.evaluationTimeMs += elapsedMs;
  }

  evaluateGroup(options: EvaluateGroupRouteOptions): GroupRouteEvaluation {
    const startedAt = Date.now();
    const evaluation = evaluateGroupRoute(options);
    this.recordEvaluation(evaluation, Date.now() - startedAt);
    return evaluation;
  }
}

export interface SelectedGeometryOptions {
  driver: DriverOccurrenceV1;
  plan: GroupRoutePlanV1;
  planningTravel: GroupTravelEstimates;
  ownership: TravelCacheOwnership;
  signal?: AbortSignal;
}

export type SelectedGeometryResult =
  | { status: 'VALIDATED'; route: RoadRoute; travel: GroupTravelEstimates; plan: GroupRoutePlanV1 }
  | { status: 'REVALIDATED'; route: RoadRoute; travel: GroupTravelEstimates; plan: GroupRoutePlanV1; evaluation: Extract<GroupRouteEvaluation, { status: 'FEASIBLE' }> }
  | { status: 'STALE_PLAN'; route: RoadRoute; travel: GroupTravelEstimates; evaluation: Exclude<GroupRouteEvaluation, { status: 'FEASIBLE' }> }
  | { status: 'STALE'; message: string }
  | { status: 'UNKNOWN'; code: RoutingFailureCode | 'MALFORMED_RESULT' | 'MODE_MISMATCH'; message: string };

export function createScenarioLegRequests(
  drivers: readonly DriverOccurrenceV1[],
  intents: readonly RiderIntentV1[],
): DirectedLegRequest[] {
  const confirmedPickups = intents.flatMap((intent) => intent.pickup.status === 'CONFIRMED'
    ? [{ pointId: intent.pickup.point.pointId, coordinate: { ...intent.pickup.point.coordinate } }]
    : []);
  const requests: DirectedLegRequest[] = [];
  for (const driver of drivers) {
    const start = endpoint(driver.start);
    requests.push({ from: start, to: endpoint(driver.campusDropoff) });
    for (const pickup of confirmedPickups) requests.push({ from: start, to: pickup });
  }
  for (const from of confirmedPickups) {
    for (const to of confirmedPickups) {
      if (from.pointId !== to.pointId) requests.push({ from, to });
    }
    if (drivers[0]) requests.push({ from, to: endpoint(drivers[0].campusDropoff) });
  }
  return requests;
}

export function countUniqueNonzeroCoordinatePairs(requests: readonly DirectedLegRequest[]): number {
  return new Set(requests
    .filter((request) => !sameCoordinate(request.from.coordinate, request.to.coordinate))
    .map((request) => coordinatePairKey(request.from.coordinate, request.to.coordinate))).size;
}

export function batchToGroupTravelEstimates(options: {
  batch: DirectedLegBatchResult;
  baseline: DirectedLegRequest;
  mode: 'FIXTURE' | 'LIVE';
  providerId: string;
  revision: string;
}): GroupTravelEstimates {
  const matching = (request: DirectedLegRequest) => options.batch.items.find((item) => (
    item.request.from.pointId === request.from.pointId && item.request.to.pointId === request.to.pointId
  ));
  const baseline = matching(options.baseline);
  const estimateFor = (item: DirectedLegBatchItem | undefined): StaticRouteEstimate => {
    if (!item || item.result.status === 'UNKNOWN') return { status: 'MISSING' };
    return { ...item.result.estimate };
  };
  const evaluatedAtEpochSeconds = options.batch.items.reduce((latest, item) => (
    item.result.status === 'UNKNOWN' ? latest : Math.max(latest, item.result.evaluatedAtEpochSeconds)
  ), 0);
  return {
    solo: estimateFor(baseline),
    legs: options.batch.items.map((item): DirectedGroupTravelLeg => ({
      fromPointId: item.request.from.pointId,
      toPointId: item.request.to.pointId,
      estimate: estimateFor(item),
    })),
    mode: options.mode,
    providerId: options.providerId,
    evaluatedAtEpochSeconds,
    revision: options.revision,
  };
}

function numericalEstimate(
  route: RoadRoute,
  request: DirectedLegRequest,
  maxSnapMeters: number,
): Extract<StaticRouteEstimate, { status: 'AVAILABLE' }> | null {
  if (route.legs.length !== 1 || route.snappedWaypoints.length !== 2) return null;
  if (!sameCoordinate(route.snappedWaypoints[0].input, request.from.coordinate)
    || !sameCoordinate(route.snappedWaypoints[1].input, request.to.coordinate)
    || route.snappedWaypoints.some((waypoint) => !Number.isFinite(waypoint.distanceMeters) || waypoint.distanceMeters > maxSnapMeters)) return null;
  const leg = route.legs[0];
  if (!Number.isFinite(leg.durationSeconds) || leg.durationSeconds < 0
    || !Number.isFinite(leg.distanceMeters) || leg.distanceMeters < 0) return null;
  return {
    status: 'AVAILABLE',
    durationSeconds: Math.round(leg.durationSeconds),
    distanceMeters: Math.round(leg.distanceMeters),
  };
}

function orderedPlanEndpoints(driver: DriverOccurrenceV1, plan: GroupRoutePlanV1): DirectedTravelEndpoint[] | null {
  if (plan.driverOccurrenceId !== driver.id || plan.selectedRequestOrder.length !== plan.riderPromises.length) return null;
  const byRequest = new Map(plan.riderPromises.map((member) => [member.requestId, member]));
  if (byRequest.size !== plan.riderPromises.length) return null;
  const pickups = plan.selectedRequestOrder.map((requestId) => byRequest.get(requestId)?.pickup);
  if (pickups.some((pickup) => !pickup)) return null;
  return [endpoint(driver.start), ...(pickups as NonNullable<(typeof pickups)[number]>[]).map(endpoint), endpoint(driver.campusDropoff)];
}

function validateOrderedGeometry(
  route: RoadRoute,
  ordered: DirectedTravelEndpoint[],
  maxSnapMeters: number,
): { ok: true } | { ok: false; message: string } {
  if (route.legs.length !== ordered.length - 1 || route.snappedWaypoints.length !== ordered.length) {
    return { ok: false, message: 'The geometry response does not contain the expected ordered leg and waypoint counts.' };
  }
  if (route.snappedWaypoints.some((waypoint, index) => !sameCoordinate(waypoint.input, ordered[index].coordinate))) {
    return { ok: false, message: 'The geometry response reordered or replaced a requested stop.' };
  }
  const pickupSnaps = route.snappedWaypoints.slice(1, -1);
  if (pickupSnaps.some((waypoint) => !Number.isFinite(waypoint.distanceMeters) || waypoint.distanceMeters > maxSnapMeters)) {
    return { ok: false, message: 'At least one pickup snapped too far from its confirmed point.' };
  }
  if (route.legs.some((leg) => !Number.isFinite(leg.durationSeconds) || leg.durationSeconds < 0
    || !Number.isFinite(leg.distanceMeters) || leg.distanceMeters < 0)) {
    return { ok: false, message: 'The geometry response contains malformed leg metrics.' };
  }
  return { ok: true };
}

function updateTravelFromGeometry(
  travel: GroupTravelEstimates,
  ordered: DirectedTravelEndpoint[],
  route: RoadRoute,
  evaluatedAtEpochSeconds: number,
): GroupTravelEstimates {
  const replacements = new Map<string, DirectedGroupTravelLeg>();
  ordered.slice(1).forEach((to, index) => {
    const from = ordered[index];
    replacements.set(pointPairKey(from.pointId, to.pointId), {
      fromPointId: from.pointId,
      toPointId: to.pointId,
      estimate: {
        status: 'AVAILABLE',
        durationSeconds: Math.round(route.legs[index].durationSeconds),
        distanceMeters: Math.round(route.legs[index].distanceMeters),
      },
    });
  });
  const retained = travel.legs.filter((leg) => !replacements.has(pointPairKey(leg.fromPointId, leg.toPointId)));
  const legs = [...retained, ...replacements.values()];
  const solo = ordered.length === 2
    ? { ...replacements.get(pointPairKey(ordered[0].pointId, ordered[1].pointId))!.estimate }
    : travel.solo;
  return {
    ...travel,
    solo,
    legs,
    evaluatedAtEpochSeconds,
    revision: `${travel.revision}:geometry:${evaluatedAtEpochSeconds}:${stableLegHash([...replacements.values()])}`,
  };
}

function geometryChanged(
  travel: GroupTravelEstimates,
  ordered: DirectedTravelEndpoint[],
  route: RoadRoute,
): boolean {
  return ordered.slice(1).some((to, index) => {
    const from = ordered[index];
    const expected = travel.legs.find((leg) => leg.fromPointId === from.pointId && leg.toPointId === to.pointId)?.estimate;
    const actual = route.legs[index];
    return expected?.status !== 'AVAILABLE'
      || expected.durationSeconds !== Math.round(actual.durationSeconds)
      || expected.distanceMeters !== Math.round(actual.distanceMeters);
  });
}

function withGeometryValid(plan: GroupRoutePlanV1, travel: GroupTravelEstimates): GroupRoutePlanV1 {
  return {
    ...plan,
    routing: {
      ...plan.routing,
      providerId: travel.providerId,
      estimateTimestampEpochSeconds: travel.evaluatedAtEpochSeconds,
      estimateRevision: travel.revision,
      geometryValidity: 'VALID',
    },
  };
}

function stableLegHash(legs: DirectedGroupTravelLeg[]): string {
  const value = JSON.stringify(legs);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function cacheKey(request: DirectedLegRequest, ownership: TravelCacheOwnership): string {
  return [ownership.mode, ownership.providerId, ownership.profile, ownership.optionsKey,
    ownership.rootGeneration, ownership.estimateVersion,
    coordinatePairKey(request.from.coordinate, request.to.coordinate)].join('|');
}

function coordinatePairKey(from: RouteCoordinate, to: RouteCoordinate): string {
  return `${coordinateKey(from)}>${coordinateKey(to)}`;
}

function pointPairKey(fromPointId: string, toPointId: string): string {
  return `${fromPointId}\u0000${toPointId}`;
}

function coordinateKey(coordinate: RouteCoordinate): string {
  return `${coordinate.latitude},${coordinate.longitude}`;
}

function endpoint(point: { pointId: string; coordinate: RouteCoordinate }): DirectedTravelEndpoint {
  return { pointId: point.pointId, coordinate: { ...point.coordinate } };
}

function sameCoordinate(left: RouteCoordinate, right: RouteCoordinate): boolean {
  return left.latitude === right.latitude && left.longitude === right.longitude;
}

function validRequest(request: DirectedLegRequest): boolean {
  return Boolean(request) && nonempty(request.from?.pointId) && nonempty(request.to?.pointId)
    && isValidRouteCoordinate(request.from?.coordinate) && isValidRouteCoordinate(request.to?.coordinate);
}

function validOwnership(ownership: TravelCacheOwnership): boolean {
  return Boolean(ownership) && (ownership.mode === 'FIXTURE' || ownership.mode === 'LIVE')
    && [ownership.providerId, ownership.profile, ownership.optionsKey,
      ownership.rootGeneration, ownership.estimateVersion].every(nonempty);
}

function validTtl(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('Cache TTL must be finite and nonnegative.');
  return value;
}

function validNonnegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('The value must be finite and nonnegative.');
  return value;
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function cancelledResult(): DirectedLegResult {
  return { status: 'UNKNOWN', code: 'CANCELLED', retryable: true, message: 'The directed leg request was cancelled.' };
}

function staleResult(message: string): DirectedLegResult {
  return { status: 'UNKNOWN', code: 'STALE', retryable: true, message };
}

function cacheResult(entry: CacheEntry): DirectedLegResult {
  return entry.estimate.status === 'AVAILABLE'
    ? { status: 'AVAILABLE', estimate: { ...entry.estimate }, source: 'CACHE', evaluatedAtEpochSeconds: entry.evaluatedAtEpochSeconds }
    : { status: 'UNREACHABLE', estimate: { status: 'UNREACHABLE' }, source: 'CACHE', evaluatedAtEpochSeconds: entry.evaluatedAtEpochSeconds };
}

function batchStatus(items: readonly DirectedLegBatchItem[]): DirectedLegBatchResult['status'] {
  if (items.some((item) => item.result.status === 'UNKNOWN' && item.result.code === 'STALE')) return 'STALE';
  if (items.some((item) => item.result.status === 'UNKNOWN' && item.result.code === 'CANCELLED')) return 'CANCELLED';
  return items.some((item) => item.result.status === 'UNKNOWN') ? 'PARTIAL' : 'COMPLETE';
}

function freshDiagnostics(): DirectedTravelDiagnostics {
  return {
    uniqueLegWork: 0,
    directedLegProviderRequests: 0,
    cacheHits: 0,
    zeroLegs: 0,
    geometryRequests: 0,
    activeProviderRequests: 0,
    maxConcurrentProviderRequests: 0,
    ordersEvaluated: 0,
    evaluationTimeMs: 0,
    providerTimeMs: 0,
    staleResponses: 0,
    statusCounts: { available: 0, unreachable: 0, unknown: 0, cancelled: 0, stale: 0 },
  };
}

function cloneDiagnostics(value: DirectedTravelDiagnostics): DirectedTravelDiagnostics {
  return { ...value, statusCounts: { ...value.statusCounts } };
}

function countInto(counters: DirectedTravelDiagnostics, result: DirectedLegResult): void {
  if (result.status === 'AVAILABLE') counters.statusCounts.available += 1;
  else if (result.status === 'UNREACHABLE') counters.statusCounts.unreachable += 1;
  else if (result.code === 'CANCELLED') counters.statusCounts.cancelled += 1;
  else if (result.code === 'STALE') counters.statusCounts.stale += 1;
  else counters.statusCounts.unknown += 1;
}
