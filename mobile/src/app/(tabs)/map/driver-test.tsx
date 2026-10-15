import { Redirect, router } from 'expo-router';

import { QueensDriverTestScreen } from '../../../screens/QueensDriverTestScreen';

export default function DriverTestRoute() {
  if (!__DEV__) return <Redirect href="/map" />;
  return <QueensDriverTestScreen onBack={() => router.back()} />;
}
