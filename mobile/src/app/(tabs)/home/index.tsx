import { useLocalSearchParams } from 'expo-router';
import { weekdayForDate } from '../../../mvp/settings';
import { CommuteCalendarScreen } from '../../../calendar/CommuteCalendarScreen';
export default function HomeRoute() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  let validDate: string | undefined;
  try {
    if (date) {
      weekdayForDate(date);
      validDate = date;
    }
  } catch {
    /* Ignore a malformed deep link. */
  }
  return <CommuteCalendarScreen initialDate={validDate} />;
}
