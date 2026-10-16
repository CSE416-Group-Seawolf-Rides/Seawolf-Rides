import { router, useLocalSearchParams } from 'expo-router';

import { useSession } from '../../../auth/SessionProvider';
import { getDemoRiderCandidates } from '../../../map/demoRiderCandidates';
import { encodeRouteNavigationRequest, type RouteNavigationRequest } from '../../../navigation/routeNavigationRequest';
import { driverOfferFixtures } from '../../../rides/rideFixtures';
import { getNextTrip, getUpcoming, incomingForCommute, isTrip } from '../../../rides/rideModel';
import { useRides } from '../../../rides/RidesProvider';
import { useHomeClock } from '../../../rides/useHomeClock';
import { resolveTripPickupSelection } from '../../../routing/tripPickupRoute';
import { MapScreen } from '../../../screens/MapScreen';

export default function MapRoute() {
  const { tripId, date, direction } = useLocalSearchParams<{ tripId?: string; date?: string; direction?: string }>();
  const { commute } = useSession();
  const { outgoing, incoming, skipped, driverOccurrences, fridayDriverTest, loadFridayDriverTest, resetFridayDriverTest } = useRides();
  const { now } = useHomeClock();
  const riders = getDemoRiderCandidates();
  const relevantIncoming = incomingForCommute(commute, incoming, outgoing, driverOccurrences).map((view) => view.request);
  const nextTrip = getNextTrip(commute, outgoing, relevantIncoming, driverOfferFixtures, now, skipped, driverOccurrences);
  const selectedTrip = resolveTripPickupSelection(
    getUpcoming(commute, outgoing, relevantIncoming, driverOfferFixtures, now, skipped, 14, driverOccurrences).filter(isTrip),
    { tripId, date, direction },
  );
  const currentTrip = selectedTrip ?? (nextTrip?.whenLabel === 'Today' ? nextTrip : null);

  const riderStateKey = currentTrip?.riders?.map((rider) => `${rider.id}:${rider.status}:${rider.confirmedPickup?.coordinate.latitude ?? 'missing'}:${rider.confirmedPickup?.coordinate.longitude ?? 'missing'}:${rider.pickupWindow?.earliest ?? 'missing'}:${rider.pickupWindow?.latest ?? 'missing'}:${rider.pickupServiceSeconds ?? 'missing'}`).sort().join('|') ?? '';
  const routingPointKey = JSON.stringify(currentTrip?.routingPoints ?? null);
  const mapStateKey = `${selectedTrip ? 'pickup' : 'normal'}:${currentTrip?.id ?? 'standalone'}:${currentTrip?.campusLot ?? 'none'}:${currentTrip?.proposal?.revision ?? 'legacy'}:${routingPointKey}:${riderStateKey}`;

  const startNavigation = (request: RouteNavigationRequest) => {
    router.push({ pathname: '/map/navigation', params: { request: encodeRouteNavigationRequest(request) } });
  };

  const startBasicNavigation = (request: RouteNavigationRequest) => {
    router.push({ pathname: '/map/basic-navigation', params: { request: encodeRouteNavigationRequest(request) } });
  };

  return <MapScreen commute={commute} currentTrip={currentTrip} fridayDriverTest={__DEV__ ? fridayDriverTest : undefined} key={mapStateKey} onClearPickupRoute={selectedTrip ? () => router.replace('/map') : undefined} onLoadFridayDriverTest={__DEV__ ? loadFridayDriverTest : undefined} onOpenCarpoolMatchingDemo={__DEV__ ? () => router.push('/map/find-riders-demo') : undefined} onOpenDriverTest={__DEV__ ? () => router.push('/map/driver-test') : undefined} onOpenMatchingDiagnostics={__DEV__ ? () => router.push('/home/matching-demo') : undefined} onOpenProfile={(participantId, name) => router.push({ pathname: '/profile/[participantId]', params: { participantId, name } })} onOpenRoutePlanner={__DEV__ ? () => router.push('/home/route-planner') : undefined} onResetFridayDriverTest={__DEV__ ? resetFridayDriverTest : undefined} onStartBasicNavigation={startBasicNavigation} onStartNavigation={startNavigation} pickupRouteTrip={selectedTrip} riders={riders} />;
}
