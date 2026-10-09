import { Redirect, router } from 'expo-router';

import { RoutePlannerScreen } from '../../../screens/RoutePlannerScreen';

export default function RoutePlannerRoute() {
  if (!__DEV__) return <Redirect href="/home" />;
  return <RoutePlannerScreen onBack={() => router.back()} />;
}
