import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import {
  createRiderDemoCaseCandidates,
  createRiderDemoFixtureAdapter,
  RIDER_DEMO_PICKUP_SERVICE_SECONDS,
  RIDER_DEMO_TIME_ZONE,
  RIDER_DEMO_TIME_ZONE_LABEL,
  riderDemoDriver,
  riderDemoPresentationCases,
  type RiderDemoCandidate,
  type RiderDemoCaseId,
} from '../matching/riderDemoFixtures';
import {
  DEFAULT_RIDER_DEMO_MAX_SNAP_METERS,
  evaluateRiderDemo,
  LatestRiderDemoEvaluation,
  riderDemoReasonExplanations,
  type EvaluatedRiderDemoCandidate,
  type RiderDemoMode,
} from '../matching/riderDemoEvaluation';
import {
  createRiderDemoPresentationState,
  riderDemoPresentationReducer,
} from '../matching/riderDemoPresentation';
import { RiderComparisonMap } from '../routing/components/RouteMap';
import { createOsrmRoutingAdapter } from '../routing/osrmAdapter';
import { colors, radii, spacing } from '../theme';

interface FindRidersDemoScreenProps { onBack: () => void }

function configuredSnapLimit(): number {
  const value = Number(process.env.EXPO_PUBLIC_RIDER_DEMO_MAX_SNAP_METERS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RIDER_DEMO_MAX_SNAP_METERS;
}

export function FindRidersDemoScreen({ onBack }: FindRidersDemoScreenProps) {
  const [state, dispatch] = useReducer(riderDemoPresentationReducer, undefined, () => createRiderDemoPresentationState());
  const [mode, setMode] = useState<RiderDemoMode>('FIXTURE');
  const [notice, setNotice] = useState('Choose a case and load demo riders.');
  const [fitKey, setFitKey] = useState(0);
  const [doesntFitExpanded, setDoesntFitExpanded] = useState(false);
  const [needsInfoExpanded, setNeedsInfoExpanded] = useState(false);
  const liveAdapter = useMemo(() => createOsrmRoutingAdapter(), []);
  const latestEvaluation = useRef(new LatestRiderDemoEvaluation());
  const token = useRef(0);
  const evaluationInFlight = useRef(false);
  const maxSnapMeters = configuredSnapLimit();
  const selectedCase = riderDemoPresentationCases.find((item) => item.id === state.caseId)!;

  useEffect(() => () => latestEvaluation.current.cancel(), []);

  const cancelPending = () => {
    token.current += 1;
    evaluationInFlight.current = false;
    latestEvaluation.current.cancel();
    return token.current;
  };

  const chooseCase = (caseId: RiderDemoCaseId) => {
    const nextToken = cancelPending();
    dispatch({ type: 'SELECT_CASE', caseId, token: nextToken });
    setNotice('Choose a case and load demo riders.');
    setDoesntFitExpanded(false);
    setNeedsInfoExpanded(false);
    setFitKey(0);
  };

  const loadDemoData = () => {
    const nextToken = cancelPending();
    dispatch({ type: 'LOAD', candidates: createRiderDemoCaseCandidates(state.caseId), token: nextToken });
    setNotice('6 demo riders loaded. Find matches to compare pickups.');
    setDoesntFitExpanded(false);
    setNeedsInfoExpanded(false);
    setFitKey((value) => value + 1);
  };

  const chooseMode = (nextMode: RiderDemoMode) => {
    if (nextMode === mode) return;
    const nextToken = cancelPending();
    setMode(nextMode);
    if (state.candidates) {
      dispatch({ type: 'LOAD', candidates: state.candidates, token: nextToken });
      setNotice('Routing mode changed. Find matches to evaluate the loaded riders again.');
    } else {
      dispatch({ type: 'CANCEL_EVALUATION', token: nextToken });
    }
    setDoesntFitExpanded(false);
    setNeedsInfoExpanded(false);
  };

  const findMatches = async () => {
    if (!state.candidates || state.evaluating || evaluationInFlight.current) return;
    evaluationInFlight.current = true;
    const evaluationToken = ++token.current;
    const caseAtStart = state.caseId;
    const candidatesAtStart = state.candidates;
    dispatch({ type: 'BEGIN_EVALUATION', token: evaluationToken });
    setNotice(mode === 'FIXTURE' ? 'Comparing riders with fixed demo travel estimates…' : 'Requesting current static routes from Live OSRM…');
    const adapter = mode === 'FIXTURE' ? createRiderDemoFixtureAdapter(candidatesAtStart) : liveAdapter;
    const response = await latestEvaluation.current.run((signal) => evaluateRiderDemo({ adapter, candidates: candidatesAtStart, maxSnapMeters, mode, signal }));
    if (response.status === 'STALE' || evaluationToken !== token.current) return;
    evaluationInFlight.current = false;
    dispatch({ type: 'COMPLETE_EVALUATION', caseId: caseAtStart, result: response.result, token: evaluationToken });
    setFitKey((value) => value + 1);
    setNotice(resultSummary(response.result.candidates));
  };

  const cancelEvaluation = () => {
    dispatch({ type: 'CANCEL_EVALUATION', token: cancelPending() });
    setNotice('Matching cancelled. Find matches when you are ready to retry.');
  };

  const markers = useMemo(() => state.candidates?.map((candidate) => ({
    id: candidate.id,
    coordinate: candidate.pickup,
    title: cleanName(candidate.name),
    subtitle: `${candidate.pickupLabel} · ${candidate.pickupAccuracy === 'SELECTED_POINT' ? 'confirmed demo pickup' : 'unconfirmed pickup area'}`,
    confirmed: candidate.pickupAccuracy === 'SELECTED_POINT',
  })) ?? [], [state.candidates]);
  const selected = state.result?.candidates.find((candidate) => candidate.candidate.id === state.selectedCandidateId);
  const feasible = state.result?.candidates.filter((candidate) => candidate.evaluation.status === 'FEASIBLE').sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)) ?? [];
  const infeasible = state.result?.candidates.filter((candidate) => candidate.evaluation.status === 'INFEASIBLE') ?? [];
  const unknown = state.result?.candidates.filter((candidate) => candidate.evaluation.status === 'UNKNOWN') ?? [];

  return (
    <Screen eyebrow="M3 PRESENTATION · SYNTHETIC PEOPLE" onBack={onBack} subtitle="See how road detours and schedules change independent rider recommendations." title="Carpool Matching Demo">
      <View style={styles.caseSection}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Presentation case</Text>
        <View style={styles.caseRow}>
          {riderDemoPresentationCases.map((item) => <CaseButton item={item} key={item.id} onPress={chooseCase} selected={item.id === state.caseId} />)}
        </View>
        <Text style={styles.caseDescription}>{selectedCase.description}</Text>
        {selectedCase.changedSchedule && <Text style={styles.changedSchedule}>{selectedCase.changedSchedule}</Text>}
        <AppButton label={state.candidates ? 'Reload demo data' : 'Load demo data'} onPress={loadDemoData} variant="secondary" />
      </View>

      <Card style={styles.tripSummary}>
        <View style={styles.summaryHeader}>
          <Ionicons color={colors.accent} name="car-outline" size={22} />
          <View style={styles.flex}>
            <Text style={styles.summaryTitle}>Jordan drives to Stony Brook</Text>
            <Text style={styles.summaryText}>Smith Haven Mall → Lot 40 · Oct 19 · leave 8:00–8:15 AM</Text>
          </View>
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.loadedMessage}>{notice}</Text>
      </Card>

      <View style={styles.mapSection}>
        <RiderComparisonMap baselineRoute={state.result?.baselineRoute ?? null} campus={riderDemoDriver.campus} campusTitle="Campus destination · Lot 40" driverStart={riderDemoDriver.start} driverTitle="Driver start · Smith Haven Mall" fitKey={fitKey} onSelectCandidate={(candidateId) => dispatch({ type: 'SELECT_CANDIDATE', candidateId })} riders={markers} selectedCandidateId={state.selectedCandidateId} selectedRoute={selected?.route ?? null} />
        <View style={styles.legend}><Legend color={colors.textMuted} label="Direct driver trip" /><Legend color={colors.accent} label="Trip through selected pickup" /></View>
        <Text style={mode === 'FIXTURE' ? styles.schematicWarning : styles.liveModeNote}>
          {mode === 'FIXTURE' ? 'Schematic — not a road route. Fixed travel estimates drive matching; map lines only illustrate stop order.' : 'Live OSRM road geometry and static estimates. Failed live requests never fall back to demo estimates.'}
        </Text>
        {state.result?.baselineFailure && <Text style={styles.visibleError}>Direct route: {state.result.baselineFailure.code} — {state.result.baselineFailure.message}</Text>}
        {selected && !selected.route && selected.routingIssue && <Text style={styles.visibleError}>{selected.routingIssue.message}</Text>}
      </View>

      <View style={styles.primaryAction}>
        <AppButton disabled={!state.candidates || state.evaluating} label="Find matches" onPress={findMatches} />
        {state.evaluating && <View style={styles.loadingRow}><ActivityIndicator color={colors.accent} /><Pressable accessibilityRole="button" onPress={cancelEvaluation} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel matching</Text></Pressable></View>}
      </View>

      {state.result && <View style={styles.results}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Matches</Text>
        <Text accessibilityLiveRegion="polite" style={styles.resultSummary}>{resultSummary(state.result.candidates)}</Text>
        <Text style={styles.independentNote}>Each rider is evaluated individually against Jordan’s solo trip—not together as a group.</Text>
        {feasible.map((candidate, index) => <CompactCandidateCard baselineDurationSeconds={state.result?.baselineRoute?.durationSeconds ?? null} candidate={candidate} comparison={feasible[index + 1] ?? feasible[index - 1] ?? null} key={candidate.candidate.id} onSelect={(candidateId) => dispatch({ type: 'SELECT_CANDIDATE', candidateId })} selected={candidate.candidate.id === state.selectedCandidateId} />)}
        <ResultGroup count={infeasible.length} expanded={doesntFitExpanded} label="Doesn't fit" onToggle={() => setDoesntFitExpanded((value) => !value)} tone="error">
          {infeasible.map((candidate) => <CompactCandidateCard baselineDurationSeconds={state.result?.baselineRoute?.durationSeconds ?? null} candidate={candidate} comparison={null} key={candidate.candidate.id} onSelect={(candidateId) => dispatch({ type: 'SELECT_CANDIDATE', candidateId })} selected={candidate.candidate.id === state.selectedCandidateId} />)}
        </ResultGroup>
        <ResultGroup count={unknown.length} expanded={needsInfoExpanded} label="Needs information" onToggle={() => setNeedsInfoExpanded((value) => !value)} tone="warning">
          {unknown.map((candidate) => <CompactCandidateCard baselineDurationSeconds={state.result?.baselineRoute?.durationSeconds ?? null} candidate={candidate} comparison={null} key={candidate.candidate.id} onSelect={(candidateId) => dispatch({ type: 'SELECT_CANDIDATE', candidateId })} selected={candidate.candidate.id === state.selectedCandidateId} />)}
        </ResultGroup>
      </View>}

      <Disclosure title="Trip details"><TripDetails candidates={state.candidates} /></Disclosure>
      <Disclosure title="Advanced settings">
        <Text style={styles.detailText}>Routing mode</Text>
        <View style={styles.modeRow}><ModeButton label="Demo data — fixed travel estimates" mode="FIXTURE" onPress={chooseMode} selected={mode === 'FIXTURE'} /><ModeButton label="Live OSRM" mode="LIVE_OSRM" onPress={chooseMode} selected={mode === 'LIVE_OSRM'} /></View>
        <Text style={styles.mutedText}>Confirmed live pickups must snap within {maxSnapMeters} m. Changing mode clears prior results but keeps loaded demo riders.</Text>
      </Disclosure>
      <Disclosure title="Technical details">
        <Text style={styles.detailText}>Ranking: added driver duration, fixture walking, departure-window width, then stable candidate ID. Only FEASIBLE riders are ranked.</Text>
        <Text style={styles.detailText}>Timing: start → pickup + {formatDuration(RIDER_DEMO_PICKUP_SERVICE_SECONDS)} boarding + pickup → campus. Access walking is not added again.</Text>
        <Text style={styles.detailText}>Provider: {state.result?.providerLabel ?? (mode === 'FIXTURE' ? 'Fixture road data' : 'OSRM')} · pickup snap limit {maxSnapMeters} m.</Text>
        {state.result?.candidates.map((candidate) => <Text key={candidate.candidate.id} style={styles.mutedText}>{cleanName(candidate.candidate.name)}: {candidate.evaluation.status === 'FEASIBLE' ? 'FEASIBLE' : candidate.evaluation.reasonCodes.join(', ')}{candidate.routingIssue ? ` · ${candidate.routingIssue.kind}` : ''}</Text>)}
      </Disclosure>
    </Screen>
  );
}

