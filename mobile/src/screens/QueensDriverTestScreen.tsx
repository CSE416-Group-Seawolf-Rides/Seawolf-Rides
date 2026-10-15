import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import {
  createQueensDriverTestRiders,
  defaultQueensDriverTestConfig,
  QUEENS_DRIVER_TEST_TIME_ZONE,
  queensDriverTestCampus,
  queensDriverTestStart,
  validateQueensDriverTestConfig,
  type QueensDriverTestConfig,
} from '../matching/queensDriverTestFixtures';
import {
  createQueensDriverTestPresentationState,
  queensDriverTestPresentationReducer,
} from '../matching/queensDriverTestPresentation';
import {
  DEFAULT_RIDER_DEMO_MAX_SNAP_METERS,
  evaluateRiderDemo,
  LatestRiderDemoEvaluation,
  riderDemoReasonExplanations,
  type EvaluatedRiderDemoCandidate,
} from '../matching/riderDemoEvaluation';
import { parseClockMinutes } from '../matching/driverRecommendations';
import { RiderComparisonMap } from '../routing/components/RouteMap';
import { createOsrmRoutingAdapter } from '../routing/osrmAdapter';
import { colors, radii, spacing } from '../theme';

interface QueensDriverTestScreenProps { onBack: () => void }

interface DriverForm {
  localDate: string;
  departureEarliest: string;
  departureLatest: string;
  preferredDeparture: string;
  arrivalEarliest: string;
  arrivalLatest: string;
  seats: string;
  maxExtraMinutes: string;
  maxExtraPercent: string;
}

const initialForm: DriverForm = {
  localDate: defaultQueensDriverTestConfig.localDate,
  departureEarliest: '06:30', departureLatest: '07:15', preferredDeparture: '06:45',
  arrivalEarliest: '08:00', arrivalLatest: '09:30', seats: '3',
  maxExtraMinutes: '25', maxExtraPercent: '30',
};

