import { useSession } from '../../../auth/SessionProvider';
import { useHomeClock } from '../../../rides/useHomeClock';
import { MapScreen } from '../../../screens/MapScreen';

export default function MapRoute() {
  const { commute } = useSession();
  const { today } = useHomeClock();

  return <MapScreen commute={commute} today={today} />;
}