function CaseButton({ item, onPress, selected }: { item: (typeof riderDemoPresentationCases)[number]; onPress: (id: RiderDemoCaseId) => void; selected: boolean }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => onPress(item.id)} style={[styles.caseButton, selected && styles.caseButtonSelected]}><Text style={[styles.caseButtonText, selected && styles.caseButtonTextSelected]}>{item.title}</Text></Pressable>;
}

function CompactCandidateCard({ baselineDurationSeconds, candidate, comparison, onSelect, selected }: { baselineDurationSeconds: number | null; candidate: EvaluatedRiderDemoCandidate; comparison: EvaluatedRiderDemoCandidate | null; onSelect: (id: string) => void; selected: boolean }) {
  const name = cleanName(candidate.candidate.name);
  const isFeasible = candidate.evaluation.status === 'FEASIBLE';
  const title = isFeasible ? `#${candidate.rank} ${name}` : `${name} — ${candidate.evaluation.status === 'INFEASIBLE' ? "Doesn't fit" : 'Needs information'}`;
  const summary = candidateSummary(candidate);
  return <Pressable accessibilityLabel={`${title}. ${summary}. Select route on map.`} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onSelect(candidate.candidate.id)}><Card style={[styles.candidateCard, selected && styles.selectedCard]}>
    <View style={styles.candidateHeader}><Text style={styles.candidateTitle}>{title}</Text><StatusDot status={candidate.evaluation.status} /></View>
    <Text style={styles.candidateSummary}>{summary}</Text>
    {isFeasible && <Text style={styles.bestFit}>{bestFitExplanation(candidate, comparison)}</Text>}
    {candidate.routingIssue && <Text style={styles.visibleError}>{candidate.routingIssue.message}</Text>}
    <Disclosure compact title="Why this result?"><CandidateDetails baselineDurationSeconds={baselineDurationSeconds} candidate={candidate} /></Disclosure>
  </Card></Pressable>;
}