function configuredSnapLimit(): number {
  const value = Number(process.env.EXPO_PUBLIC_RIDER_DEMO_MAX_SNAP_METERS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RIDER_DEMO_MAX_SNAP_METERS;
}

function parseForm(form: DriverForm): QueensDriverTestConfig | null {
  const times = [form.departureEarliest, form.departureLatest, form.preferredDeparture, form.arrivalEarliest, form.arrivalLatest].map(parseClockMinutes);
  const integers = [form.seats, form.maxExtraMinutes, form.maxExtraPercent].map((value) => /^\d+$/.test(value.trim()) ? Number(value) : null);
  if (times.some((value) => value === null) || integers.some((value) => value === null)) return null;
  return {
    localDate: form.localDate.trim(),
    departureEarliestMinutes: times[0]!, departureLatestMinutes: times[1]!, preferredDepartureMinutes: times[2]!,
    arrivalEarliestMinutes: times[3]!, arrivalLatestMinutes: times[4]!, seatsRemaining: integers[0]!,
    maxExtraDurationMinutes: integers[1]!, maxExtraDurationPercent: integers[2]!,
  };
}

export function QueensDriverTestScreen({ onBack }: QueensDriverTestScreenProps) {
  const [form, setForm] = useState<DriverForm>(initialForm);
  const [state, dispatch] = useReducer(queensDriverTestPresentationReducer, undefined, createQueensDriverTestPresentationState);
  const [notice, setNotice] = useState('Review the synthetic driver inputs, then load test riders.');
  const [error, setError] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [otherExpanded, setOtherExpanded] = useState(false);
  const latest = useRef(new LatestRiderDemoEvaluation());
  const token = useRef(0);
  const inFlight = useRef(false);
  const adapter = useMemo(() => createOsrmRoutingAdapter(), []);
  const maxSnapMeters = configuredSnapLimit();

  useEffect(() => () => latest.current.cancel(), []);

  const cancelPending = () => {
    token.current += 1;
    inFlight.current = false;
    latest.current.cancel();
    return token.current;
  };

  const invalidate = (message: string) => {
    dispatch({ type: 'INVALIDATE', token: cancelPending() });
    setError(null);
    setNotice(message);
    setOtherExpanded(false);
    setFitKey(0);
  };

  const changeField = (field: keyof DriverForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    invalidate('Driver inputs changed. Load test riders again before routing.');
  };

  const loadRiders = () => {
    const config = parseForm(form);
    if (!config) { setError('Use HH:MM times and whole numbers for seats and detour limits.'); return; }
    const issues = validateQueensDriverTestConfig(config);
    if (issues.length > 0) { setError(issues.join(' ')); return; }
    const riders = createQueensDriverTestRiders(config);
    dispatch({ type: 'LOAD', riders, token: cancelPending() });
    setError(null);
    setNotice(`${riders.length} synthetic riders loaded. Find riders to request live road estimates.`);
    setOtherExpanded(false);
    setFitKey((value) => value + 1);
  };

  const findRiders = async () => {
    if (!state.riders || state.evaluating || inFlight.current) return;
    inFlight.current = true;
    const evaluationToken = ++token.current;
    dispatch({ type: 'BEGIN', token: evaluationToken });
    setError(null);
    setNotice('Requesting live directed routes from OSRM…');
    try {
      const response = await latest.current.run((signal) => evaluateRiderDemo({
        adapter, candidates: state.riders!, campus: queensDriverTestCampus.coordinate,
        driverStart: queensDriverTestStart, maxSnapMeters, mode: 'LIVE_OSRM', signal,
      }));
      if (response.status === 'STALE' || evaluationToken !== token.current) return;
      inFlight.current = false;
      dispatch({ type: 'COMPLETE', result: response.result, token: evaluationToken });
      setNotice(resultSummary(response.result.candidates));
      setFitKey((value) => value + 1);
    } catch (caught) {
      if (evaluationToken !== token.current) return;
      inFlight.current = false;
      dispatch({ type: 'CANCEL', token: evaluationToken });
      setError(caught instanceof Error ? caught.message : 'Live matching could not be completed.');
      setNotice('Live matching failed. Retry when the routing provider is available.');
    }
  };

  const cancel = () => {
    dispatch({ type: 'CANCEL', token: cancelPending() });
    setNotice('Matching cancelled. The loaded synthetic riders are still available.');
  };

  const markers = state.riders?.map((rider) => ({
    id: rider.id, coordinate: rider.pickup, title: cleanName(rider.name),
    subtitle: `${rider.pickupLabel} · ${rider.pickupAccuracy === 'SELECTED_POINT' ? 'confirmed public pickup' : 'exact pickup unconfirmed'}`,
    confirmed: rider.pickupAccuracy === 'SELECTED_POINT',
  })) ?? [];
  const selected = state.result?.candidates.find((candidate) => candidate.candidate.id === state.selectedRiderId);
  const feasible = state.result?.candidates.filter((candidate) => candidate.evaluation.status === 'FEASIBLE').sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)) ?? [];
  const others = state.result?.candidates.filter((candidate) => candidate.evaluation.status !== 'FEASIBLE') ?? [];

  return (
    <Screen eyebrow="DEVELOPMENT ONLY · LIVE OSRM" onBack={onBack} subtitle="Evaluate independent synthetic pickups without changing your account or commute." title="Test as driver">
      <Card style={styles.identity}>
        <View style={styles.headerRow}><Ionicons color={colors.accent} name="car-outline" size={24} /><View style={styles.flex}><Text accessibilityRole="header" style={styles.identityTitle}>You are the Queens test driver — synthetic data</Text><Text style={styles.muted}>Jamaica LIRR station → Stony Brook University Lot 40 · {QUEENS_DRIVER_TEST_TIME_ZONE}</Text></View></View>
        <Text style={styles.note}>This state stays on this screen. It does not change your saved role, home, commute, requests, or trips.</Text>
      </Card>

      <Card style={styles.formCard}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Driver inputs</Text>
        <TextField autoCapitalize="none" autoCorrect={false} label="Trip date (YYYY-MM-DD)" onChangeText={(value) => changeField('localDate', value)} value={form.localDate} />
        <View style={styles.row}><FormField field="departureEarliest" form={form} label="Depart from" onChange={changeField} /><FormField field="departureLatest" form={form} label="Depart until" onChange={changeField} /></View>
        <FormField field="preferredDeparture" form={form} label="Preferred departure" onChange={changeField} />
        <View style={styles.row}><FormField field="arrivalEarliest" form={form} label="Campus earliest" onChange={changeField} /><FormField field="arrivalLatest" form={form} label="Campus latest" onChange={changeField} /></View>
        <View style={styles.row}><FormField field="seats" form={form} label="Passenger seats" numeric onChange={changeField} /><FormField field="maxExtraMinutes" form={form} label="Max detour (min)" numeric onChange={changeField} /><FormField field="maxExtraPercent" form={form} label="Max detour (%)" numeric onChange={changeField} /></View>
        <Text style={styles.muted}>The evaluator applies whichever detour cap is stricter.</Text>
        <AppButton label={state.riders ? 'Reload test riders' : 'Load test riders'} onPress={loadRiders} variant="secondary" />
      </Card>

      <View style={styles.mapSection}>
        <RiderComparisonMap baselineRoute={state.result?.baselineRoute ?? null} campus={queensDriverTestCampus.coordinate} campusTitle="Campus destination · Lot 40" driverStart={queensDriverTestStart} driverTitle="Queens test driver start · Jamaica LIRR" fitKey={fitKey} onSelectCandidate={(riderId) => dispatch({ type: 'SELECT', riderId })} riders={markers} selectedCandidateId={state.selectedRiderId} selectedRoute={selected?.route ?? null} />
        <View style={styles.legend}><Legend color={colors.textMuted} label="Direct Jamaica → campus road route" /><Legend color={colors.accent} label="Road route through selected pickup" /></View>
        <Text style={styles.liveNote}>Live OSRM road geometry and static estimates. Results never fall back to schematic or fixture routes.</Text>
        {state.result?.baselineFailure && <Text style={styles.error}>Direct route: {state.result.baselineFailure.message}</Text>}
        <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>
        {error && <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text>}
        <AppButton disabled={!state.riders || state.evaluating} label="Find riders" onPress={findRiders} />
        {state.evaluating && <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Evaluating independent pickups…</Text><Pressable accessibilityRole="button" onPress={cancel} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable></View>}
      </View>

      {state.result && <View style={styles.results}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Rider results</Text>
        <Text style={styles.summary}>{resultSummary(state.result.candidates)}</Text>
        <Text style={styles.note}>Each rider is evaluated independently. Three seats does not mean the top three riders can travel together.</Text>
        {feasible.map((candidate) => <RiderCard baselineSeconds={state.result?.baselineRoute?.durationSeconds ?? null} candidate={candidate} key={candidate.candidate.id} onSelect={(riderId) => dispatch({ type: 'SELECT', riderId })} selected={candidate.candidate.id === state.selectedRiderId} />)}
        <Disclosure count={others.length} expanded={otherExpanded} onToggle={() => setOtherExpanded((value) => !value)} title="Doesn't fit or needs information">
          {others.map((candidate) => <RiderCard baselineSeconds={state.result?.baselineRoute?.durationSeconds ?? null} candidate={candidate} key={candidate.candidate.id} onSelect={(riderId) => dispatch({ type: 'SELECT', riderId })} selected={candidate.candidate.id === state.selectedRiderId} />)}
        </Disclosure>
      </View>}

      <Disclosure expanded={false} onToggle={() => {}} title="Test rider details" uncontrolled>
        {state.riders?.map((rider) => <View key={rider.id} style={styles.riderDetail}><Text style={styles.riderName}>{cleanName(rider.name)} · synthetic rider</Text><Text style={styles.muted}>{rider.pickupLabel}</Text><Text style={styles.muted}>Ready {formatWindow(rider.input.rider.pickupWindow)} · arrival {formatWindow(rider.input.rider.destinationArrivalWindow)}</Text><Text style={styles.muted}>Walking assumption: {formatDuration(rider.input.rider.accessWalkSeconds)} to pickup + {formatDuration(rider.input.rider.egressWalkSeconds)} after drop-off</Text><Text style={styles.note}>{rider.intendedOutcome}</Text></View>) ?? <Text style={styles.muted}>Load test riders to see their synthetic schedules.</Text>}
      </Disclosure>
    </Screen>
  );
}

