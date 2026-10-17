import { router } from 'expo-router';

import { PastTripView, RideHistoryScreen } from '../../../screens/RideHistoryScreen';

export default function RideHistoryRoute() {
  // Trip history is not persisted until its M4 implementation.
  const trips: PastTripView[] = [];

  return <RideHistoryScreen onBack={() => router.back()} trips={trips} />;
}
