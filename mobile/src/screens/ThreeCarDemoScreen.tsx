import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Avatar } from '../components/Avatar';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { useThreeCarDemo } from '../matching/ThreeCarDemoProvider';
import { DEMO3X7_TIME_ZONE } from '../matching/demo3x7Fixtures';
import { acceptedPlanPresentationGeometry, threeCarDriverColor, type ThreeCarDemoMode } from '../matching/threeCarDemoController';
import type { GroupRecommendation } from '../matching/groupRecommendations';
import { getAcceptedMembers, getDriverCapacity } from '../rides/groupRideContracts';
import { MultiCarScenarioMap, type MultiCarMapActor, type MultiCarMapRoute } from '../routing/components/RouteMap';
import { resolvePublicProfile } from '../profiles/publicProfiles';
import { SCENARIO_MAP_PIN_COLORS } from '../routing/scenarioMapPinModel';
import { colors, radii, spacing } from '../theme';

interface Props {
  onBack: () => void;
  onOpenProfile: (participantId: string, displayName: string) => void;
}

const RIDER_COLORS = ['#d6604d', '#b07b00', '#2878a5', '#227c7a', '#714fbf', '#477a40', '#a0446d'] as const;
const DRIVER_LETTERS = ['J', 'M', 'T'] as const;
const RIDER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

