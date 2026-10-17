import { DevelopmentOnly } from '../../../mvp/DevelopmentOnly';
import { router, useLocalSearchParams } from 'expo-router';

import { useSession } from '../../../auth/SessionProvider';
import { buildDatedDriverMapPresentation, selectDatedDriverMapOccurrence } from '../../../map/datedDriverMapModel';
import { encodeRouteNavigationRequest, type RouteNavigationRequest } from '../../../navigation/routeNavigationRequest';
import { driverOfferFixtures } from '../../../rides/rideFixtures';
import { getNextTrip, getUpcoming, incomingForCommute, isTrip } from '../../../rides/rideModel';
import { useRides } from '../../../rides/RidesProvider';
import { useHomeClock } from '../../../rides/useHomeClock';
import { applyAcceptedGroupPlanToTrip, resolveTripPickupSelection } from '../../../routing/tripPickupRoute';
import { FRIDAY_DRIVER_TEST_OCCURRENCE_ID } from '../../../rides/fridayDriverTest';
import { MapScreen } from '../../../screens/MapScreen';

function MapRoute() {
  const { tripId, date, direction } = useLocalSearchParams<{ tripId?: string; date?: string; direction?: string }>();
  const { commute } = useSession();
  const { outgoing, incoming, skipped, driverOccurrences, fridayAcceptedPlan, fridayDriverTest, loadFridayDriverTest, resetFridayDriverTest } = useRides();
  const { now } = useHomeClock();
  const relevantIncoming = incomingForCommute(commute, incoming, outgoing, driverOccurrences).map((view) => view.request);
  const upcomingTrips = getUpcoming(commute, outgoing, relevantIncoming, driverOfferFixtures, now, skipped, 14, driverOccurrences).filter(isTrip);
  const nextTrip = getNextTrip(commute, outgoing, relevantIncoming, driverOfferFixtures, now, skipped, driverOccurrences);
  const selectedTrip = resolveTripPickupSelection(
    upcomingTrips,
    { tripId, date, direction },
  );
  const selectedDriverId = selectedTrip?.proposal?.participants.driverId
    ?? selectedTrip?.riders?.find((rider) => rider.proposal)?.proposal?.participants.driverId;
  const activeOccurrence = selectDatedDriverMapOccurrence({
    occurrences: driverOccurrences,
    selection: { tripId, date, direction },
    selectedDriverId,
    fallbackOccurrenceId: fridayDriverTest.status === 'LOADED' ? FRIDAY_DRIVER_TEST_OCCURRENCE_ID : undefined,
  });
  const occurrenceTrip = activeOccurrence
    ? upcomingTrips.find((trip) => trip.kind === 'drive' && trip.id === activeOccurrence.localDate) ?? null
    : null;
  const pickupRouteTrip = applyAcceptedGroupPlanToTrip(selectedTrip ?? occurrenceTrip, fridayAcceptedPlan);
  const currentTrip = pickupRouteTrip ?? (nextTrip?.whenLabel === 'Today' ? nextTrip : null);
  const mapPresentation = buildDatedDriverMapPresentation({ occurrence: activeOccurrence, requests: incoming });

  const riderStateKey = currentTrip?.riders?.map((rider) => `${rider.id}:${rider.status}:${rider.confirmedPickup?.coordinate.latitude ?? 'missing'}:${rider.confirmedPickup?.coordinate.longitude ?? 'missing'}:${rider.pickupWindow?.earliest ?? 'missing'}:${rider.pickupWindow?.latest ?? 'missing'}:${rider.pickupServiceSeconds ?? 'missing'}`).sort().join('|') ?? '';
  const routingPointKey = JSON.stringify(currentTrip?.routingPoints ?? null);
  const pendingStateKey = mapPresentation.pendingRiders.map((rider) => `${rider.id}:${rider.approximateArea.center.latitude}:${rider.approximateArea.center.longitude}`).sort().join('|');
  const mapDataRevision = `${pickupRouteTrip ? 'pickup' : 'normal'}:${activeOccurrence?.id ?? 'no-occurrence'}:${currentTrip?.id ?? 'standalone'}:${currentTrip?.campusLot ?? 'none'}:${currentTrip?.proposal?.revision ?? 'legacy'}:${routingPointKey}:${riderStateKey}:${pendingStateKey}`;

  const startNavigation = (request: RouteNavigationRequest) => {
    router.push({ pathname: '/map/navigation', params: { request: encodeRouteNavigationRequest(request) } });
  };

  const startBasicNavigation = (request: RouteNavigationRequest) => {
    router.push({ pathname: '/map/basic-navigation', params: { request: encodeRouteNavigationRequest(request) } });
  };

  return <MapScreen commute={commute} currentTrip={currentTrip} fridayDriverTest={__DEV__ ? fridayDriverTest : undefined} mapDataRevision={mapDataRevision} onClearPickupRoute={selectedTrip ? () => router.replace('/map') : undefined} onLoadFridayDriverTest={__DEV__ ? loadFridayDriverTest : undefined} onOpenCarpoolMatchingDemo={__DEV__ ? () => router.push('/map/find-riders-demo') : undefined} onOpenDriverTest={__DEV__ ? () => router.push('/map/driver-test') : undefined} onOpenMatchingDiagnostics={__DEV__ ? () => router.push('/home/matching-demo') : undefined} onOpenProfile={(participantId, name) => router.push({ pathname: '/profile/[participantId]', params: { participantId, name } })} onOpenRoutePlanner={__DEV__ ? () => router.push('/home/route-planner') : undefined} onResetFridayDriverTest={__DEV__ ? resetFridayDriverTest : undefined} onStartBasicNavigation={startBasicNavigation} onStartNavigation={startNavigation} pendingRiders={mapPresentation.pendingRiders} pickupRouteTrip={pickupRouteTrip} />;
}

export default function DevelopmentRoute() { return <DevelopmentOnly><MapRoute /></DevelopmentOnly>; }
