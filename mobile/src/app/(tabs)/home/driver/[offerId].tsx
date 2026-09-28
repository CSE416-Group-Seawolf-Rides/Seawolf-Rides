import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { useSession } from '../../../../auth/SessionProvider';
import { driverOfferFixtures } from '../../../../rides/rideFixtures';
import { matchDrivers, requestableDays, requestSummary } from '../../../../rides/rideModel';
import { useRides } from '../../../../rides/RidesProvider';
import { OfferDetailScreen } from '../../../../screens/OfferDetailScreen';

export default function DriverOfferRoute() {
  const { offerId } = useLocalSearchParams<{ offerId: string }>();
  const { commute } = useSession();
  const { outgoing, sendRequest, cancelRequest } = useRides();
  const offer = driverOfferFixtures.find((candidate) => candidate.id === offerId);

  if (!offer) {
    return <Redirect href="/home" />;
  }

  const match = matchDrivers(commute, [offer])[0] ?? { offer, sharedDays: [], arrivalGap: null };
  const request = requestSummary(outgoing, offer.id);
  const openDays = commute ? requestableDays(commute, offer, outgoing) : [];
  const chatId = offer.chatId;

  return (
    <OfferDetailScreen
      canRequest={openDays.length > 0}
      hasCommute={commute !== null}
      match={match}
      onBack={() => router.back()}
      onCancelRequest={() => cancelRequest(offer.id)}
      onMessage={chatId ? () => router.navigate(`/inbox/${chatId}`, { withAnchor: true }) : undefined}
      onSendRequest={(days) => sendRequest(offer.id, days)}
      onSetUpCommute={() => router.push('/commute-setup')}
      requestStatus={request?.status}
      requestableDays={openDays}
      requestedDays={request?.days ?? []}
    />
  );
}