function FormField({ field, form, label, numeric, onChange }: { field: keyof DriverForm; form: DriverForm; label: string; numeric?: boolean; onChange: (field: keyof DriverForm, value: string) => void }) {
  return <View style={styles.field}><TextField autoCapitalize="none" autoCorrect={false} keyboardType={numeric ? 'number-pad' : 'numbers-and-punctuation'} label={label} onChangeText={(value) => onChange(field, value)} value={form[field]} /></View>;
}

function RiderCard({ baselineSeconds, candidate, onSelect, selected }: { baselineSeconds: number | null; candidate: EvaluatedRiderDemoCandidate; onSelect: (id: string) => void; selected: boolean }) {
  const status = candidate.evaluation.status === 'FEASIBLE' ? `#${candidate.rank}` : candidate.evaluation.status === 'INFEASIBLE' ? "Doesn't fit" : 'Needs information';
  const evaluation = candidate.evaluation;
  const summary = evaluation.status === 'FEASIBLE'
    ? `Adds ${formatDuration(evaluation.metrics.driverExtraDurationSeconds)} · pickup ${formatTime(evaluation.plan.pickup)} · campus ${formatTime(evaluation.plan.vehicleCampusArrival)}`
    : riderDemoReasonExplanations[evaluation.reasonCodes[0]];
  const routeAdded = candidate.route && baselineSeconds !== null ? candidate.route.durationSeconds + candidate.candidate.input.pickupServiceSeconds - baselineSeconds : null;
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onSelect(candidate.candidate.id)}><Card style={[styles.riderCard, selected && styles.selectedCard]}>
    <View style={styles.headerRow}><Text style={styles.riderCardTitle}>{status} {cleanName(candidate.candidate.name)}</Text><View style={[styles.dot, evaluation.status === 'FEASIBLE' ? styles.good : evaluation.status === 'INFEASIBLE' ? styles.bad : styles.warn]} /></View>
    <Text style={styles.cardSummary}>{summary}</Text>
    {candidate.rankingExplanation && <Text style={styles.ranking}>{candidate.rankingExplanation}</Text>}
    {candidate.routingIssue && <Text style={styles.error}>{candidate.routingIssue.message}</Text>}
    <SimpleDisclosure title="Why this result?">
      <Text style={styles.muted}>Pickup: {candidate.candidate.pickupLabel}</Text>
      <Text style={styles.muted}>Ready {formatWindow(candidate.candidate.input.rider.pickupWindow)} · arrival {formatWindow(candidate.candidate.input.rider.destinationArrivalWindow)}</Text>
      <Text style={styles.muted}>Walking assumption: {formatDuration(candidate.candidate.input.rider.accessWalkSeconds)} + {formatDuration(candidate.candidate.input.rider.egressWalkSeconds)}</Text>
      {candidate.route && <Text style={styles.muted}>Road route: {formatDistance(candidate.route.distanceMeters)} · {formatDuration(candidate.route.durationSeconds)}</Text>}
      {routeAdded !== null && <Text style={styles.muted}>Added driver time including boarding: {formatDuration(routeAdded)}</Text>}
      {evaluation.status !== 'FEASIBLE' && <Text style={styles.muted}>Reason codes: {evaluation.reasonCodes.join(', ')}</Text>}
    </SimpleDisclosure>
  </Card></Pressable>;
}

