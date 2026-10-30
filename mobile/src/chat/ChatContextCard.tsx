import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { rideTime } from '../mvp/ridePresentation';
import type { RideRequest } from '../mvp/rideRequestModel';
import { colors, spacing } from '../theme';
import { chatContext, type ChatThread } from './chatModel';

export function ChatContextCard({ thread, uid, request, loading, error, onViewTrip }: {
  thread: ChatThread; uid: string; request?: RideRequest; loading?: boolean; error?: string; onViewTrip?: () => void;
}) {
  const context = chatContext(thread, uid, request);
  return <ChatRequestCard title={context.title} status={context.status} trip={context.trip}
    localDate={thread.localDate} campusLabel={thread.campusLabel} loading={loading} error={error}
    onViewTrip={onViewTrip} viewLabel={thread.requestId ? 'View request' : 'View match'} />;
}

/** The same request card is used for the original context and every saved request. */
export function ChatRequestCard({ title, status, trip, localDate, campusLabel, loading, error, onViewTrip, viewLabel = 'View request', children }: {
  title: string; status: string; trip?: ChatThread['trip']; localDate: string; campusLabel: string;
  loading?: boolean; error?: string; onViewTrip?: () => void; viewLabel?: string; children?: ReactNode;
}) {
  const date = new Date(`${trip?.localDate ?? localDate}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
  return <Card style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
    {loading || error ? <Text style={{ color: colors.textMuted }}>{error ?? 'Loading trip context…'}</Text> : <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={{ flex: 1, color: colors.text, fontWeight: '700' }}>{title}</Text>
        {!!status && <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>{status}</Text>}
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{date} · {trip?.campusLabel ?? campusLabel}</Text>
      {trip && <Text style={{ color: colors.textMuted, fontSize: 13 }}>Pickup {rideTime(trip.pickup)} · Arrive {rideTime(trip.vehicleCampusArrival)}</Text>}
      {children}
      {onViewTrip && <AppButton label={viewLabel} variant="secondary" onPress={onViewTrip} />}
    </>}
  </Card>;
}
