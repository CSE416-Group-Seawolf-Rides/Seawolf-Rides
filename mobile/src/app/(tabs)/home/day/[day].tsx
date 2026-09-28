import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { useSession } from '../../../../auth/SessionProvider';
import { Weekday, weekdays } from '../../../../commute/commuteModel';
import { driverOfferFixtures } from '../../../../rides/rideFixtures';
import { matchDriversForDay, requestableDays, requestSummary } from '../../../../rides/rideModel';
import { useRides } from '../../../../rides/RidesProvider';
import { DayDriversScreen } from '../../../../screens/DayDriversScreen';

export default function DayDriversRoute() {
  const { day } = useLocalSearchParams<{ day: Weekday }>();
  const { commute } = useSession();
  const { outgoing, sendRequest } = useRides();
  const weekday = weekdays.find((option) => option.value === day);

  if (!commute || !weekday) {
    return <Redirect href="/home" />;
  }

  return (
    <DayDriversScreen
      day={weekday.value}
      dayName={weekday.name}
      matches={matchDriversForDay(commute, driverOfferFixtures, weekday.value)}
      onBack={() => router.back()}
      onOpenOffer={(offerId) => router.push(`/home/driver/${offerId}`)}
      onSendRequest={sendRequest}
      requestableDaysFor={(offerId) => {
        const offer = driverOfferFixtures.find((candidate) => candidate.id === offerId);
        return offer ? requestableDays(commute, offer, outgoing) : [];
      }}
      statusFor={(offerId) => requestSummary(outgoing, offerId, weekday.value)?.status}
    />
  );
}