export function ThreeCarDemoScreen({ onBack, onOpenProfile }: Props) {
  const { controller, state } = useThreeCarDemo();
  const [rejectionsOpen, setRejectionsOpen] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const scenario = state.scenario;
  const selectedDriver = scenario?.driverOccurrences.find((item) => item.id === state.selectedDriverOccurrenceId) ?? null;
  const selectedOffer = scenario?.offers.find((item) => item.id === selectedDriver?.offerId) ?? null;
  const recommendations = state.recommendations?.status === 'COMPLETE'
    ? state.recommendations.recommendations.filter((item) => item.driverOccurrenceId === selectedDriver?.id)
    : [];
  const feasible = recommendations.filter((item): item is Extract<GroupRecommendation, { status: 'FEASIBLE' }> => item.status === 'FEASIBLE')
    .sort((a, b) => a.rank - b.rank);
  const other = recommendations.filter((item) => item.status !== 'FEASIBLE');
  const selectedRecommendation = controller.selectedRecommendation();
  const capacity = selectedDriver && scenario ? getDriverCapacity(scenario, selectedDriver.id) : null;
  const accepted = selectedDriver && scenario ? getAcceptedMembers(scenario, selectedDriver.id) : [];

  const drivers = useMemo<MultiCarMapActor[]>(() => scenario?.driverOccurrences.map((driver, index) => {
    const offer = scenario.offers.find((item) => item.id === driver.offerId)!;
    return { id: driver.id, coordinate: driver.start.coordinate, title: offer.driverName,
      subtitle: `${offer.startAreaLabel} · ${getDriverCapacity(scenario, driver.id)?.committedSeats ?? 0}/${driver.passengerCapacity} seats occupied`, color: threeCarDriverColor(index), identityLetter: DRIVER_LETTERS[index], role: 'DRIVER' };
  }) ?? [], [scenario]);
  const riders = useMemo<MultiCarMapActor[]>(() => scenario?.riderIntents.map((intent, index) => {
    const membership = scenario.acceptedMemberships.find((item) => item.riderIntentId === intent.id);
    const acceptedDriver = membership && scenario.driverOccurrences.find((item) => item.id === membership.driverOccurrenceId);
    const acceptedName = acceptedDriver && scenario.offers.find((item) => item.id === acceptedDriver.offerId)?.driverName;
    return {
      id: intent.id,
      coordinate: intent.pickup.status === 'CONFIRMED' ? intent.pickup.point.coordinate : intent.pickup.approximateCoordinate!,
      title: participantName(intent.riderParticipantId),
      subtitle: intent.pickup.status === 'CONFIRMED'
        ? `${acceptedName ? `Accepted in ${acceptedName}'s test car` : 'Available rider intent'} · confirmed synthetic routing point · ${intent.requestedSeats} seat${intent.requestedSeats === 1 ? '' : 's'}`
        : `Pending rider · approximate area · ${intent.pickup.areaLabel}`,
      color: RIDER_COLORS[index], identityLetter: RIDER_LETTERS[index], role: 'RIDER' as const, approximate: intent.pickup.status !== 'CONFIRMED',
    };
  }) ?? [], [scenario]);
  const routes: MultiCarMapRoute[] = (() => {
    if (!scenario) return [];
    const values: MultiCarMapRoute[] = scenario.combinedPlans.flatMap((plan) => {
      const driverIndex = scenario.driverOccurrences.findIndex((item) => item.id === plan.driverOccurrenceId);
      const driver = scenario.driverOccurrences[driverIndex];
      const name = scenario.offers.find((item) => item.id === driver.offerId)!.driverName;
      const coordinates = acceptedPlanPresentationGeometry({ mode: state.mode, roadGeometry: state.acceptedGeometryByDriver[driver.id], plan, driver });
      return coordinates ? [{ id: `accepted-${plan.revision}`, coordinates,
        color: threeCarDriverColor(driverIndex), label: `${name} accepted route`, kind: 'ACCEPTED' as const }] : [];
    });
    if (state.proposedGeometry && selectedDriver && selectedRecommendation?.status === 'FEASIBLE') values.push({
      id: `proposed-${selectedRecommendation.plan.revision}`, coordinates: state.proposedGeometry,
      color: '#0b6f9e', label: `${selectedOffer?.driverName ?? 'Selected car'} proposed route`, kind: 'PROPOSED',
    });
    return values;
  })();

  return <Screen eyebrow="DEVELOPMENT DEMO · ISOLATED STATE" onBack={onBack} title="Three cars / seven riders" subtitle="Independent complete-group recommendations with explicit simulated acceptance.">
    <Card style={styles.banner}>
      <Text style={styles.bannerTitle}>{state.mode === 'FIXTURE' ? 'Fixture mode' : 'Live OSRM mode'}</Text>
      <Text style={state.mode === 'FIXTURE' ? styles.schematic : styles.live}>{state.mode === 'FIXTURE' ? 'Developer deterministic fixture · Schematic — not a road route.' : 'Live OSRM is authoritative. Results, rankings, and pickup orders are calculated at runtime with no fixture fallback.'}</Text>
      <Text style={styles.meta}>{displayDate(state.localDate)} · TO_CAMPUS · {DEMO3X7_TIME_ZONE}</Text>
    </Card>

    {!scenario ? <Card style={styles.setup}>
      <Text style={styles.sectionTitle}>Load the isolated scenario</Text>
      <Text style={styles.body}>Loading creates three offers and seven available intents. It creates no pending requests, reservations, or accepted memberships.</Text>
      <AppButton label="Load demo data" onPress={() => controller.loadData()} />
    </Card> : <>
      <View style={styles.actionRow}><AppButton label="Find matches" disabled={state.phase !== 'READY'} onPress={() => void controller.findMatches()} /><AppButton label="Reset demo" disabled={state.phase === 'CHECKING' || state.phase === 'CANCELLING'} onPress={() => controller.reset()} variant="secondary" /></View>
      <Text accessibilityLiveRegion="polite" style={styles.notice}>{state.notice}</Text>
      {(state.phase === 'MATCHING' || state.phase === 'CHECKING' || state.phase === 'CANCELLING') && <View style={styles.checking}><ActivityIndicator color={colors.accent} /><Text style={styles.body}>{state.phase === 'CHECKING' ? 'Checking acceptance…' : state.phase === 'CANCELLING' ? 'Checking cancellation…' : 'Finding matches…'}</Text></View>}

      <View style={styles.driverControls} accessibilityRole="radiogroup">
        {scenario.driverOccurrences.map((driver) => {
          const offer = scenario.offers.find((item) => item.id === driver.offerId)!;
          return <Pressable accessibilityRole="radio" accessibilityState={{ checked: driver.id === selectedDriver?.id }} key={driver.id} onPress={() => controller.selectDriver(driver.id)} style={[styles.pill, driver.id === selectedDriver?.id && styles.pillSelected]}><Text style={[styles.pillText, driver.id === selectedDriver?.id && styles.pillTextSelected]}>{offer.driverName}</Text></Pressable>;
        })}
      </View>
      <Text style={styles.viewing}>Viewing {selectedOffer?.driverName}’s test car · {capacity?.committedSeats ?? 0}/{capacity?.passengerCapacity ?? 0} passenger seats occupied</Text>

      <MultiCarScenarioMap campus={selectedDriver!.campusDropoff.coordinate} drivers={drivers} fitKey={state.fitKey} onSelectDriver={(id) => controller.selectDriver(id)} onSelectRider={(id) => controller.selectRider(id)} riders={riders} routes={routes} selectedDriverId={selectedDriver!.id} selectedRiderId={state.selectedRiderIntentId} soloBaseline={state.soloBaselineGeometry} />
      <View style={styles.legend}><Legend color={colors.textMuted} label="Selected car solo baseline" /><Legend color="#0b6f9e" label="Proposed complete group (dashed)" />{scenario.driverOccurrences.map((driver, index) => <Legend color={threeCarDriverColor(index)} key={driver.id} label={`${scenario.offers.find((item) => item.id === driver.offerId)!.driverName} accepted`} />)}</View>
      <View style={styles.legend}><Legend color={SCENARIO_MAP_PIN_COLORS.DRIVER} label="Driver pin · J/M/T" /><Legend color={SCENARIO_MAP_PIN_COLORS.RIDER} label="Rider pin · A–G" /><Legend color={SCENARIO_MAP_PIN_COLORS.CAMPUS} label="Tabler campus pin" /></View>
      <Text style={styles.coLocated}>Every pin is anchored to its confirmed input coordinate. Identity letters remain separate from any pickup-order numbering.</Text>
      {state.mode === 'LIVE' && scenario.combinedPlans.some((plan) => !state.acceptedGeometryByDriver[plan.driverOccurrenceId]) && <Text accessibilityLiveRegion="assertive" style={styles.warning}>An accepted plan is preserved, but its live road geometry is unavailable. No schematic fallback is drawn.</Text>}

      {accepted.length > 0 && <View style={styles.section}>
        <Text style={styles.sectionTitle}>Accepted in this test car</Text>
        {accepted.map((membership) => <AcceptedCard key={membership.requestId} membership={membership} onOpenProfile={onOpenProfile} onRemove={() => void controller.cancelMembership(membership.requestId)} removing={state.phase === 'CANCELLING'} />)}
      </View>}

      {state.recommendations?.status === 'COMPLETE' && <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ranked feasible additions</Text>
        {feasible.length === 0 && <Text style={styles.body}>No feasible uncommitted additions for this car.</Text>}
        {feasible.map((item) => <RecommendationCard item={item} key={item.riderIntentId} onOpenProfile={onOpenProfile} onSelect={() => controller.selectRider(item.riderIntentId)} selected={state.selectedRiderIntentId === item.riderIntentId} />)}
        {selectedRecommendation?.status === 'FEASIBLE' && <Card style={styles.preview}>
          <Text style={styles.sectionTitle}>Complete proposed group preview</Text>
          <Text style={styles.body}>Order: {selectedRecommendation.plan.selectedRequestOrder.map((id) => nameForRequest(selectedRecommendation.plan, id)).join(' → ') || 'Direct to Tabler'}</Text>
          <Text style={styles.metrics}>Incremental +{minutes(selectedRecommendation.metrics.incrementalAddedDriverDurationSeconds)} · total +{minutes(selectedRecommendation.metrics.totalAddedDriverDurationSeconds)} over solo</Text>
          <Text style={styles.body}>Depart {clock(selectedRecommendation.plan.chosenDeparture)} · campus {clock(selectedRecommendation.plan.vehicleCampusArrival)} · destinations {selectedRecommendation.plan.pickups.map((pickup) => clock(pickup.destinationArrival)).join(', ')}</Text>
          <Text style={styles.helper}>Simulated acceptance only. The recommendation has not reserved a seat.</Text>
          <AppButton disabled={state.phase !== 'READY'} label="Accept simulated test request" onPress={() => void controller.acceptSelected()} />
        </Card>}
        <Disclosure expanded={rejectionsOpen} onToggle={() => setRejectionsOpen((value) => !value)} title={`Rejected, unknown, or unavailable (${other.length})`}>
          {other.map((item) => <ReasonRow item={item} key={item.riderIntentId} onOpenProfile={onOpenProfile} onSelect={() => controller.selectRider(item.riderIntentId)} />)}
        </Disclosure>
      </View>}
    </>}

    <Disclosure expanded={technicalOpen} onToggle={() => setTechnicalOpen((value) => !value)} title="Mode, date, and technical details">
      <Text style={styles.warning}>Changing mode or date resets only this isolated demo and cancels outstanding work.</Text>
      <View style={styles.modeRow}><ModeButton current={state.mode} label="Live OSRM · default" mode="LIVE" onPress={() => controller.reset({ mode: 'LIVE' })} /><ModeButton current={state.mode} label="Developer deterministic fixture" mode="FIXTURE" onPress={() => controller.reset({ mode: 'FIXTURE' })} /></View>
      <View style={styles.modeRow}><DateButton date="2026-10-19" current={state.localDate} onPress={(date) => controller.reset({ localDate: date })} /><DateButton date="2026-10-20" current={state.localDate} onPress={(date) => controller.reset({ localDate: date })} /></View>
      <Text style={styles.raw}>Loaded records: {scenario ? `${scenario.driverOccurrences.length} drivers, ${scenario.riderIntents.length} riders, ${scenario.pendingRequests.length} pending, ${scenario.acceptedMemberships.length} accepted` : 'none'}</Text>
      <Text style={styles.raw}>Routing: {state.diagnostics ? `${state.diagnostics.directedLegProviderRequests} provider leg requests, ${state.diagnostics.geometryRequests} geometry requests, ${state.diagnostics.cacheHits} cache hits, max concurrency ${state.diagnostics.maxConcurrentProviderRequests}` : 'not started'}</Text>
      <Text style={styles.raw}>Generation: {scenario?.generationId ?? 'not loaded'}</Text>
    </Disclosure>
  </Screen>;
}

