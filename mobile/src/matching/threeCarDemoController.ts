import { evaluateGroupRoute } from './groupRouteEvaluator';
import {
  DEMO3X7_LOCAL_DATE,
  demo3x7Coordinates,
  createDemo3x7Fixture,
  type Demo3x7Fixture,
  type Demo3x7NodeId,
} from './demo3x7Fixtures';
import {
  GroupRecommendationCoordinator,
  type GroupRecommendation,
  type GroupRecommendationRun,
} from './groupRecommendations';
import {
  GroupAcceptanceService,
  MultiCarScenarioStore,
  cancelGroupMembership,
  createPendingGroupProposal,
  type GroupAcceptanceResult,
  type GroupCancellationResult,
} from '../rides/groupAcceptance';
import { getDriverCapacity, type DriverOccurrenceV1, type GroupRoutePlanV1, type MultiCarScenarioState } from '../rides/groupRideContracts';
import {
  FixtureDirectedTravelSource,
  SharedLiveDirectedTravelSource,
  type DirectedTravelDiagnostics,
  type FixtureDirectedTravelSourceOptions,
  type TravelCacheOwnership,
} from '../routing/directedTravelSource';
import { createOsrmRoutingAdapter } from '../routing/osrmAdapter';
import type { RouteCoordinate } from '../routing/types';
import { createDemo3x7LiveScenario } from './demo3x7LiveInputs';

export type ThreeCarDemoMode = 'FIXTURE' | 'LIVE';
export type ThreeCarDemoPhase = 'EMPTY' | 'READY' | 'MATCHING' | 'CHECKING' | 'CANCELLING';

export interface ThreeCarDemoViewState {
  mode: ThreeCarDemoMode;
  localDate: string;
  phase: ThreeCarDemoPhase;
  notice: string;
  scenario: MultiCarScenarioState | null;
  selectedDriverOccurrenceId: string | null;
  selectedRiderIntentId: string | null;
  recommendations: GroupRecommendationRun | null;
  proposedGeometry: RouteCoordinate[] | null;
  acceptedGeometryByDriver: Readonly<Record<string, RouteCoordinate[]>>;
  soloBaselineGeometry: RouteCoordinate[] | null;
  lastAcceptance: GroupAcceptanceResult | null;
  lastCancellation: GroupCancellationResult | null;
  diagnostics: DirectedTravelDiagnostics | null;
  fitKey: number;
}

type DemoSource = FixtureDirectedTravelSource | SharedLiveDirectedTravelSource;

const FIXTURE_PROVIDER = 'demo3x7-directed-v1';
const DRIVER_COLORS = ['#9a251d', '#714fbf', '#26734d'] as const;

