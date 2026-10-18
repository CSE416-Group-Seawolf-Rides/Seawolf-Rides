import { Text, View } from 'react-native';
import { Card } from '../components/Card';
import { rideTime } from '../mvp/ridePresentation';
import type { RideRequest } from '../mvp/rideRequestModel';
import { colors, spacing } from '../theme';
import { chatContext, type ChatThread } from './chatModel';

export function ChatContextCard({ thread, uid, request, loading, error }: {
  thread: ChatThread; uid: string; request?: RideRequest; loading?: boolean; error?: string;
}) {
  const context = chatContext(thread, uid, request);
  const trip = context.trip;
  const date = new Date(`${trip?.localDate ?? thread.localDate}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
  return <Card style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
    {loading || error ? <Text style={{ color: colors.textMuted }}>{error ?? 'Loading trip context…'}</Text> : <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={{ flex: 1, color: colors.text, fontWeight: '700' }}>{context.title}</Text>
        {!!context.status && <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>{context.status}</Text>}
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{date} · {trip?.campusLabel ?? thread.campusLabel}</Text>
      {trip && <Text style={{ color: colors.textMuted, fontSize: 13 }}>Pickup {rideTime(trip.pickup)} · Arrive {rideTime(trip.vehicleCampusArrival)}</Text>}
    </>}
  </Card>;
}