function RecommendationCard({ item, onOpenProfile, onSelect, selected }: { item: Extract<GroupRecommendation, { status: 'FEASIBLE' }>; onOpenProfile: Props['onOpenProfile']; onSelect: () => void; selected: boolean }) {
  const name = participantName(item.riderParticipantId); const profile = resolvePublicProfile(item.riderParticipantId, name);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onSelect}><Card style={[styles.riderCard, selected && styles.selectedCard]}><View style={styles.identity}><Pressable accessibilityLabel={`View ${name}'s profile`} accessibilityRole="button" onPress={(event) => { event.stopPropagation(); onOpenProfile(item.riderParticipantId, name); }}><Avatar name={name} participantId={item.riderParticipantId} sampleAvatar={profile.sampleAvatar} size={40} /></Pressable><View style={styles.flex}><Text style={styles.cardTitle}>#{item.rank} {name} · {item.requestedSeats} seat{item.requestedSeats === 1 ? '' : 's'}</Text><Text style={styles.metrics}>Incremental +{minutes(item.metrics.incrementalAddedDriverDurationSeconds)} · total +{minutes(item.metrics.totalAddedDriverDurationSeconds)}</Text><Text style={styles.body}>{item.explanation}</Text></View></View></Card></Pressable>;
}

function ReasonRow({ item, onOpenProfile, onSelect }: { item: GroupRecommendation; onOpenProfile: Props['onOpenProfile']; onSelect: () => void }) {
  const name = participantName(item.riderParticipantId);
  return <Pressable accessibilityRole="button" onPress={onSelect} style={styles.reason}><Pressable accessibilityLabel={`View ${name}'s profile`} accessibilityRole="button" onPress={(event) => { event.stopPropagation(); onOpenProfile(item.riderParticipantId, name); }}><Text style={styles.reasonName}>{name} · {item.status}</Text></Pressable><Text style={styles.body}>{item.explanation}</Text><Text style={styles.code}>{item.reasonCodes.join(', ')}</Text></Pressable>;
}

