import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { useSession } from '../../../../auth/SessionProvider';
import { Weekday, weekdays } from '../../../../commute/commuteModel';
import { driverOfferFixtures } from '../../../../rides/rideFixtures';
import { requestSummaryForOccurrence } from '../../../../rides/rideModel';
import { useRides } from '../../../../rides/RidesProvider';
import { DayDriversScreen } from '../../../../screens/DayDriversScreen';

export default function DayDriversRoute() {
  const { day, date } = useLocalSearchParams<{ day: Weekday; date?: string }>();
  const { commute, user } = useSession();
  const { outgoing, incoming, skipped, sendDatedRequest } = useRides();
  const weekday = weekdays.find((option) => option.value === day);

  if (!commute || !weekday || !date || !user) {
    return <Redirect href="/home" />;
  }

  return (
    <DayDriversScreen
      day={weekday.value}
      dayName={weekday.name}
      commute={commute}
      localDate={date}
      offers={driverOfferFixtures}
      outgoing={outgoing}
      incoming={incoming}
      riderId={user.id}
      skippedDates={skipped}
      onBack={() => router.back()}
      onSendDatedRequest={sendDatedRequest}
      statusFor={(offerId) => requestSummaryForOccurrence(outgoing, offerId, date)?.status}
    />
  );
}
