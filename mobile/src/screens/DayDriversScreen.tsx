import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Avatar } from '../components/Avatar';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { formatTime, type CommuteSchedule, type Weekday } from '../commute/commuteModel';
import {
  QUEENS_TEST_DRIVER_ID,
  queensTestDriverOffer,
  queensTestDriverRoutingProfile,
  syntheticDriverRoutingProfiles,
} from '../matching/driverRecommendationFixtures';
import {
  evaluateDriverRecommendations,
  LatestDriverRecommendationEvaluation,
  NORMAL_MATCHING_TIME_ZONE,
  parseClockMinutes,
  validateRecommendationSetup,
  weekdayForLocalDate,
  type DriverRecommendation,
  type DriverRecommendationResult,
  type RiderRecommendationSetup,
} from '../matching/driverRecommendations';
import { RequestSheet } from '../rides/components/RequestSheet';
import type { DatedRideProposalV1 } from '../rides/datedRideProposal';
import type { RequestTransitionCode } from '../rides/requestTransitions';
import { StatusPill } from '../rides/components/StatusPill';
import { requestOccursOn, type DriverOffer, type IncomingRequest, type OutgoingRequest, type RequestStatus } from '../rides/rideModel';
import { createOsrmRoutingAdapter } from '../routing/osrmAdapter';
import { routePresets } from '../routing/routePresets';
import { colors, radii, spacing } from '../theme';

interface DayDriversScreenProps {
  commute: CommuteSchedule;
  day: Weekday;
  dayName: string;
  incoming: IncomingRequest[];
  localDate: string;
  offers: DriverOffer[];
  outgoing: OutgoingRequest[];
  riderId: string;
  skippedDates: string[];
  statusFor: (offerId: string) => RequestStatus | undefined;
  onBack: () => void;
  onSendDatedRequest: (proposal: DatedRideProposalV1) => RequestTransitionCode;
}

interface MatchingForm {
  pickupEarliest: string;
  pickupLatest: string;
  arrivalEarliest: string;
  arrivalLatest: string;
  seats: string;
  accessWalk: string;
  maxAccessWalk: string;
  egressWalk: string;
  maxEgressWalk: string;
  maxExtraRide: string;
}

const emptyForm: MatchingForm = {
  pickupEarliest: '', pickupLatest: '', arrivalEarliest: '', arrivalLatest: '', seats: '',
  accessWalk: '', maxAccessWalk: '', egressWalk: '', maxEgressWalk: '', maxExtraRide: '',
};

const publicMeetingPoints = routePresets.filter(
  (point) => point.id === 'stony-brook-lirr' || point.id === 'smith-haven-mall',
);