function AcceptedCard({ membership, onOpenProfile, onRemove, removing }: { membership: NonNullable<ReturnType<typeof getAcceptedMembers>>[number]; onOpenProfile: Props['onOpenProfile']; onRemove: () => void; removing: boolean }) {
  const name = participantName(membership.riderParticipantId);
  return <Card style={styles.acceptedCard}><Pressable accessibilityRole="button" onPress={() => onOpenProfile(membership.riderParticipantId, name)}><Text style={styles.cardTitle}>{name} · {membership.requestedSeats} seat{membership.requestedSeats === 1 ? '' : 's'} · one pickup</Text></Pressable><AppButton disabled={removing} label="Remove from test car" onPress={onRemove} variant="secondary" /></Card>;
}

function Disclosure({ children, expanded, onToggle, title }: { children: ReactNode; expanded: boolean; onToggle: () => void; title: string }) { return <View style={styles.disclosure}><Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggle} style={styles.disclosureHeader}><Text style={styles.sectionTitle}>{title}</Text><Ionicons color={colors.textMuted} name={expanded ? 'chevron-up' : 'chevron-down'} size={18} /></Pressable>{expanded && <View style={styles.disclosureBody}>{children}</View>}</View>; }
function Legend({ color, label }: { color: string; label: string }) { return <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>; }
function ModeButton({ current, label, mode, onPress }: { current: ThreeCarDemoMode; label: string; mode: ThreeCarDemoMode; onPress: () => void }) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked: current === mode }} onPress={onPress} style={[styles.pill, current === mode && styles.pillSelected]}><Text style={[styles.pillText, current === mode && styles.pillTextSelected]}>{label}</Text></Pressable>; }
function DateButton({ current, date, onPress }: { current: string; date: string; onPress: (date: string) => void }) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked: current === date }} onPress={() => onPress(date)} style={[styles.pill, current === date && styles.pillSelected]}><Text style={[styles.pillText, current === date && styles.pillTextSelected]}>{date}</Text></Pressable>; }
function participantName(id: string) { const key = id.split('-').at(-1) ?? id; return key === 'jordan' ? 'Jordan — Queens' : key[0].toUpperCase() + key.slice(1); }
function nameForRequest(plan: Extract<GroupRecommendation, { status: 'FEASIBLE' }>['plan'], requestId: string) { const id = plan.riderPromises.find((item) => item.requestId === requestId)?.riderParticipantId; return id ? participantName(id) : requestId; }
function minutes(seconds: number) { return `${Math.round(seconds / 60)} min`; }
function clock(epoch: number) { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: DEMO3X7_TIME_ZONE }).format(epoch * 1000); }
function displayDate(date: string) { return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)); }