function CandidateDetails({ baselineDurationSeconds, candidate }: { baselineDurationSeconds: number | null; candidate: EvaluatedRiderDemoCandidate }) {
  const input = candidate.candidate.input;
  const evaluation = candidate.evaluation;
  const routeAddedSeconds = candidate.route && baselineDurationSeconds !== null
    ? candidate.route.durationSeconds + input.pickupServiceSeconds - baselineDurationSeconds
    : null;
  return <View style={styles.detailsBody}>
    <Detail label="Pickup window" value={formatWindow(input.rider.pickupWindow)} /><Detail label="Destination arrival" value={formatWindow(input.rider.destinationArrivalWindow)} /><Detail label="Fixture walking" value={`${formatDuration(input.rider.accessWalkSeconds)} access + ${formatDuration(input.rider.egressWalkSeconds)} egress`} />
    <Detail label="Driver detour caps" value={formatDetourCaps(input.driver.maxExtraDurationSeconds, input.driver.maxExtraDurationRatio)} />
    {candidate.route && <Detail label="Candidate road route" value={`${formatDistance(candidate.route.distanceMeters)} · ${formatDuration(candidate.route.durationSeconds)} driving`} />}
    {routeAddedSeconds !== null && <Detail label="Added driver time" value={`${formatDuration(routeAddedSeconds)} including boarding`} />}
    {evaluation.status === 'FEASIBLE' && <><Detail label="Feasible departure" value={formatWindow(evaluation.plan.feasibleDepartureWindow)} /><Detail label="Boarding complete" value={formatTime(evaluation.plan.boardingComplete)} /><Detail label="Rider destination" value={formatTime(evaluation.plan.riderDestinationArrival)} /><Detail label="Active detour limit" value={formatDuration(evaluation.metrics.activeDriverDetourLimitSeconds)} /></>}
    {evaluation.status !== 'FEASIBLE' && evaluation.reasonCodes.map((code) => <Text key={code} style={styles.detailText}>{riderDemoReasonExplanations[code]} [{code}]</Text>)}
  </View>;
}

