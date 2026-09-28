import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { useSession } from '../../../auth/SessionProvider';
import { driverOfferFixtures } from '../../../rides/rideFixtures';
import {
  getUpcoming,
  incomingForCommute,
  isTrip,
  requestSummary,
} from '../../../rides/rideModel';
import { useRides } from '../../../rides/RidesProvider';
import { useHomeClock } from '../../../rides/useHomeClock';
import { TripDetailScreen } from '../../../screens/TripDetailScreen';

// A trip's id is its local date, e.g. /rides/2026-09-28.
export default function TripDetailRoute() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { commute } = useSession();
  const { outgoing, incoming, skipped, skipTrip, undoSkip, cancelRequest } = useRides();
  const { now } = useHomeClock();

  const trip = getUpcoming(
    commute,
    outgoing,
    incomingForCommute(commute, incoming, outgoing).map((view) => view.request),
    driverOfferFixtures,
    now,
    skipped,
  )
    .filter(isTrip)
    .find((candidate) => candidate.id === rideId);

  if (!trip) {
    return <Redirect href="/rides" />;
  }

  const offer = trip.offer;
  const chatId = offer?.chatId;

  return (
    <TripDetailScreen
      bookedDays={(offer && requestSummary(outgoing, offer.id)?.acceptedDays) || []}
      onBack={() => router.back()}
      onMessage={chatId ? () => router.navigate(`/inbox/${chatId}`, { withAnchor: true }) : undefined}
      onOpenDriver={() => offer && router.navigate(`/home/driver/${offer.id}`, { withAnchor: true })}
      onSkip={() => skipTrip(trip.id)}
      onStopRiding={() => {
        if (offer) {
          router.back();
          cancelRequest(offer.id);
        }
      }}
      onUndoSkip={() => undoSkip(trip.id)}
      trip={trip}
    />
  );
}
