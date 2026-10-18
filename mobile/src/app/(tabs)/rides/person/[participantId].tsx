import { useLocalSearchParams } from 'expo-router';
import { LiveCarpoolScreen } from '../../../../mvp/LiveRideScreens';
export default function CarpoolRoute() {
  const { participantId } = useLocalSearchParams<{ participantId: string }>();
  return <LiveCarpoolScreen participantId={participantId} />;
}