function ResultGroup({ children, count, expanded, label, onToggle, tone }: { children: ReactNode; count: number; expanded: boolean; label: string; onToggle: () => void; tone: 'error' | 'warning' }) {
  return <View style={styles.resultGroup}><Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggle} style={styles.resultGroupHeader}><View style={[styles.groupDot, tone === 'error' ? styles.errorDot : styles.warningDot]} /><Text style={styles.resultGroupTitle}>{label} ({count})</Text><Ionicons color={colors.textMuted} name={expanded ? 'chevron-up' : 'chevron-down'} size={18} /></Pressable>{expanded && <View style={styles.groupBody}>{children}</View>}</View>;
}

function Disclosure({ children, compact = false, title }: { children: ReactNode; compact?: boolean; title: string }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={[styles.disclosure, compact && styles.compactDisclosure]}><Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.disclosureHeader}><Text style={styles.disclosureTitle}>{title}</Text><Ionicons color={colors.textMuted} name={expanded ? 'chevron-up' : 'chevron-down'} size={18} /></Pressable>{expanded && <View style={styles.disclosureBody}>{children}</View>}</View>;
}

function TripDetails({ candidates }: { candidates: RiderDemoCandidate[] | null }) {
  return <View style={styles.detailsBody}>
    <Detail label="Date and timezone" value={`October 19, 2026 · ${RIDER_DEMO_TIME_ZONE_LABEL}`} /><Detail label="Driver departure" value={formatWindow(riderDemoDriver.departureWindow)} /><Detail label="Driver arrival" value={formatWindow(riderDemoDriver.campusArrivalWindow)} /><Detail label="Preferred departure" value={formatTime(riderDemoDriver.preferredDeparture)} /><Detail label="Seats" value={String(riderDemoDriver.seatsRemaining)} /><Detail label="Detour limits" value={`${formatDuration(riderDemoDriver.maxExtraDurationSeconds)} and ${Math.round(riderDemoDriver.maxExtraDurationRatio * 100)}%; stricter limit wins`} />
    {!candidates && <Text style={styles.mutedText}>Load demo data to inspect rider schedules.</Text>}
    {candidates?.map((candidate) => <View key={candidate.id} style={styles.riderDetail}><Text style={styles.riderDetailName}>{cleanName(candidate.name)}</Text><Text style={styles.mutedText}>{candidate.pickupLabel} · {candidate.pickupAccuracy === 'SELECTED_POINT' ? 'confirmed synthetic pickup' : 'unconfirmed approximate pickup'}</Text><Text style={styles.mutedText}>Pickup {formatWindow(candidate.input.rider.pickupWindow)} · arrival {formatWindow(candidate.input.rider.destinationArrivalWindow)}</Text><Text style={styles.mutedText}>Fixture walking: {formatDuration(candidate.input.rider.accessWalkSeconds)} + {formatDuration(candidate.input.rider.egressWalkSeconds)}</Text></View>)}
  </View>;
}