export class ThreeCarDemoController {
  private readonly listeners = new Set<() => void>();
  private readonly recommendationCoordinator = new GroupRecommendationCoordinator();
  private readonly acceptanceService = new GroupAcceptanceService();
  private store: MultiCarScenarioStore | null = null;
  private fixture: Demo3x7Fixture | null = null;
  private source: DemoSource | null = null;
  private operation: AbortController | null = null;
  private operationRevision = 0;
  private proposalSequence = 0;
  private state: ThreeCarDemoViewState = {
    mode: 'LIVE', localDate: DEMO3X7_LOCAL_DATE, phase: 'EMPTY',
    notice: 'Choose “Load demo data” to create three offers and seven available rider intents.',
    scenario: null, selectedDriverOccurrenceId: null, selectedRiderIntentId: null,
    recommendations: null, proposedGeometry: null, acceptedGeometryByDriver: {},
    soloBaselineGeometry: null, lastAcceptance: null, lastCancellation: null,
    diagnostics: null, fitKey: 0,
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ThreeCarDemoViewState => this.state;

  loadData(): boolean {
    if (this.store) {
      this.patch({ notice: 'Demo data is already loaded. Use Reset demo to erase accepted test memberships.' });
      return false;
    }
    if (this.state.mode === 'FIXTURE') {
      const raw = createDemo3x7Fixture();
      this.fixture = this.state.localDate === DEMO3X7_LOCAL_DATE ? raw : moveFixtureToDate(raw, this.state.localDate);
    } else {
      this.fixture = null;
    }
    const scenario = this.fixture?.state ?? createDemo3x7LiveScenario({ localDate: this.state.localDate });
    this.store = new MultiCarScenarioStore({
      scenario, pendingProposals: [], skippedDriverOccurrenceIds: [], cancelledRequestIds: [],
    });
    this.source = this.createSource(scenario, this.fixture);
    const jordan = scenario.driverOccurrences[0];
    this.patch({
      phase: 'READY', scenario: this.store.snapshot().scenario,
      selectedDriverOccurrenceId: jordan.id, selectedRiderIntentId: null,
      recommendations: null, notice: 'Loaded 3 driver offers and 7 available rider intents. Accepted requests: 0.',
      proposedGeometry: null, acceptedGeometryByDriver: {},
      soloBaselineGeometry: this.state.mode === 'FIXTURE' ? schematicBaseline(jordan) : null, fitKey: this.state.fitKey + 1,
      diagnostics: this.source.diagnostics(),
    });
    return true;
  }

  reset(options: { mode?: ThreeCarDemoMode; localDate?: string } = {}): void {
    this.invalidateWork();
    this.store = null;
    this.fixture = null;
    this.source = null;
    this.patch({
      mode: options.mode ?? this.state.mode,
      localDate: options.localDate ?? this.state.localDate,
      phase: 'EMPTY', scenario: null, selectedDriverOccurrenceId: null, selectedRiderIntentId: null,
      recommendations: null, proposedGeometry: null, acceptedGeometryByDriver: {}, soloBaselineGeometry: null,
      lastAcceptance: null, lastCancellation: null, diagnostics: null,
      notice: 'The isolated three-car demo was reset. Friday and signed-in account data were not changed.',
      fitKey: this.state.fitKey + 1,
    });
  }

  selectDriver(driverOccurrenceId: string): void {
    if (!this.state.scenario?.driverOccurrences.some((item) => item.id === driverOccurrenceId)) return;
    const driver = this.state.scenario.driverOccurrences.find((item) => item.id === driverOccurrenceId)!;
    this.patch({ selectedDriverOccurrenceId: driverOccurrenceId, selectedRiderIntentId: null,
      proposedGeometry: null, soloBaselineGeometry: this.state.mode === 'FIXTURE' ? schematicBaseline(driver) : null });
    void this.loadLiveBaseline();
  }

  selectRider(riderIntentId: string): void {
    if (!this.state.scenario?.riderIntents.some((item) => item.id === riderIntentId)) return;
    this.patch({ selectedRiderIntentId: riderIntentId, proposedGeometry: null });
    void this.loadSelectedGeometry();
  }

  async findMatches(): Promise<GroupRecommendationRun | null> {
    if (!this.store || !this.source || this.state.phase !== 'READY') return null;
    const revision = this.beginWork();
    const snapshot = this.store.snapshot();
    const ownership = ownershipFor(snapshot.scenario.generationId, this.state.mode);
    this.patch({ phase: 'MATCHING', recommendations: null, proposedGeometry: null,
      notice: this.state.mode === 'FIXTURE' ? 'Calculating complete-group schedules from the directed fixture…' : 'Requesting current OSRM estimates…' });
    const result = await this.recommendationCoordinator.recommend({ state: snapshot.scenario, source: this.source, routingOwnership: ownership, signal: this.operation?.signal });
    if (revision !== this.operationRevision) return result;
    this.patch({
      phase: 'READY', recommendations: result,
      notice: result.status === 'COMPLETE'
        ? `${result.routingBatchStatus === 'COMPLETE' ? '' : 'Routing provider results were incomplete; affected additions remain Unknown. '}${result.summary.feasible} feasible, ${result.summary.infeasible} infeasible, ${result.summary.unknown} unknown, ${result.summary.excluded} excluded.`
        : result.message,
      diagnostics: this.source.diagnostics(), fitKey: this.state.fitKey + 1,
    });
    await this.loadLiveBaseline();
    return result;
  }

  async acceptSelected(): Promise<GroupAcceptanceResult | null> {
    const recommendation = this.selectedRecommendation();
    if (!recommendation || recommendation.status !== 'FEASIBLE' || !this.store || !this.source || this.state.phase !== 'READY') return null;
    const revision = this.beginWork();
    const snapshot = this.store.snapshot();
    const driver = snapshot.scenario.driverOccurrences.find((item) => item.id === recommendation.driverOccurrenceId)!;
    const intent = snapshot.scenario.riderIntents.find((item) => item.id === recommendation.riderIntentId)!;
    const createdAt = Math.floor(Date.now() / 1000);
    this.proposalSequence += 1;
    const riderKey = intent.riderParticipantId.split('-').at(-1)!;
    const driverKey = driver.driverParticipantId.split('-').at(-1)!;
    const requestId = `demo3x7-request-${driverKey}-${riderKey}-${driver.occurrence.localDate}`;
    const proposalId = `${requestId}-proposal-${createdAt}-${this.proposalSequence}`;
    const pending = createPendingGroupProposal({ driver, intent, requestId, proposalId,
      proposalRevision: `${proposalId}-v1`, createdAtEpochSeconds: createdAt, expiresAtEpochSeconds: createdAt + 30 * 60 });
    const existing = snapshot.scenario.pendingRequests.find((item) => item.id === requestId);
    if (!existing && !this.store.addPendingRequest(pending.request, pending.proposal)) return null;
    this.syncScenario();
    this.patch({ phase: 'CHECKING', lastAcceptance: null, notice: 'Checking the complete proposed group before simulated acceptance…' });
    const result = await this.acceptanceService.accept({ store: this.store, requestId, source: this.source,
      routingOwnership: ownershipFor(snapshot.scenario.generationId, this.state.mode), nowEpochSeconds: () => Math.floor(Date.now() / 1000), signal: this.operation?.signal });
    if (revision !== this.operationRevision) return result;
    if (result.ok && result.plan) {
      const geometry = result.route?.geometry ?? schematicPlan(result.plan, driver);
      this.patch({ acceptedGeometryByDriver: { ...this.state.acceptedGeometryByDriver, [driver.id]: geometry } });
    }
    this.syncScenario();
    this.patch({ phase: 'READY', lastAcceptance: result, notice: result.message, proposedGeometry: null,
      diagnostics: this.source.diagnostics(), fitKey: this.state.fitKey + 1 });
    if (result.ok) await this.findMatches();
    return result;
  }

  async cancelMembership(requestId: string): Promise<GroupCancellationResult | null> {
    if (!this.store || !this.source || this.state.phase !== 'READY') return null;
    const snapshot = this.store.snapshot();
    const membership = snapshot.scenario.acceptedMemberships.find((item) => item.requestId === requestId);
    if (!membership) return null;
    const revision = this.beginWork();
    this.patch({ phase: 'CANCELLING', lastCancellation: null, notice: 'Rechecking the remaining promises before removal…' });
    const result = await cancelGroupMembership({ store: this.store, requestId, source: this.source,
      routingOwnership: ownershipFor(snapshot.scenario.generationId, this.state.mode), signal: this.operation?.signal });
    if (revision !== this.operationRevision) return result;
    if (result.ok && result.plan) {
      const driver = snapshot.scenario.driverOccurrences.find((item) => item.id === membership.driverOccurrenceId)!;
      const next = { ...this.state.acceptedGeometryByDriver };
      if (result.plan.memberRequestIds.length === 0) delete next[driver.id];
      else next[driver.id] = result.route?.geometry ?? schematicPlan(result.plan, driver);
      this.patch({ acceptedGeometryByDriver: next });
    }
    this.syncScenario();
    this.patch({ phase: 'READY', lastCancellation: result, notice: result.message,
      diagnostics: this.source.diagnostics(), fitKey: this.state.fitKey + 1 });
    if (result.ok) await this.findMatches();
    return result;
  }

  selectedRecommendation(): GroupRecommendation | null {
    if (this.state.recommendations?.status !== 'COMPLETE') return null;
    return this.state.recommendations.recommendations.find((item) => item.driverOccurrenceId === this.state.selectedDriverOccurrenceId
      && item.riderIntentId === this.state.selectedRiderIntentId) ?? null;
  }

  capacity(driverOccurrenceId: string) {
    return this.state.scenario ? getDriverCapacity(this.state.scenario, driverOccurrenceId) : null;
  }

  dispose(): void { this.invalidateWork(); this.listeners.clear(); }

  private async loadSelectedGeometry(): Promise<void> {
    const selected = this.selectedRecommendation();
    if (!selected || selected.status !== 'FEASIBLE' || !this.source || !this.state.scenario) return;
    const driver = this.state.scenario.driverOccurrences.find((item) => item.id === selected.driverOccurrenceId)!;
    if (this.state.mode === 'FIXTURE') {
      this.patch({ proposedGeometry: schematicPlan(selected.plan, driver) });
      return;
    }
    if (!(this.source instanceof SharedLiveDirectedTravelSource)) return;
    const revision = this.operationRevision;
    const result = await this.source.routeSelectedGeometry({ driver, plan: selected.plan,
      planningTravel: selected.planningTravel, ownership: ownershipFor(this.state.scenario.generationId, 'LIVE') });
    if (revision !== this.operationRevision || this.state.selectedRiderIntentId !== selected.riderIntentId) return;
    if (result.status === 'VALIDATED' || result.status === 'REVALIDATED') this.patch({ proposedGeometry: result.route.geometry });
    else this.patch({ notice: result.status === 'STALE_PLAN' ? 'Current road geometry no longer produces a feasible selected plan.' : result.message });
    this.patch({ diagnostics: this.source.diagnostics() });
  }

  private async loadLiveBaseline(): Promise<void> {
    if (this.state.mode !== 'LIVE' || !(this.source instanceof SharedLiveDirectedTravelSource)
      || this.state.recommendations?.status !== 'COMPLETE' || !this.state.scenario || !this.state.selectedDriverOccurrenceId) return;
    const driver = this.state.scenario.driverOccurrences.find((item) => item.id === this.state.selectedDriverOccurrenceId)!;
    const example = this.state.recommendations.recommendations.find((item): item is Extract<GroupRecommendation, { status: 'FEASIBLE' }> => item.driverOccurrenceId === driver.id && item.status === 'FEASIBLE');
    if (!example) return;
    const empty = evaluateGroupRoute({ driver, acceptedMembers: [], travel: example.planningTravel });
    if (empty.status !== 'FEASIBLE') return;
    const revision = this.operationRevision;
    const geometry = await this.source.routeSelectedGeometry({ driver, plan: empty.plan,
      planningTravel: example.planningTravel, ownership: ownershipFor(this.state.scenario.generationId, 'LIVE') });
    if (revision !== this.operationRevision || this.state.selectedDriverOccurrenceId !== driver.id) return;
    if (geometry.status === 'VALIDATED' || geometry.status === 'REVALIDATED') this.patch({ soloBaselineGeometry: geometry.route.geometry });
    this.patch({ diagnostics: this.source.diagnostics() });
  }

  private createSource(scenario: MultiCarScenarioState, fixture: Demo3x7Fixture | null): DemoSource {
    if (this.state.mode === 'LIVE') return new SharedLiveDirectedTravelSource({ adapter: createOsrmRoutingAdapter(), rootGeneration: scenario.generationId });
    if (!fixture) throw new Error('Deterministic mode requires the fixture data source.');
    const node = (coordinate: RouteCoordinate): Demo3x7NodeId | undefined => (Object.keys(demo3x7Coordinates) as Demo3x7NodeId[])
      .find((key) => demo3x7Coordinates[key].latitude === coordinate.latitude && demo3x7Coordinates[key].longitude === coordinate.longitude);
    const options: FixtureDirectedTravelSourceOptions = {
      rootGeneration: fixture.state.generationId, providerId: FIXTURE_PROVIDER,
      evaluatedAtEpochSeconds: Math.floor(Date.now() / 1000),
      resolve: (from, to) => { const fromNode = node(from); const toNode = node(to); return fromNode && toNode ? fixture.travelMatrix[fromNode][toNode] : undefined; },
    };
    return new FixtureDirectedTravelSource(options);
  }

  private beginWork(): number {
    this.operation?.abort();
    this.operation = new AbortController();
    this.operationRevision += 1;
    return this.operationRevision;
  }

  private invalidateWork(): void {
    this.operationRevision += 1;
    this.operation?.abort();
    this.operation = null;
    this.recommendationCoordinator.invalidate();
    if (this.source instanceof SharedLiveDirectedTravelSource) this.source.beginRootGeneration(`inactive-${this.operationRevision}`);
  }

  private syncScenario(): void { if (this.store) this.patch({ scenario: this.store.snapshot().scenario }); }

  private patch(value: Partial<ThreeCarDemoViewState>): void {
    this.state = { ...this.state, ...value };
    for (const listener of this.listeners) listener();
  }
}

export function threeCarDriverColor(index: number): string { return DRIVER_COLORS[index % DRIVER_COLORS.length]; }

export function schematicPlan(plan: GroupRoutePlanV1, driver: DriverOccurrenceV1): RouteCoordinate[] {
  const promiseByRequest = new Map(plan.riderPromises.map((item) => [item.requestId, item]));
  return [driver.start.coordinate, ...plan.selectedRequestOrder.map((id) => promiseByRequest.get(id)!.pickup.coordinate), driver.campusDropoff.coordinate];
}

export function acceptedPlanPresentationGeometry(options: {
  mode: ThreeCarDemoMode;
  roadGeometry?: readonly RouteCoordinate[];
  plan: GroupRoutePlanV1;
  driver: DriverOccurrenceV1;
}): RouteCoordinate[] | null {
  if (options.roadGeometry && options.roadGeometry.length > 1) return options.roadGeometry.map((coordinate) => ({ ...coordinate }));
  return options.mode === 'FIXTURE' ? schematicPlan(options.plan, options.driver) : null;
}

function schematicBaseline(driver: DriverOccurrenceV1): RouteCoordinate[] { return [driver.start.coordinate, driver.campusDropoff.coordinate]; }

function ownershipFor(rootGeneration: string, mode: ThreeCarDemoMode): TravelCacheOwnership {
  return { mode, providerId: mode === 'FIXTURE' ? FIXTURE_PROVIDER : 'osrm', profile: 'driving',
    optionsKey: 'annotations=duration,distance;steps=true;geometries=geojson', rootGeneration, estimateVersion: 'demo3x7-v1' };
}

function moveFixtureToDate(fixture: Demo3x7Fixture, localDate: string): Demo3x7Fixture {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw new Error('The demo date must be YYYY-MM-DD.');
  const offsetSeconds = (Date.parse(`${localDate}T00:00:00Z`) - Date.parse(`${DEMO3X7_LOCAL_DATE}T00:00:00Z`)) / 1000;
  const replaceDate = (value: string) => value.replaceAll(DEMO3X7_LOCAL_DATE, localDate);
  const generationId = `${fixture.state.generationId}:${localDate}`;
  const driverOccurrences = fixture.state.driverOccurrences.map((driver) => ({ ...driver,
    id: replaceDate(driver.id), offerId: replaceDate(driver.offerId), generationId,
    occurrence: { ...driver.occurrence, localDate },
    departureWindow: shiftWindow(driver.departureWindow, offsetSeconds), preferredDeparture: driver.preferredDeparture + offsetSeconds,
    campusArrivalWindow: shiftWindow(driver.campusArrivalWindow, offsetSeconds),
  }));
  const riderIntents = fixture.state.riderIntents.map((intent) => ({ ...intent,
    id: replaceDate(intent.id), generationId, occurrence: { ...intent.occurrence, localDate },
    pickupWindow: shiftWindow(intent.pickupWindow, offsetSeconds), destinationArrivalWindow: shiftWindow(intent.destinationArrivalWindow, offsetSeconds),
  }));
  return { ...fixture, state: { ...fixture.state, generationId,
    offers: fixture.state.offers.map((offer) => ({ ...offer, id: replaceDate(offer.id) })), driverOccurrences, riderIntents },
    nodeByDriverOccurrenceId: Object.fromEntries(driverOccurrences.map((item, index) => [item.id, fixture.nodeByDriverOccurrenceId[fixture.state.driverOccurrences[index].id]])),
    nodeByRiderIntentId: Object.fromEntries(riderIntents.flatMap((item, index) => { const node = fixture.nodeByRiderIntentId[fixture.state.riderIntents[index].id]; return node ? [[item.id, node]] : []; })),
  };
}

function shiftWindow(window: { earliest: number; latest: number }, seconds: number) { return { earliest: window.earliest + seconds, latest: window.latest + seconds }; }
