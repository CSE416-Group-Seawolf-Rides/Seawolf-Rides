import { useLocalSearchParams } from 'expo-router';
import { CommuteCalendarScreen } from '../../../../calendar/CommuteCalendarScreen';
export default function DayRoute() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  return <CommuteCalendarScreen initialDate={date} />;
}
