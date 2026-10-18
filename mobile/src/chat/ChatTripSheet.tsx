import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { Avatar } from '../components/Avatar';
import { Card } from '../components/Card';
import { METERS_PER_MILE } from '../commute/commuteModel';
import { matchMapRegion } from '../calendar/matchPresentation';
import { AcceptedTripMap } from '../calendar/AcceptedTripMap';
import { sendRideRequest, decideRideRequest, cancelRideRequest } from '../mvp/rideRequestClient';
import { rideDate, rideTime } from '../mvp/ridePresentation';
import { trafficForecastIsStale } from '../routing/types';
import { useHomeClock } from '../rides/useHomeClock';
import { useVehicle } from '../vehicle/vehicleClient';
import { colors, radii, spacing } from '../theme';
import { getChatMatch, useChatRequest } from './chatClient';
import { chatPartner, type ChatMatchDetails, type ChatThread } from './chatModel';
import { chatRequestActions, chatRequestInput } from './chatTripActions';

export function ChatTripSheet({ thread, uid, onClose }: { thread: ChatThread; uid: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(true);
  const [createdId, setCreatedId] = useState<string>();
  const requestId = thread.requestId ?? createdId;
  const context = useChatRequest(requestId, uid);
  const request = context.request;
  const key = `${uid}:${thread.id}:${requestId}:${request?.attemptId}:${request?.status}:${thread.trip?.localDate}:${thread.trip?.driverId}`;
  const [estimate, setEstimate] = useState<{ key: string; details?: ChatMatchDetails; loading?: boolean; error?: string } | undefined>(() => ({ key, loading: !requestId }));
  const details = estimate?.key === key ? estimate.details : undefined;
  const estimateLoading = estimate?.key === key && estimate.loading;
  const estimateError = estimate?.key === key ? estimate.error : undefined;
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [vehicleRequired, setVehicleRequired] = useState(false);
  const vehicle = useVehicle(uid);
  const next = useRef<(() => void) | undefined>(undefined);
  const finished = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const fetchVersion = useRef(0);
  const loadMatch = useCallback(() => {
    const version = ++fetchVersion.current;
    return getChatMatch(thread.id).then((current) => {
      if (alive.current && version === fetchVersion.current) setEstimate({ key, details: current });
    }, (failure: unknown) => {
      if (alive.current && version === fetchVersion.current)
        setEstimate({ key, error: failure instanceof Error ? failure.message : 'Match unavailable. Try again.' });
    });
  }, [key, thread.id]);
  useEffect(() => {
    if (!requestId) void loadMatch();
  }, [requestId, loadMatch]);
  const refresh = () => { setEstimate({ key, loading: true }); void loadMatch(); };
  const { now } = useHomeClock([
    request?.plan.departure ?? details?.match.plan.departure ?? 0,
    (details?.match.eta?.computedAtEpochSeconds ?? 0) + 120,
  ]);
  const epoch = now.getTime() / 1000;
  const stale = !!details && (trafficForecastIsStale(details.match.eta, epoch) || details.match.plan.departure <= epoch);
  const actions = request ? chatRequestActions(request, uid, epoch) : 'NONE';
  const other = chatPartner(thread, uid);
  const name = thread.names[other] ?? 'Carpool partner';
  const plan = request && request.status !== 'CANCELLED' ? request.plan : details?.match.plan ?? request?.plan;
  const date = request?.localDate ?? details?.localDate ?? thread.localDate;
  const driving = (request?.driverId ?? details?.match.driverId ?? thread.trip?.driverId) === uid;
  const canPropose = !requestId || request?.status === 'CANCELLED';
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onClose();
    next.current?.();
  };
  const close = (after?: () => void) => {
    if (lock.current) return;
    next.current = after;
    setVisible(false);
    if (Platform.OS !== 'ios') finish();
  };
  const mutate = async (action: 'SEND' | 'ACCEPTED' | 'DECLINED' | 'CANCEL') => {
    if (lock.current) return;
    const driverAction = action === 'SEND' ? details?.match.driverId === uid : request?.driverId === uid;
    if ((action === 'SEND' || action === 'ACCEPTED') && driverAction && !vehicle.vehicle) {
      if (vehicle.loaded) setVehicleRequired(true);
      else setError(vehicle.error ?? 'Wait for your vehicle details to load.');
      return;
    }
    if (action === 'SEND' && (!details || trafficForecastIsStale(details.match.eta, Date.now() / 1000) || details.match.plan.departure <= Date.now() / 1000)) {
      setError('Refresh the match and review its current times before requesting.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (action === 'SEND' && details) {
        const result = await sendRideRequest(chatRequestInput(details));
        setCreatedId(result.id);
      } else if (request) {
        if (action === 'CANCEL') await cancelRideRequest(request);
        else if (action !== 'SEND') await decideRideRequest(request.id, action, request.attemptId);
      }
      setEstimate(undefined);
    } catch (failure) {
      if (failure && typeof failure === 'object' && 'details' in failure &&
          (failure.details as { reason?: string })?.reason === 'VEHICLE_REQUIRED' && driverAction) setVehicleRequired(true);
      setError(failure instanceof Error ? failure.message : 'Could not update this request. Retry.');
      if (action === 'SEND') setEstimate(undefined);
    } finally { lock.current = false; setBusy(false); }
  };
  return <Modal transparent animationType="slide" visible={visible} onDismiss={finish} onRequestClose={() => close()}>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close trip details" disabled={busy}
        style={StyleSheet.absoluteFill} onPress={() => close()} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} accessibilityViewIsModal>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>{requestId ? 'Request details' : 'Match details'}</Text>
          <AppButton label="Close" variant="secondary" disabled={busy} onPress={() => close()} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.person}>
            <Avatar name={name} participantId={other} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.muted}>{rideDate(date)} · {driving ? 'Driving' : 'Riding'}</Text>
            </View>
          </View>
          {context.loading && <Text>Loading request…</Text>}
          {context.error && <Text accessibilityRole="alert">{context.error}</Text>}
          {estimateLoading && <Text>Checking the current match…</Text>}
          {estimateError && <Text accessibilityRole="alert">{estimateError}</Text>}
          {request && <Text style={styles.status}>{request.status === 'ACCEPTED' ? 'Confirmed ride' : request.status === 'PENDING' ? (request.plan.departure > epoch ? 'Request pending' : 'Departure has passed') : request.status === 'CANCELLED' ? 'Request cancelled' : 'Request declined'}</Text>}
          {plan && <Card style={{ gap: spacing.md }}>
            <Text style={styles.name}>{request?.status === 'ACCEPTED' ? 'Agreed trip' : request?.status === 'PENDING' ? 'Requested trip' : 'Estimated trip'}</Text>
            <Text>Departure · {rideTime(plan.departure)}</Text>
            {canPropose && details?.match.savedDriverDeparture !== undefined && details.match.savedDriverDeparture !== plan.departure &&
              <Text style={styles.muted}>Usual driver departure · {rideTime(details.match.savedDriverDeparture)}</Text>}
            <Text>Pickup · {rideTime(plan.pickup)}{request ? ` · ${request.pickupLabel}` : ''}</Text>
            <Text>Arrival · {rideTime(plan.vehicleCampusArrival)} · {details?.match.dropoffLabel ?? request?.campusLabel ?? thread.campusLabel}</Text>
            <Text style={styles.muted}>New York time · {Math.ceil((plan.pickup - plan.departure) / 60)} min to pickup</Text>
            {details && <Text style={styles.muted}>{Math.ceil(details.match.addedDrivingSeconds / 60)} min added driving · {details.match.eta?.model === 'TRAFFIC_FORECAST' ? 'Traffic-aware forecast · TomTom' : 'Road estimate · no live traffic'}</Text>}
          </Card>}
          {canPropose && details && <>
            <View style={styles.map} accessibilityLabel={`Your starting point and ${name}'s approximate area`}>
              <MapView style={StyleSheet.absoluteFill} initialRegion={matchMapRegion(details.ownPoint, details.match.area)}
                key={JSON.stringify([details.ownPoint, details.match.area])} toolbarEnabled={false}>
                <Circle center={details.match.area.center} radius={details.match.area.radiusMiles * METERS_PER_MILE}
                  fillColor="rgba(153,0,0,0.12)" strokeColor={colors.accent} strokeWidth={2} />
                <Marker coordinate={details.ownPoint} title="Your starting point" pinColor={colors.accent} />
              </MapView>
            </View>
            <Text style={styles.muted}>Your pin · {name}’s approximate area</Text>
          </>}
          {request?.status === 'ACCEPTED' && <AcceptedTripMap key={request.id} ride={request} routePreview />}
          {vehicleRequired && <Card style={{ gap: spacing.md }}>
            <Text style={styles.name}>Finish setting up your vehicle</Text>
            <AppButton label="Set up my vehicle" disabled={busy} onPress={() => close(() => router.push('/vehicle-setup'))} />
          </Card>}
          {!!error && <Text accessibilityRole="alert">{error}</Text>}
          {!context.loading && !context.error && canPropose && <>
            {details && !stale && <AppButton label={busy ? 'Sending…' : 'Send request'} disabled={busy || estimateLoading}
              onPress={() => void mutate('SEND')} />}
            {stale && <Text style={styles.muted}>Refresh the match before sending a request.</Text>}
            <AppButton label={estimateLoading ? 'Checking match…' : 'Refresh match'} variant="secondary" disabled={busy || estimateLoading}
              onPress={() => { setError(''); void refresh(); }} />
          </>}
          {!context.loading && !context.error && actions === 'DECIDE' && <>
            <AppButton label={busy ? 'Saving…' : 'Accept request'} disabled={busy} onPress={() => void mutate('ACCEPTED')} />
            <AppButton label="Decline request" variant="secondary" disabled={busy} onPress={() => void mutate('DECLINED')} />
          </>}
          {!context.loading && !context.error && actions === 'CANCEL' && <AppButton label={busy ? 'Cancelling…' : 'Cancel request'}
            variant="secondary" disabled={busy} onPress={() => void mutate('CANCEL')} />}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23,33,43,0.4)' },
  sheet: { maxHeight: '93%', backgroundColor: colors.background, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, overflow: 'hidden' },
  header: { padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { color: colors.text, fontSize: 18, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  status: { color: colors.accent, fontWeight: '700' },
  map: { height: 240, borderRadius: radii.lg, overflow: 'hidden' },
});