const styles = StyleSheet.create({
  banner: { gap: spacing.sm }, bannerTitle: { color: colors.text, fontSize: 18, fontWeight: '900' }, schematic: { backgroundColor: colors.warningSoft, borderRadius: radii.sm, color: colors.warning, fontWeight: '900', padding: spacing.sm }, live: { backgroundColor: colors.successSoft, borderRadius: radii.sm, color: colors.success, fontWeight: '800', padding: spacing.sm }, meta: { color: colors.textMuted, fontSize: 13, fontWeight: '700' }, setup: { gap: spacing.md }, section: { gap: spacing.md }, sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' }, body: { color: colors.textMuted, fontSize: 13, lineHeight: 19 }, actionRow: { gap: spacing.sm }, notice: { color: colors.text, fontSize: 14, fontWeight: '700', lineHeight: 20 }, checking: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, driverControls: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, pill: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.pill, borderWidth: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md }, pillSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent }, pillText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' }, pillTextSelected: { color: colors.accent }, viewing: { color: colors.text, fontSize: 15, fontWeight: '900' }, legend: { gap: spacing.xs }, legendItem: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, legendLine: { borderRadius: 2, height: 4, width: 24 }, legendText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' }, coLocated: { color: colors.textMuted, fontSize: 11, lineHeight: 16 }, riderCard: { gap: spacing.sm }, selectedCard: { borderColor: colors.accent, borderWidth: 2 }, identity: { alignItems: 'center', flexDirection: 'row', gap: spacing.md }, flex: { flex: 1 }, cardTitle: { color: colors.text, fontSize: 15, fontWeight: '900' }, metrics: { color: colors.success, fontSize: 13, fontWeight: '900' }, helper: { color: colors.warning, fontSize: 12, fontWeight: '800' }, preview: { backgroundColor: colors.accentSoft, gap: spacing.sm }, reason: { borderBottomColor: colors.border, borderBottomWidth: 1, gap: spacing.xs, paddingVertical: spacing.sm }, reasonName: { color: colors.text, fontSize: 14, fontWeight: '900' }, code: { color: colors.textMuted, fontFamily: 'monospace', fontSize: 10 }, acceptedCard: { backgroundColor: colors.successSoft, gap: spacing.sm }, disclosure: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' }, disclosureHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 50, padding: spacing.md }, disclosureBody: { borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.md, padding: spacing.md }, warning: { color: colors.warning, fontSize: 12, fontWeight: '800', lineHeight: 18 }, modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, raw: { color: colors.textMuted, fontFamily: 'monospace', fontSize: 10, lineHeight: 15 },
});
