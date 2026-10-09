import { router } from 'expo-router';

import { useSession } from '../../../auth/SessionProvider';
import { getDemoRiderCandidates } from '../../../map/demoRiderCandidates';
import { encodeRouteNavigationRequest, type RouteNavigationRequest } from '../../../navigation/routeNavigationRequest';
import { driverOfferFixtures } from '../../../rides/rideFixtures';
import { getNextTrip, incomingForCommute } from '../../../rides/rideModel';
import { useRides } from '../../../rides/RidesProvider';
import { useHomeClock } from '../../../rides/useHomeClock';
import { MapScreen } from '../../../screens/MapScreen';

export default function MapRoute() {
  const { commute } = useSession();
  const { outgoing, incoming, skipped } = useRides();
  const { now } = useHomeClock();
  const riders = getDemoRiderCandidates();
  const relevantIncoming = incomingForCommute(commute, incoming, outgoing).map((view) => view.request);
  const nextTrip = getNextTrip(commute, outgoing, relevantIncoming, driverOfferFixtures, now, skipped);
  const currentTrip = nextTrip?.whenLabel === 'Today' ? nextTrip : null;

  const mapStateKey = `${currentTrip?.id ?? 'standalone'}:${currentTrip?.routingPoints?.confirmed ? 'locked' : 'unconfirmed'}`;

  const startNavigation = (request: RouteNavigationRequest) => {
    router.push({ pathname: '/map/navigation', params: { request: encodeRouteNavigationRequest(request) } });
  };

  const startBasicNavigation = (request: RouteNavigationRequest) => {
    router.push({ pathname: '/map/basic-navigation', params: { request: encodeRouteNavigationRequest(request) } });
  };

  return <MapScreen commute={commute} currentTrip={currentTrip} key={mapStateKey} onStartBasicNavigation={startBasicNavigation} onStartNavigation={startNavigation} riders={riders} />;
}