function ModeButton({ label, mode, onPress, selected }: { label: string; mode: RiderDemoMode; onPress: (mode: RiderDemoMode) => void; selected: boolean }) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => onPress(mode)} style={[styles.modeButton, selected && styles.modeButtonSelected]}><Text style={[styles.modeButtonText, selected && styles.modeButtonTextSelected]}>{label}</Text></Pressable> }
function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View> }
function Legend({ color, label }: { color: string; label: string }) { return <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: color }]} /><Text style={styles.mutedText}>{label}</Text></View> }
function StatusDot({ status }: { status: 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN' }) { return <View accessibilityLabel={status} style={[styles.statusDot, status === 'FEASIBLE' ? styles.successDot : status === 'INFEASIBLE' ? styles.errorDot : styles.warningDot]} /> }

function resultSummary(candidates: readonly EvaluatedRiderDemoCandidate[]): string {
  const count = (status: 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN') => candidates.filter((candidate) => candidate.evaluation.status === status).length;
  return `${count('FEASIBLE')} matches · ${count('INFEASIBLE')} don't fit · ${count('UNKNOWN')} need more information.`;
}

function candidateSummary(candidate: EvaluatedRiderDemoCandidate): string {
  if (candidate.evaluation.status === 'FEASIBLE') return `Adds ${formatDuration(candidate.evaluation.metrics.driverExtraDurationSeconds)} · Pickup ${formatTime(candidate.evaluation.plan.pickup)} · Campus ${formatTime(candidate.evaluation.plan.vehicleCampusArrival)}`;
  switch (candidate.evaluation.reasonCodes[0]) {
    case 'NO_FEASIBLE_DEPARTURE': return "Pickup window cannot fit the driver's departure window.";
    case 'DRIVER_DETOUR_LIMIT': return "Pickup adds more driving than the driver's detour limit.";
    case 'LOCATION_UNCONFIRMED': return 'Confirm a pickup point before checking this rider.';
    case 'MISSING_TRAVEL_ESTIMATE': return 'A road estimate is needed before checking this rider.';
    case 'NO_ROAD_ROUTE': return 'The routing provider found no road route for this pickup.';
    default: return riderDemoReasonExplanations[candidate.evaluation.reasonCodes[0]];
  }
}

function bestFitExplanation(candidate: EvaluatedRiderDemoCandidate, comparison: EvaluatedRiderDemoCandidate | null): string {
  if (candidate.evaluation.status !== 'FEASIBLE') return '';
  if (candidate.rank === 1 && comparison?.evaluation.status === 'FEASIBLE') {
    const difference = comparison.evaluation.metrics.driverExtraDurationSeconds - candidate.evaluation.metrics.driverExtraDurationSeconds;
    if (difference > 0) return `Best fit: ${formatDuration(difference)} less added driving than ${cleanName(comparison.candidate.name)}.`;
  }
  return candidate.rankingExplanation ?? 'Fits the trip constraints.';
}

function cleanName(name: string): string { return name.replace(/\s*\(demo rider\)$/, '') }
function formatTime(epochSeconds: number): string { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: RIDER_DEMO_TIME_ZONE }).format(new Date(epochSeconds * 1000)) }
function formatWindow(window: { earliest: number; latest: number }): string { return `${formatTime(window.earliest)}–${formatTime(window.latest)}` }
function formatDuration(seconds: number): string { const minutes = seconds / 60; return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min` }
function formatDistance(meters: number): string { return `${(meters / 1609.344).toFixed(1)} mi` }
function formatDetourCaps(seconds: number, ratio?: number): string { return ratio === undefined ? formatDuration(seconds) : `${formatDuration(seconds)} or ${Math.round(ratio * 100)}% of solo; stricter wins` }

const styles = StyleSheet.create({
  flex: { flex: 1 }, caseSection: { gap: spacing.sm }, sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800' }, caseRow: { flexDirection: 'row', gap: spacing.sm }, caseButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 52, padding: spacing.sm }, caseButtonSelected: { backgroundColor: colors.text, borderColor: colors.text }, caseButtonText: { color: colors.text, fontSize: 12, fontWeight: '800', textAlign: 'center' }, caseButtonTextSelected: { color: colors.surface }, caseDescription: { color: colors.textMuted, fontSize: 13, lineHeight: 18 }, changedSchedule: { backgroundColor: colors.warningSoft, borderRadius: radii.md, color: colors.warning, fontSize: 12, fontWeight: '700', lineHeight: 18, padding: spacing.sm },
  tripSummary: { gap: spacing.md }, summaryHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.md }, summaryTitle: { color: colors.text, fontSize: 16, fontWeight: '800' }, summaryText: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 }, loadedMessage: { color: colors.accent, fontSize: 14, fontWeight: '800', lineHeight: 20 },
  mapSection: { gap: spacing.sm }, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, legendItem: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs }, legendSwatch: { borderRadius: radii.pill, height: 7, width: 24 }, schematicWarning: { backgroundColor: colors.warningSoft, borderRadius: radii.md, color: colors.warning, fontSize: 12, fontWeight: '700', lineHeight: 18, padding: spacing.sm }, liveModeNote: { backgroundColor: colors.successSoft, borderRadius: radii.md, color: colors.success, fontSize: 12, lineHeight: 18, padding: spacing.sm }, visibleError: { backgroundColor: colors.errorSoft, borderRadius: radii.md, color: colors.error, fontSize: 12, lineHeight: 18, padding: spacing.sm },
  primaryAction: { gap: spacing.sm }, loadingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'center' }, cancelButton: { justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md }, cancelText: { color: colors.accent, fontSize: 14, fontWeight: '800' }, results: { gap: spacing.md }, resultSummary: { color: colors.text, fontSize: 16, fontWeight: '800' }, independentNote: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  candidateCard: { gap: spacing.sm, padding: spacing.md }, selectedCard: { borderColor: colors.accent, borderWidth: 2 }, candidateHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, candidateTitle: { color: colors.text, flex: 1, fontSize: 17, fontWeight: '900' }, candidateSummary: { color: colors.text, fontSize: 14, fontWeight: '700', lineHeight: 20 }, bestFit: { color: colors.success, fontSize: 12, fontWeight: '700', lineHeight: 18 }, statusDot: { borderRadius: radii.pill, height: 12, width: 12 }, successDot: { backgroundColor: colors.success }, errorDot: { backgroundColor: colors.error }, warningDot: { backgroundColor: colors.warning },
  resultGroup: { borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' }, resultGroupHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md }, groupDot: { borderRadius: radii.pill, height: 10, width: 10 }, resultGroupTitle: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '800' }, groupBody: { backgroundColor: colors.background, gap: spacing.sm, padding: spacing.sm },
  disclosure: { borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' }, compactDisclosure: { borderWidth: 0 }, disclosureHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: spacing.md }, disclosureTitle: { color: colors.text, fontSize: 13, fontWeight: '800' }, disclosureBody: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.sm, padding: spacing.md }, detailsBody: { gap: spacing.sm }, detailRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md }, detailLabel: { color: colors.textMuted, flex: 0.42, fontSize: 12, fontWeight: '700' }, detailValue: { color: colors.text, flex: 0.58, fontSize: 12, lineHeight: 17 }, detailText: { color: colors.text, fontSize: 12, lineHeight: 18 }, mutedText: { color: colors.textMuted, fontSize: 11, lineHeight: 16 }, riderDetail: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: 2, paddingTop: spacing.sm }, riderDetailName: { color: colors.text, fontSize: 13, fontWeight: '800' }, modeRow: { gap: spacing.sm }, modeButton: { borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.md }, modeButtonSelected: { backgroundColor: colors.text, borderColor: colors.text }, modeButtonText: { color: colors.text, fontSize: 12, fontWeight: '800', textAlign: 'center' }, modeButtonTextSelected: { color: colors.surface },
});
