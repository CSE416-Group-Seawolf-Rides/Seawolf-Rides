import { useSession } from '../../../auth/SessionProvider';
import { getDemoRiderCandidates } from '../../../map/demoRiderCandidates';
import { useHomeClock } from '../../../rides/useHomeClock';
import { MapScreen } from '../../../screens/MapScreen';

export default function MapRoute() {
  const { commute } = useSession();
  const { today } = useHomeClock();
  const riders = getDemoRiderCandidates();

  return <MapScreen commute={commute} riders={riders} today={today} />;
}
