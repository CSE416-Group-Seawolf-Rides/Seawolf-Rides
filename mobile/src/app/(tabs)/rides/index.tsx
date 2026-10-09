import { router } from 'expo-router';

import { useSession } from '../../../auth/SessionProvider';
import { driverOfferFixtures, pastTripFixtures } from '../../../rides/rideFixtures';
import { getCarpools, getUpcoming, incomingForCommute, isTrip } from '../../../rides/rideModel';
import { useRides } from '../../../rides/RidesProvider';
import { useHomeClock } from '../../../rides/useHomeClock';
import { HistorySummary, RidesScreen } from '../../../screens/RidesScreen';

export default function RidesRoute() {
  const { commute } = useSession();
  const { outgoing, incoming, skipped, withdrawRequest } = useRides();
  const { now } = useHomeClock();

  const incomingViews = incomingForCommute(commute, incoming, outgoing);
  const upcoming = getUpcoming(
    commute,
    outgoing,
    incomingViews.map((view) => view.request),
    driverOfferFixtures,
    now,
    skipped,
  );

  // Trip history is not persisted until its M4 implementation.
  const past: typeof pastTripFixtures = [];
  const history: HistorySummary | null =
    past.length > 0
      ? {
          shared: past.filter((trip) => trip.outcome === 'completed').length,
          skipped: past.filter((trip) => trip.outcome === 'skipped').length,
          people: new Set(past.map((trip) => trip.withName)).size,
        }
      : null;

  return (
    <RidesScreen
      carpools={getCarpools(outgoing, incomingViews, driverOfferFixtures)}
      hasCommute={commute !== null}
      history={history}
      nextWeek={upcoming.filter((item) => !item.thisWeek)}
      onFindDriver={(item) => router.navigate(`/home/day/${item.day}`, { withAnchor: true })}
      onFindDrivers={() => router.navigate('/home')}
      onOpenCarpool={(carpool) => {
        if (carpool.kind === 'driver') {
          // Driver profiles live under Home; keep Home underneath so Back makes sense.
          router.navigate(`/home/driver/${carpool.offer.id}`, { withAnchor: true });
          return;
        }
        // Riders have no profile screen yet, so open the next drive they're on.
        const drive = upcoming
          .filter(isTrip)
          .find((trip) => trip.riders?.some((rider) => rider.id === carpool.rider.id));
        if (drive) {
          router.push(`/rides/${drive.id}`);
        }
      }}
      onOpenHistory={() => router.push('/rides/history')}
      onOpenTrip={(tripId) => router.push(`/rides/${tripId}`)}
      onReviewRequests={() => router.navigate('/home/requests', { withAnchor: true })}
      onSetUpCommute={() => router.push('/commute-setup')}
      onWithdraw={(requestIds) => requestIds.forEach(withdrawRequest)}
      thisWeek={upcoming.filter((item) => item.thisWeek)}
      waitingOnYou={incomingViews.filter((view) => view.request.status === 'pending').length}
    />
  );
}
