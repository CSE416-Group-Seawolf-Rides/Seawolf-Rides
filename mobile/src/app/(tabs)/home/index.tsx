import { router } from 'expo-router';

import { useSession } from '../../../auth/SessionProvider';
import { weekdays } from '../../../commute/commuteModel';
import { useCommuteRole } from '../../../commute/useCommuteRole';
import { driverOfferFixtures } from '../../../rides/rideFixtures';
import {
  getNextTrip,
  getUpcoming,
  getWeekOverview,
  incomingForCommute,
  matchDrivers,
  matchDriversForDay,
  requestableDays,
  requestSummary,
  ridingDays,
  weekDateKeys,
} from '../../../rides/rideModel';
import { useRides } from '../../../rides/RidesProvider';
import { useHomeClock } from '../../../rides/useHomeClock';
import { HomeScreen, OpenDayView } from '../../../screens/HomeScreen';

export default function HomeRoute() {
  const { profile, commute } = useSession();
  const role = useCommuteRole();
  const { outgoing, incoming, skipped, sendRequest } = useRides();
  const { now, greeting, dateLabel, dates, today } = useHomeClock();

  const incomingViews = incomingForCommute(commute, incoming);
  const relevantIncoming = incomingViews.map((view) => view.request);
  const nextTrip = getNextTrip(commute, outgoing, relevantIncoming, driverOfferFixtures, now, skipped);
  const chatId = nextTrip?.offer?.chatId;

  // The coming seven days: what's booked and which days still need a driver.
  const upcoming = getUpcoming(commute, outgoing, relevantIncoming, driverOfferFixtures, now, skipped, 7);
  const openDays: OpenDayView[] = commute
    ? upcoming.flatMap((item) =>
        item.kind === 'open'
          ? [
              {
                day: item.day,
                label: item.whenLabel,
                pending: item.pending,
                matches: matchDriversForDay(commute, driverOfferFixtures, item.day),
              },
            ]
          : [],
      )
    : [];
  const thisWeekItems = upcoming.filter((item) => item.thisWeek);

  const thisWeek = weekDateKeys(now);
  const skippedDays = weekdays
    .map((weekday) => weekday.value)
    .filter((day) => skipped.includes(thisWeek[day]));

  return (
    <HomeScreen
      actionableDays={thisWeekItems.map((item) => item.day)}
      commute={commute}
      dateLabel={dateLabel}
      dates={dates}
      greeting={`${greeting}, ${profile?.firstName ?? 'there'}`}
      nextTrip={nextTrip}
      onMessageTrip={chatId ? () => router.navigate(`/inbox/${chatId}`, { withAnchor: true }) : undefined}
      onOpenOffer={(offerId) => router.push(`/home/driver/${offerId}`)}
      onOpenTrip={nextTrip ? () => router.navigate(`/rides/${nextTrip.id}`, { withAnchor: true }) : undefined}
      onPressDay={(day) => {
        const item = thisWeekItems.find((candidate) => candidate.day === day);
        if (item?.kind === 'open') {
          router.push(`/home/day/${day}`);
        } else if (item) {
          router.navigate(`/rides/${item.id}`, { withAnchor: true });
        }
      }}
      onReviewRequests={() => router.push('/home/requests')}
      onSeeAllDrivers={(day) => router.push(`/home/day/${day}`)}
      onSendRequest={sendRequest}
      onSetUpCommute={() => router.push('/commute-setup')}
      openDays={openDays}
      overview={getWeekOverview(commute, outgoing, relevantIncoming, skippedDays)}
      pendingRequests={incomingViews.filter((view) => view.request.status === 'pending')}
      previewMatches={matchDrivers(null, driverOfferFixtures)}
      requestableDaysFor={(offerId) => {
        const offer = driverOfferFixtures.find((candidate) => candidate.id === offerId);
        return commute && offer ? requestableDays(commute, offer, outgoing) : [];
      }}
      ridesSomeDays={commute ? ridingDays(commute).length > 0 : false}
      role={role}
      statusFor={(offerId, day) => requestSummary(outgoing, offerId, day)?.status}
      today={today}
    />
  );
}
