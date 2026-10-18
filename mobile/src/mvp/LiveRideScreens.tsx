import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { AppButton } from '../components/AppButton';
import { Screen } from '../components/Screen';
import { useHomeClock } from '../rides/useHomeClock';
import { colors, spacing } from '../theme';
import { useRideRequests } from './rideRequestClient';
import type { RideRequest } from './rideRequestModel';
import {
  currentCarpools,
  partnerName,
  requestNeedsAnswer,
  rideEnd,
  rideHistory,
  rideDate,
  rideTime,
} from './ridePresentation';
import { LiveRequestCard } from './components/LiveRequestCard';
import { AcceptedTripMap } from '../calendar/AcceptedTripMap';
import { Card } from '../components/Card';
import { useRideDecision } from './useRideDecision';

function useLiveRides() {
  const { user } = useSession();
  const requests = useRideRequests(user?.id);
  const { now } = useHomeClock(
    requests.items.map((r) => (r.status === 'ACCEPTED' ? rideEnd(r) : r.plan.departure)),
  );
  return { requests, uid: user?.id ?? '', now: now.getTime() / 1000 };
}
export function LiveRideHistoryScreen() {
  const { requests, uid, now } = useLiveRides();
  const history = rideHistory(requests.items, uid, now);
  return (
    <Screen title="History" onBack={() => router.back()}>
      {requests.error && <Text accessibilityRole="alert">{requests.error}</Text>}
      {!requests.loaded && <Text>Loading history…</Text>}
      {requests.loaded && !requests.error && !history.length && (
        <Text style={{ color: colors.textMuted }}>
          Your past rides and closed requests will appear here.
        </Text>
      )}
      {history.map((ride) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View past trip with ${partnerName(ride, uid)}`}
          key={ride.id}
          onPress={() => router.push(`/rides/${ride.id}`)}
        >
          <LiveRequestCard ride={ride} uid={uid} now={now} />
        </Pressable>
      ))}
    </Screen>
  );
}
export function LiveCarpoolScreen({ participantId }: { participantId: string }) {
  const { requests, uid, now } = useLiveRides();
  const decision = useRideDecision();
  const pool = currentCarpools(requests.items, uid, now).find((c) => c.id === participantId);
  return (
    <Screen
      title={pool?.name ?? 'Carpool'}
      onBack={() => router.back()}
      afterContent={decision.sheet}
    >
      {decision.error && <Text accessibilityRole="alert">{decision.error}</Text>}
      {requests.error && <Text accessibilityRole="alert">{requests.error}</Text>}
      {!requests.loaded && <Text>Loading your carpool…</Text>}
      {requests.loaded && !requests.error && !pool && (
        <>
          <Text>No upcoming trips remain with this person.</Text>
          <AppButton
            label="View history"
            variant="secondary"
            onPress={() => router.push('/rides/history')}
          />
        </>
      )}
      {pool && <>
        <Text style={{ color: colors.textMuted }}>
          {pool.accepted.length} confirmed · {pool.pending.length} pending trips together
        </Text>
        {[...pool.accepted, ...pool.pending]
          .sort((a, b) => a.plan.departure - b.plan.departure)
          .map((ride) => (
            <Card key={ride.id} style={{ gap: spacing.lg }}>
              {ride.status === 'ACCEPTED' && <TripItinerary ride={ride} uid={uid} />}
              {ride.status === 'ACCEPTED'
                ? <AcceptedTripMap key={ride.id} ride={ride} />
                : <LiveRequestCard ride={ride} uid={uid} now={now}
                    onCancel={(item) => void decision.cancel(item)} busyId={decision.busy} />}
              <AppButton label="View trip details" variant="secondary"
                onPress={() => router.push(`/rides/${ride.id}`)} />
            </Card>
          ))}
      </>}

    </Screen>
  );
}
function TripItinerary({ ride, uid }: { ride: RideRequest; uid: string }) {
  return <View style={{ gap: spacing.sm }}>
    <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{rideDate(ride.localDate)}</Text>
    <Text style={{ color: ride.status === 'ACCEPTED' ? colors.success : colors.accent }}>
      {ride.status === 'ACCEPTED' ? 'Confirmed' : ride.status === 'PENDING' ? 'Pending' : ride.status === 'CANCELLED' ? 'Cancelled' : 'Declined'} · {uid === ride.driverId ? `Driving ${ride.riderName}` : `Riding with ${ride.driverName}`}
    </Text>
    <Text>Departure · {rideTime(ride.plan.departure)}</Text>
    <Text>Pickup · {rideTime(ride.plan.pickup)} · {ride.pickupLabel}</Text>
    <Text>Arrival · {rideTime(ride.plan.riderDestinationArrival)} · {ride.campusLabel}</Text>
    <Text style={{ color: colors.textMuted }}>New York time · Adds {Math.ceil(ride.metrics.driverExtraDurationSeconds / 60)} min driving</Text>
  </View>;
}
export function LiveRideDetailScreen({ rideId }: { rideId: string }) {
  const { requests, uid, now } = useLiveRides();
  const decision = useRideDecision();
  const ride = requests.items.find((r) => r.id === rideId);
  return (
    <Screen title="Trip details" onBack={() => router.back()} afterContent={decision.sheet}>
      {(requests.error || decision.error) && (
        <Text accessibilityRole="alert">{requests.error || decision.error}</Text>
      )}
      {!requests.loaded && <Text>Loading trip…</Text>}
      {requests.loaded && !requests.error && !ride && (
        <Text>This trip is no longer available to your account.</Text>
      )}
      {ride && (
        <>
          {ride.status === 'ACCEPTED' ? <>
            <TripItinerary ride={ride} uid={uid} />
            <AcceptedTripMap key={ride.id} ride={ride} routePreview />
          </> : <LiveRequestCard ride={ride} uid={uid} now={now}
            onCancel={(item) => void decision.cancel(item)} busyId={decision.busy} />}
          {requestNeedsAnswer(ride, uid, now) && (
            <>
              <AppButton
                label={decision.busy ? 'Saving…' : 'Accept request'}
                disabled={!!decision.busy}
                onPress={() => void decision.decide(ride, 'ACCEPTED')}
              />
              <AppButton
                label="Decline request"
                variant="secondary"
                disabled={!!decision.busy}
                onPress={() => void decision.decide(ride, 'DECLINED')}
              />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
export function LiveRequestReviewScreen() {
  const { requests, uid, now } = useLiveRides();
  const decision = useRideDecision();
  const [deferred, setDeferred] = useState<string[]>([]);
  const waiting = requests.items
    .filter((r) => requestNeedsAnswer(r, uid, now))
    .sort((a, b) => a.plan.departure - b.plan.departure || a.id.localeCompare(b.id));
  const queue = [
    ...waiting.filter((r) => !deferred.includes(r.id)),
    ...deferred.flatMap((id) => waiting.filter((r) => r.id === id)),
  ];
  const current = queue[0];
  return (
    <Screen
      title="Ride requests"
      onBack={() => router.back()}
      eyebrow={current ? `${queue.length} WAITING FOR YOUR ANSWER` : undefined}
      afterContent={decision.sheet}
    >
      {(requests.error || decision.error) && (
        <Text accessibilityRole="alert">{requests.error || decision.error}</Text>
      )}
      {!requests.loaded && <Text>Loading requests…</Text>}
      {requests.loaded && !requests.error && !current && (
        <>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>
            You’re all caught up
          </Text>
          <Text style={{ color: colors.textMuted }}>
            New requests will appear on Home and Rides.
          </Text>
          <AppButton label="Back to Rides" onPress={() => router.navigate('/rides')} />
        </>
      )}
      {current && (
        <View style={{ gap: spacing.lg }}>
          <LiveRequestCard ride={current} uid={uid} now={now} />
          <AppButton
            label={decision.busy ? 'Saving…' : 'Accept request'}
            disabled={!!decision.busy}
            onPress={() => void decision.decide(current, 'ACCEPTED')}
          />
          <AppButton
            label="Decline request"
            variant="secondary"
            disabled={!!decision.busy}
            onPress={() => void decision.decide(current, 'DECLINED')}
          />
          {queue.length > 1 && (
            <AppButton
              label="Decide later"
              variant="secondary"
              disabled={!!decision.busy}
              onPress={() =>
                setDeferred((ids) => [...ids.filter((id) => id !== current.id), current.id])
              }
            />
          )}
        </View>
      )}
    </Screen>
  );
}
