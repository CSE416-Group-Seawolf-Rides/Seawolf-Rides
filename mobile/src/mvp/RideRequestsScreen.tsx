import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { decideRideRequest, useRideRequests } from './rideRequestClient';
import type { RideRequest } from './rideRequestModel';

const time = (epoch: number) =>
  new Date(epoch * 1000).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
  });
export function RideRequestsScreen() {
  const { user } = useSession();
  const requests = useRideRequests(user?.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decide = async (item: RideRequest, decision: 'ACCEPTED' | 'DECLINED') => {
    setBusy(item.id);
    setError(null);
    try {
      await decideRideRequest(item.id, decision);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your decision. Retry.');
    } finally {
      setBusy(null);
    }
  };
  const cards = (items: RideRequest[]) =>
    items.map((item) => (
      <Card key={item.id}>
        <Text accessibilityRole="header">
          {item.localDate} · To campus · {item.status}
        </Text>
        <Text>
          Driver: {item.driverName} · Rider: {item.riderName} · {item.seats} passenger seat(s)
        </Text>
        <Text>
          {item.pickupLabel} → {item.campusLabel}
        </Text>
        <Text>
          {item.status === 'ACCEPTED' ? 'Accepted timing' : 'Evaluated timing'}: pickup{' '}
          {time(item.plan.pickup)} · campus {time(item.plan.riderDestinationArrival)} (New York)
        </Text>
        {item.status === 'PENDING' && (
          <Text>
            Pending driver decision. No seats are reserved yet; acceptance rechecks availability.
          </Text>
        )}
        {item.status === 'DECLINED' && (
          <Text>The driver declined this request. No ride or seat reservation was created.</Text>
        )}
        {item.status === 'ACCEPTED' && (
          <Text>
            This dated ride is accepted for both accounts. Later preference edits do not reschedule
            it. Cancellation, messaging and navigation are not available in this demo.
          </Text>
        )}
        {item.status === 'PENDING' && item.driverId === user?.id && (
          <>
            <AppButton
              label={busy === item.id ? 'Saving decision…' : 'Accept request'}
              disabled={busy !== null}
              onPress={() => void decide(item, 'ACCEPTED')}
            />
            <AppButton
              label="Decline request"
              variant="secondary"
              disabled={busy !== null}
              onPress={() => void decide(item, 'DECLINED')}
            />
          </>
        )}
      </Card>
    ));
  return (
    <Screen title="Rides" subtitle="Shared dated requests · local M3 demonstration">
      {!requests.loaded && <Text>Loading your rides and requests…</Text>}
      {(requests.error || error) && (
        <Text accessibilityLiveRegion="polite">{requests.error || error}</Text>
      )}
      {requests.error && <AppButton label="Reload requests" onPress={requests.retry} />}
      {requests.truncated && <Text>This list shows only 100 requests. More records exist.</Text>}
      <Text accessibilityRole="header">Accepted rides</Text>
      {cards(requests.items.filter((r) => r.status === 'ACCEPTED'))}
      {requests.loaded && !requests.items.some((r) => r.status === 'ACCEPTED') && (
        <Text>No accepted rides yet.</Text>
      )}
      <Text accessibilityRole="header">Requests</Text>
      {cards(requests.items.filter((r) => r.status !== 'ACCEPTED'))}
      {requests.loaded && !requests.items.some((r) => r.status !== 'ACCEPTED') && (
        <Text>No pending or declined requests.</Text>
      )}
      <AppButton
        label="Find a compatible driver"
        variant="secondary"
        onPress={() => router.navigate('/home')}
      />
    </Screen>
  );
}
