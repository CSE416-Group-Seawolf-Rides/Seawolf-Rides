import { DevelopmentOnly } from '../../../mvp/DevelopmentOnly';
import { Redirect, router } from 'expo-router';

import { RoutePlannerScreen } from '../../../screens/RoutePlannerScreen';

function RoutePlannerRoute() {
  if (!__DEV__) return <Redirect href="/home" />;
  return <RoutePlannerScreen onBack={() => router.back()} />;
}

export default function DevelopmentRoute() { return <DevelopmentOnly><RoutePlannerRoute /></DevelopmentOnly>; }
