import { router } from 'expo-router';

import { useSession } from '../../../auth/SessionProvider';
import { pastTripFixtures } from '../../../rides/rideFixtures';
import { formatTripDate } from '../../../rides/rideModel';
import { useHomeClock } from '../../../rides/useHomeClock';
import { PastTripView, RideHistoryScreen } from '../../../screens/RideHistoryScreen';

export default function RideHistoryRoute() {
  const { user } = useSession();
  const { now } = useHomeClock();
  // Only the demo (returning) account has history; new accounts start with none.
  const history = user !== null && !user.isNewUser ? pastTripFixtures : [];
  const trips: PastTripView[] = history.map((trip) => {
    const date = new Date(now);
    date.setDate(now.getDate() - trip.daysAgo);
    return { ...trip, dateLabel: formatTripDate(date) };
  });

  return <RideHistoryScreen onBack={() => router.back()} trips={trips} />;
}