function Disclosure({ children, count, expanded, onToggle, title, uncontrolled }: { children: ReactNode; count?: number; expanded: boolean; onToggle: () => void; title: string; uncontrolled?: boolean }) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const open = uncontrolled ? localExpanded : expanded;
  const toggle = uncontrolled ? () => setLocalExpanded((value) => !value) : onToggle;
  return <View style={styles.disclosure}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={toggle} style={styles.disclosureHeader}><Text style={styles.disclosureTitle}>{title}{count === undefined ? '' : ` (${count})`}</Text><Ionicons color={colors.textMuted} name={open ? 'chevron-up' : 'chevron-down'} size={18} /></Pressable>{open && <View style={styles.disclosureBody}>{children}</View>}</View>;
}

function SimpleDisclosure({ children, title }: { children: ReactNode; title: string }) { const [expanded, setExpanded] = useState(false); return <View><Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.whyHeader}><Text style={styles.whyTitle}>{title}</Text><Ionicons color={colors.textMuted} name={expanded ? 'chevron-up' : 'chevron-down'} size={17} /></Pressable>{expanded && <View style={styles.whyBody}>{children}</View>}</View>; }
function Legend({ color, label }: { color: string; label: string }) { return <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: color }]} /><Text style={styles.muted}>{label}</Text></View>; }
function cleanName(name: string): string { return name.replace(/\s*\(synthetic rider\)$/, ''); }
function formatTime(epoch: number): string { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: QUEENS_DRIVER_TEST_TIME_ZONE }).format(new Date(epoch * 1000)); }
function formatWindow(window: { earliest: number; latest: number }): string { return `${formatTime(window.earliest)}–${formatTime(window.latest)}`; }
function formatDuration(seconds: number): string { const minutes = seconds / 60; return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`; }
function formatDistance(meters: number): string { return `${(meters / 1609.344).toFixed(1)} mi`; }
function resultSummary(candidates: readonly EvaluatedRiderDemoCandidate[]): string { const count = (status: 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN') => candidates.filter((candidate) => candidate.evaluation.status === status).length; return `${count('FEASIBLE')} suitable · ${count('INFEASIBLE')} don't fit · ${count('UNKNOWN')} need information.`; }

const styles = StyleSheet.create({
  flex: { flex: 1 }, identity: { backgroundColor: colors.successSoft, gap: spacing.md }, identityTitle: { color: colors.success, fontSize: 17, fontWeight: '900', lineHeight: 22 }, headerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18 }, note: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  formCard: { gap: spacing.md }, sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '900' }, row: { flexDirection: 'row', gap: spacing.sm }, field: { flex: 1 },
  mapSection: { gap: spacing.sm }, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, legendItem: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs }, legendLine: { borderRadius: radii.pill, height: 6, width: 24 }, liveNote: { backgroundColor: colors.successSoft, borderRadius: radii.md, color: colors.success, fontSize: 12, fontWeight: '700', lineHeight: 18, padding: spacing.sm }, notice: { color: colors.accent, fontSize: 14, fontWeight: '800', lineHeight: 20 }, error: { backgroundColor: colors.errorSoft, borderRadius: radii.md, color: colors.error, fontSize: 12, lineHeight: 18, padding: spacing.sm }, loading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, cancel: { marginLeft: 'auto', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm }, cancelText: { color: colors.accent, fontWeight: '800' },
  results: { gap: spacing.md }, summary: { color: colors.text, fontSize: 16, fontWeight: '800' }, riderCard: { gap: spacing.sm, padding: spacing.md }, selectedCard: { borderColor: colors.accent, borderWidth: 2 }, riderCardTitle: { color: colors.text, flex: 1, fontSize: 16, fontWeight: '900' }, dot: { borderRadius: radii.pill, height: 11, width: 11 }, good: { backgroundColor: colors.success }, bad: { backgroundColor: colors.error }, warn: { backgroundColor: colors.warning }, cardSummary: { color: colors.text, fontSize: 13, fontWeight: '700', lineHeight: 19 }, ranking: { color: colors.success, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  disclosure: { borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' }, disclosureHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 50, paddingHorizontal: spacing.md }, disclosureTitle: { color: colors.text, fontSize: 14, fontWeight: '800' }, disclosureBody: { backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.sm, padding: spacing.sm }, whyHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 }, whyTitle: { color: colors.text, fontSize: 12, fontWeight: '800' }, whyBody: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingTop: spacing.sm }, riderDetail: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingVertical: spacing.sm }, riderName: { color: colors.text, fontSize: 14, fontWeight: '800' },
});
