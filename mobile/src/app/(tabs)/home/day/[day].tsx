import { useLocalSearchParams } from 'expo-router';
import { MatchingScreen } from '../../../../mvp/MatchingScreen';
export default function DayDriversRoute() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  return <MatchingScreen initialDate={date} />;
}
