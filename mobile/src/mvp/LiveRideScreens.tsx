import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSession } from '../auth/SessionProvider';
import { AppButton } from '../components/AppButton';
import { PublicProfileLink } from '../profiles/PublicProfileLink';
import { Screen } from '../components/Screen';
import { useHomeClock } from '../rides/useHomeClock';
import { colors, radii, spacing } from '../theme';
import { useRideRequests } from './rideRequestClient';
import type { RideRequest } from './rideRequestModel';
import {
  currentCarpools,
  partnerId,
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
import { RidePriceChange } from '../payments/components/RidePriceChange';
import { RideAmendmentCard } from '../rides/components/RideAmendmentCard';
import { CancelRideButton } from './components/CancelRideButton';

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
    <Screen title="History" onBack={() => router.canGoBack() ? router.back() : router.replace('/rides')}>
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
      onBack={() => router.canGoBack() ? router.back() : router.replace('/rides')}
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
              <CancelRideButton ride={ride} uid={uid} now={now} />
            </Card>
          ))}
      </>}

    </Screen>
  );
}
function TripItinerary({ ride, uid, otherRides = [] }: { ride: RideRequest; uid: string; otherRides?: RideRequest[] }) {
  return <View style={{ gap: spacing.sm }}>
    <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{rideDate(ride.localDate)}</Text>
    <Text style={{ color: ride.status === 'ACCEPTED' ? colors.success : colors.accent }}>
      {ride.status === 'ACCEPTED' ? 'Confirmed' : ride.status === 'PENDING' ? 'Pending' : ride.status === 'CANCELLED' ? 'Cancelled' : 'Declined'} · {uid === ride.driverId ? `Driving ${ride.riderName}` : `Riding with ${ride.driverName}`}
    </Text>
    <PublicProfileLink participantId={partnerId(ride, uid)} name={partnerName(ride, uid)} />
    {otherRides.length > 0 && (
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textMuted }}>Other passengers on this carpool:</Text>
        {otherRides.map((other) => (
          <PublicProfileLink key={other.id} participantId={other.riderId} name={other.riderName} />
        ))}
      </View>
    )}
    {(() => {
      const isReturn = ride.direction === 'FROM_CAMPUS';
      return (
        <>
          <Text>Departure · {rideTime(ride.plan.departure)}{isReturn ? ` · ${ride.campusLabel}` : ''}</Text>
          <Text>Pickup · {rideTime(ride.plan.pickup)} · {ride.pickupLabel}</Text>
          <Text>{isReturn ? 'Drop-off' : 'Arrival'} · {rideTime(ride.plan.riderDestinationArrival)} · {isReturn ? (ride.dropoffLabel ?? (uid === ride.driverId ? `${ride.riderName}’s area` : 'Home')) : ride.campusLabel}</Text>
        </>
      );
    })()}
    <Text style={{ color: colors.textMuted }}>New York time · Adds {Math.ceil(ride.metrics.driverExtraDurationSeconds / 60)} min driving</Text>
    <RidePriceChange ride={ride} uid={uid} />
    <RideAmendmentCard ride={ride} uid={uid} />
  </View>;
}
export function LiveRideDetailScreen({ rideId }: { rideId: string }) {
  const { requests, uid, now } = useLiveRides();
  const decision = useRideDecision();
  const ride = requests.items.find((r) => r.id === rideId);
  return (
    <Screen title="Trip details" onBack={() => router.canGoBack() ? router.back() : router.replace('/rides')} afterContent={decision.sheet}>
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
            <TripItinerary
              ride={ride}
              uid={uid}
              otherRides={requests.items.filter(
                (r) =>
                  r.id !== ride.id &&
                  r.status === 'ACCEPTED' &&
                  r.localDate === ride.localDate &&
                  r.driverId === ride.driverId,
              )}
            />
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
          <CancelRideButton ride={ride} uid={uid} now={now} />
        </>
      )}
    </Screen>
  );
}
export function LiveRequestReviewScreen() {
  const { requests, uid, now } = useLiveRides();
  const decision = useRideDecision();
  const [deferred, setDeferred] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<any>(null);
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(280, width - spacing.xl * 2);

  const waiting = requests.items
    .filter((r) => requestNeedsAnswer(r, uid, now))
    .sort((a, b) => a.plan.departure - b.plan.departure || a.id.localeCompare(b.id));
  const queue = [
    ...waiting.filter((r) => !deferred.includes(r.id)),
    ...deferred.flatMap((id) => waiting.filter((r) => r.id === id)),
  ];

  const safeIndex = Math.min(activeIndex, Math.max(0, queue.length - 1));
  const current = queue[safeIndex];

  const switchIndex = (next: number) => {
    const clamped = Math.max(0, Math.min(next, queue.length - 1));
    setActiveIndex(clamped);
    scrollRef.current?.scrollTo({ x: clamped * (cardWidth + spacing.md), animated: true });
  };

  return (
    <Screen
      title="Ride requests"
      onBack={() => router.canGoBack() ? router.back() : router.replace('/rides')}
      eyebrow={current ? (queue.length > 1 ? `${queue.length} WAITING FOR YOUR ANSWER · (${safeIndex + 1}/${queue.length})` : `${queue.length} WAITING FOR YOUR ANSWER`) : undefined}
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
        <View style={{ gap: spacing.md }}>
          {queue.length > 1 && (
            <View style={reviewStyles.pagerHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous request"
                disabled={safeIndex === 0}
                onPress={() => switchIndex(safeIndex - 1)}
                hitSlop={8}
                style={[reviewStyles.navBtn, safeIndex === 0 && reviewStyles.navBtnDisabled]}
              >
                <Ionicons name="chevron-back" size={18} color={safeIndex === 0 ? colors.textMuted : colors.accent} />
                <Text style={[reviewStyles.navBtnText, safeIndex === 0 && reviewStyles.navBtnTextDisabled]}>Prev</Text>
              </Pressable>

              <View style={reviewStyles.pagerInfo}>
                <Text style={reviewStyles.pagerCounter}>
                  Request {safeIndex + 1} of {queue.length}
                </Text>
                <View style={reviewStyles.dotsRow}>
                  {queue.map((item, idx) => (
                    <View
                      key={item.id}
                      style={[
                        reviewStyles.dot,
                        idx === safeIndex ? reviewStyles.dotActive : reviewStyles.dotInactive,
                      ]}
                    />
                  ))}
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next request"
                disabled={safeIndex === queue.length - 1}
                onPress={() => switchIndex(safeIndex + 1)}
                hitSlop={8}
                style={[reviewStyles.navBtn, safeIndex === queue.length - 1 && reviewStyles.navBtnDisabled]}
              >
                <Text style={[reviewStyles.navBtnText, safeIndex === queue.length - 1 && reviewStyles.navBtnTextDisabled]}>Next</Text>
                <Ionicons name="chevron-forward" size={18} color={safeIndex === queue.length - 1 ? colors.textMuted : colors.accent} />
              </Pressable>
            </View>
          )}

          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardWidth + spacing.md}
            decelerationRate="fast"
            onMomentumScrollEnd={(e) => {
              const offset = e.nativeEvent.contentOffset.x;
              const nextIdx = Math.round(offset / (cardWidth + spacing.md));
              if (nextIdx >= 0 && nextIdx < queue.length) {
                setActiveIndex(nextIdx);
              }
            }}
            contentContainerStyle={{ gap: spacing.md }}
          >
            {queue.map((ride) => (
              <View key={ride.id} style={{ width: cardWidth }}>
                <LiveRequestCard ride={ride} uid={uid} now={now} />
              </View>
            ))}
          </ScrollView>

          <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
            <AppButton
              label={decision.busy ? 'Saving…' : (queue.length > 1 ? `Accept request (${current.riderName})` : 'Accept request')}
              disabled={!!decision.busy}
              onPress={() => void decision.decide(current, 'ACCEPTED')}
            />
            <AppButton
              label={queue.length > 1 ? `Decline request (${current.riderName})` : 'Decline request'}
              variant="secondary"
              disabled={!!decision.busy}
              onPress={() => void decision.decide(current, 'DECLINED')}
            />
            {queue.length > 1 && (
              <AppButton
                label="Decide later"
                variant="secondary"
                disabled={!!decision.busy}
                onPress={() => {
                  setDeferred((ids) => [...ids.filter((id) => id !== current.id), current.id]);
                  setActiveIndex(0);
                  scrollRef.current?.scrollTo({ x: 0, animated: false });
                }}
              />
            )}
          </View>
        </View>
      )}
    </Screen>
  );
}

const reviewStyles = StyleSheet.create({
  pagerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderColor: colors.border,
    borderWidth: 1,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 2,
  },
  navBtnDisabled: {
    opacity: 0.35,
  },
  navBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  navBtnTextDisabled: {
    color: colors.textMuted,
  },
  pagerInfo: {
    alignItems: 'center',
    gap: 4,
  },
  pagerCounter: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: colors.accent,
    width: 14,
  },
  dotInactive: {
    backgroundColor: colors.border,
  },
});