export function DayDriversScreen(props: DayDriversScreenProps) {
  const { commute, day, dayName, incoming, localDate, offers, outgoing, riderId, skippedDates } = props;
  const adapter = useMemo(() => createOsrmRoutingAdapter(), []);
  const latest = useRef(new LatestDriverRecommendationEvaluation());
  const inFlight = useRef(false);
  const uiGeneration = useRef(0);
  const [form, setForm] = useState<MatchingForm>(emptyForm);
  const [pickupPointId, setPickupPointId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DriverRecommendationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<DriverRecommendation | null>(null);
  const [queensTestDriverEnabled, setQueensTestDriverEnabled] = useState(false);
  const externalInputRevision = JSON.stringify({ commute, incoming, localDate, offers, outgoing, skippedDates });
  const previousExternalInputRevision = useRef(externalInputRevision);
  const plan = commute.days.find((candidate) => candidate.day === day);
  const skipped = skippedDates.includes(localDate);
  const roleConflict = !plan || plan.mode === 'drive' || plan.arriveBy === null || weekdayForLocalDate(localDate) !== day;
  const commitmentConflict = outgoing.some((request) => request.status === 'accepted' && requestOccursOn(request, localDate, day)) || incoming.some((request) => request.status === 'accepted' && requestOccursOn(request, localDate, day));

  useEffect(() => () => latest.current.cancel(), []);

  useEffect(() => {
    if (previousExternalInputRevision.current === externalInputRevision) return;
    previousExternalInputRevision.current = externalInputRevision;
    uiGeneration.current += 1;
    latest.current.cancel();
    inFlight.current = false;
    setLoading(false);
    setResult(null);
    setRequesting(null);
    setError(null);
  }, [externalInputRevision]);

  const clearEvaluation = () => {
    uiGeneration.current += 1;
    latest.current.cancel();
    inFlight.current = false;
    setLoading(false);
    setResult(null);
    setError(null);
  };

  const changeField = (field: keyof MatchingForm, value: string) => {
    clearEvaluation();
    setForm((current) => ({ ...current, [field]: value }));
  };

  const choosePoint = (id: string) => {
    clearEvaluation();
    setPickupPointId(id);
  };

  const setQueensTestDriver = (enabled: boolean) => {
    clearEvaluation();
    setRequesting(null);
    setQueensTestDriverEnabled(enabled);
  };

  const buildSetup = (): RiderRecommendationSetup => {
    const point = publicMeetingPoints.find((candidate) => candidate.id === pickupPointId) ?? null;
    const seconds = (value: string) => /^\d+$/.test(value.trim()) ? Number(value) * 60 : null;
    const integer = (value: string) => /^\d+$/.test(value.trim()) ? Number(value) : null;
    const pickupEarliest = parseClockMinutes(form.pickupEarliest);
    const pickupLatest = parseClockMinutes(form.pickupLatest);
    const arrivalEarliest = parseClockMinutes(form.arrivalEarliest);
    const arrivalLatest = parseClockMinutes(form.arrivalLatest);
    return {
      pickupPoint: point ? { id: point.id, label: point.label, coordinate: point.coordinate } : null,
      pickupWindowMinutes: pickupEarliest === null || pickupLatest === null ? null : { earliest: pickupEarliest, latest: pickupLatest },
      destinationArrivalWindowMinutes: arrivalEarliest === null || arrivalLatest === null ? null : { earliest: arrivalEarliest, latest: arrivalLatest },
      seatsRequested: integer(form.seats),
      accessWalkSeconds: seconds(form.accessWalk),
      maxAccessWalkSeconds: seconds(form.maxAccessWalk),
      egressWalkSeconds: seconds(form.egressWalk),
      maxEgressWalkSeconds: seconds(form.maxEgressWalk),
      maxExtraInVehicleSeconds: seconds(form.maxExtraRide),
    };
  };

  const findMatches = async () => {
    if (loading || inFlight.current) return;
    if (skipped) { setError(`You skipped ${localDate}. Undo the skip before searching.`); return; }
    if (roleConflict) { setError('This date is not configured as a TO_CAMPUS riding trip.'); return; }
    if (commitmentConflict) { setError('An accepted ride or driving commitment already covers this weekday.'); return; }
    const setup = buildSetup();
    const issues = validateRecommendationSetup(setup);
    if (issues.length > 0) { setError(issues.join(' ')); return; }
    inFlight.current = true;
    const generation = uiGeneration.current + 1;
    uiGeneration.current = generation;
    setLoading(true);
    setError(null);
    setResult(null);
    const includeQueensTestDriver = __DEV__ && queensTestDriverEnabled;
    const evaluationOffers = includeQueensTestDriver ? [...offers, queensTestDriverOffer] : offers;
    const evaluationProfiles = includeQueensTestDriver
      ? [...syntheticDriverRoutingProfiles, queensTestDriverRoutingProfile]
      : syntheticDriverRoutingProfiles;
    try {
      const response = await latest.current.run((signal) => evaluateDriverRecommendations({
        adapter, commute, localDate, timeZone: NORMAL_MATCHING_TIME_ZONE, riderId,
        offers: evaluationOffers, profiles: evaluationProfiles, setup, riderSkipped: skipped,
        riderCommitmentConflict: commitmentConflict, signal,
      }));
      if (response.status === 'CURRENT' && generation === uiGeneration.current) setResult(response.result);
    } catch (caught) {
      if (generation === uiGeneration.current) setError(caught instanceof Error ? caught.message : 'Matching could not be completed.');
    } finally {
      if (generation === uiGeneration.current) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  };

  const cancel = () => {
    uiGeneration.current += 1;
    latest.current.cancel();
    inFlight.current = false;
    setLoading(false);
    setError('Matching cancelled. You can retry without re-entering your setup.');
  };
  const feasible = result?.recommendations.filter((item) => item.evaluation?.status === 'FEASIBLE').sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)) ?? [];
  const infeasible = result?.recommendations.filter((item) => item.evaluation?.status === 'INFEASIBLE').length ?? 0;
  const unknown = result?.recommendations.filter((item) => item.evaluation?.status === 'UNKNOWN').length ?? 0;
  const capacityExcluded = result?.recommendations.filter((item) => item.excludedReason === 'NO_PASSENGER_CAPACITY').length ?? 0;
  const queensTestResult = result?.recommendations.find((item) => item.offer.id === QUEENS_TEST_DRIVER_ID);
  const queensTestResultText = queensTestResult?.evaluation
    ? queensTestResult.evaluation.status === 'FEASIBLE'
      ? `Live result: feasible${queensTestResult.rank ? ` · rank #${queensTestResult.rank}` : ''}.`
      : `Live result: ${queensTestResult.evaluation.status === 'INFEASIBLE' ? "doesn't fit" : 'needs information'} · ${queensTestResult.evaluation.reasonCodes.join(', ')}.`
    : queensTestResult?.excludedReason
      ? `Live result: not evaluated · ${queensTestResult.excludedReason}.`
      : null;

  return (
    <Screen eyebrow="TO CAMPUS · LIVE ROAD ESTIMATES" onBack={props.onBack} subtitle={`${localDate} · ${NORMAL_MATCHING_TIME_ZONE}`} title={`Drivers for ${dayName}`}>
      <Card style={styles.syntheticNotice}>
        <Text style={styles.syntheticTitle}>Synthetic candidate data</Text>
        <Text style={styles.muted}>These are frontend sample drivers, not real users. Live OSRM estimates are evaluated without exposing precise routing coordinates in cards.</Text>
      </Card>

      {__DEV__ && <Card style={styles.devTestCard}>
        <View style={styles.devTestHeader}>
          <View style={styles.flex}>
            <Text accessibilityRole="header" style={styles.heading}>Development test route</Text>
            <Text style={styles.muted}>Adds a temporary candidate whose driver route starts at Jamaica LIRR. Your public rider pickup remains a separate choice below.</Text>
          </View>
          {queensTestDriverEnabled && <StatusPill label="Active" tone="success" />}
        </View>
        {queensTestDriverEnabled && <View style={styles.testProfileSummary}>
          <Text accessibilityLiveRegion="polite" style={styles.testProfileTitle}>Queens test driver — synthetic data</Text>
          <Text style={styles.muted}>Driver origin: Jamaica LIRR station · departs 6:30–7:15 AM · prefers 6:45 AM</Text>
          <Text style={styles.muted}>Campus arrival window: 8:00–9:30 AM · 3 seats · up to 25 min / 30% added driving</Text>
          <Text style={styles.helper}>Live OSRM estimates decide the outcome; this shortcut does not force a match or use fixture routes.</Text>
          {queensTestResultText && <Text accessibilityLiveRegion="polite" style={styles.testResult}>{queensTestResultText}</Text>}
        </View>}
        <AppButton
          label={queensTestDriverEnabled ? 'Reset test driver' : 'Use Queens test start'}
          onPress={() => setQueensTestDriver(!queensTestDriverEnabled)}
          variant="secondary"
        />
      </Card>}

      <Card style={styles.setupCard}>
        <Text accessibilityRole="header" style={styles.heading}>Complete matching setup</Text>
        <Text style={styles.muted}>Your saved target is {plan?.arriveBy === null || plan?.arriveBy === undefined ? 'not set' : formatTime(plan.arriveBy)}. Enter windows explicitly; the app will not turn that single time into flexibility.</Text>
        <Text style={styles.label}>Public meeting point</Text>
        <View style={styles.pointRow}>
          {publicMeetingPoints.map((point) => (
            <Pressable accessibilityRole="radio" accessibilityState={{ checked: pickupPointId === point.id }} key={point.id} onPress={() => choosePoint(point.id)} style={[styles.pointButton, pickupPointId === point.id && styles.pointButtonSelected]}>
              <Text style={[styles.pointText, pickupPointId === point.id && styles.pointTextSelected]}>{point.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.helper}>This selected public point is used for routing. Your saved privacy-area center is never used.</Text>
        <View style={styles.twoColumns}><CompactInput field="pickupEarliest" form={form} label="Ready from (HH:MM)" onChange={changeField} /><CompactInput field="pickupLatest" form={form} label="Ready until (HH:MM)" onChange={changeField} /></View>
        <View style={styles.twoColumns}><CompactInput field="arrivalEarliest" form={form} label="Campus earliest (HH:MM)" onChange={changeField} /><CompactInput field="arrivalLatest" form={form} label="Campus latest (HH:MM)" onChange={changeField} /></View>
        <CompactInput field="seats" form={form} label="Passenger seats needed" onChange={changeField} numeric />
        <View style={styles.twoColumns}><CompactInput field="accessWalk" form={form} label="Walk to pickup (min)" onChange={changeField} numeric /><CompactInput field="maxAccessWalk" form={form} label="Maximum walk there (min)" onChange={changeField} numeric /></View>
        <View style={styles.twoColumns}><CompactInput field="egressWalk" form={form} label="Walk after drop-off (min)" onChange={changeField} numeric /><CompactInput field="maxEgressWalk" form={form} label="Maximum walk after (min)" onChange={changeField} numeric /></View>
        <CompactInput field="maxExtraRide" form={form} label="Maximum extra in-vehicle time (min)" onChange={changeField} numeric />
        <AppButton disabled={loading} label={result ? 'Refresh matches' : 'Find matches'} onPress={findMatches} />
        {loading && <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Requesting directed road estimates…</Text><Pressable accessibilityRole="button" onPress={cancel} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable></View>}
        {error && <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text>}
      </Card>

      {result && <View style={styles.results}>
        <Text accessibilityRole="header" style={styles.heading}>{feasible.length} feasible recommendation{feasible.length === 1 ? '' : 's'}</Text>
        <Text style={styles.muted}>{infeasible} did not fit · {unknown} need routing information · {capacityExcluded} lacked capacity. Only feasible candidates are ranked.</Text>
        {feasible.length === 0 && <Card><Text style={styles.empty}>No sample driver satisfies every entered schedule, walking, capacity, and detour constraint. Adjust your explicit setup or retry routing.</Text></Card>}
        {feasible.map((item) => <RecommendationCard item={item} key={item.offer.id} onRequest={() => setRequesting(item)} requestStatus={props.statusFor(item.offer.id)} />)}
        {result.recommendations.filter((item) => item.routingMessage).map((item) => <Text key={item.offer.id} style={styles.error}>{item.offer.driverName}: {item.routingMessage}</Text>)}
      </View>}

      {requesting?.proposal && <RequestSheet initialDays={[day]} offer={requesting.offer} onClose={() => setRequesting(null)} onSend={() => {
        const code = props.onSendDatedRequest(requesting.proposal!);
        setRequesting(null);
        if (code !== 'CREATED') setError(code === 'OUTDATED_PROPOSAL' ? 'This recommendation is outdated. Refresh matches before requesting.' : `The dated request was not created (${code}).`);
      }} proposal={requesting.proposal} sharedDays={[day]} />}
    </Screen>
  );
}

function CompactInput({ field, form, label, numeric, onChange }: { field: keyof MatchingForm; form: MatchingForm; label: string; numeric?: boolean; onChange: (field: keyof MatchingForm, value: string) => void }) {
  return <View style={styles.input}><TextField autoCapitalize="none" autoCorrect={false} keyboardType={numeric ? 'number-pad' : 'numbers-and-punctuation'} label={label} onChangeText={(value) => onChange(field, value)} placeholder={numeric ? 'Minutes' : '08:15'} value={form[field]} /></View>;
}

function RecommendationCard({ item, onRequest, requestStatus }: { item: DriverRecommendation; onRequest: () => void; requestStatus?: RequestStatus }) {
  if (item.evaluation?.status !== 'FEASIBLE') return null;
  const evaluation = item.evaluation;
  const time = (epoch: number) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: NORMAL_MATCHING_TIME_ZONE }).format(new Date(epoch * 1000));
  const minutes = (seconds: number) => `${Math.round(seconds / 60)} min`;
  return <Card style={styles.recommendation}>
    <View style={styles.driverHeader}><Avatar name={item.offer.driverName} /><View style={styles.flex}><Text style={styles.driverName}>#{item.rank} {item.offer.driverName}</Text><Text style={styles.muted}>{item.offer.startAreaLabel} · synthetic driver</Text></View><Text style={styles.seats}>{item.offer.seatsLeft} seats</Text></View>
    <Text style={styles.metrics}>Pickup {time(evaluation.plan.pickup)} · Campus {time(evaluation.plan.vehicleCampusArrival)}</Text>
    <Text style={styles.metrics}>Adds {minutes(evaluation.metrics.driverExtraDurationSeconds)} driving · active detour limit {minutes(evaluation.metrics.activeDriverDetourLimitSeconds)}</Text>
    <Text style={styles.explanation}>{item.rankingExplanation}</Text>
    {item.offer.id === QUEENS_TEST_DRIVER_ID
      ? <Text style={styles.helper}>Synthetic routing test only · ride requests are disabled for this profile.</Text>
      : requestStatus === 'accepted' ? <StatusPill label="Confirmed" tone="success" /> : requestStatus === 'pending' ? <StatusPill label="Requested · waiting" tone="warning" /> : <AppButton label={`Request ${item.offer.driverName}`} onPress={onRequest} variant="secondary" />}
  </Card>;
}

const styles = StyleSheet.create({
  syntheticNotice: { backgroundColor: colors.warningSoft, gap: spacing.xs }, syntheticTitle: { color: colors.warning, fontSize: 15, fontWeight: '800' },
  devTestCard: { gap: spacing.md }, devTestHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.md }, testProfileSummary: { backgroundColor: colors.successSoft, borderRadius: radii.md, gap: spacing.xs, padding: spacing.md }, testProfileTitle: { color: colors.success, fontSize: 15, fontWeight: '900' }, testResult: { color: colors.text, fontSize: 13, fontWeight: '800', lineHeight: 19, marginTop: spacing.xs },
  setupCard: { gap: spacing.md }, heading: { color: colors.text, fontSize: 19, fontWeight: '800' }, muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 }, label: { color: colors.text, fontSize: 14, fontWeight: '700' }, helper: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  pointRow: { flexDirection: 'row', gap: spacing.sm }, pointButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48, padding: spacing.sm }, pointButtonSelected: { backgroundColor: colors.text, borderColor: colors.text }, pointText: { color: colors.text, fontSize: 12, fontWeight: '700', textAlign: 'center' }, pointTextSelected: { color: colors.surface },
  twoColumns: { flexDirection: 'row', gap: spacing.sm }, input: { flex: 1 }, loading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, cancel: { justifyContent: 'center', marginLeft: 'auto', minHeight: 44, paddingHorizontal: spacing.sm }, cancelText: { color: colors.accent, fontWeight: '800' }, error: { backgroundColor: colors.errorSoft, borderRadius: radii.md, color: colors.error, fontSize: 12, lineHeight: 18, padding: spacing.sm },
  results: { gap: spacing.md }, empty: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' }, recommendation: { gap: spacing.md }, driverHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, minHeight: 48 }, flex: { flex: 1 }, driverName: { color: colors.text, fontSize: 17, fontWeight: '900' }, seats: { color: colors.textMuted, fontSize: 12, fontWeight: '700' }, metrics: { color: colors.text, fontSize: 14, fontWeight: '700', lineHeight: 20 }, explanation: { color: colors.success, fontSize: 12, fontWeight: '700', lineHeight: 18 },
});
