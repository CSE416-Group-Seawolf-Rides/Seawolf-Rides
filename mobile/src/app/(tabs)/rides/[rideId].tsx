import { useLocalSearchParams } from 'expo-router';
import { LiveRideDetailScreen } from '../../../mvp/LiveRideScreens';
export default function TripDetailRoute() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  return <LiveRideDetailScreen rideId={rideId} />;
}
