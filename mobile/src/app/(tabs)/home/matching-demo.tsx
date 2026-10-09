import { Redirect, router } from 'expo-router';

import { MatchingDemoScreen } from '../../../screens/MatchingDemoScreen';

export default function MatchingDemoRoute() {
  if (!__DEV__) {
    return <Redirect href="/home" />;
  }

  return <MatchingDemoScreen onBack={() => router.back()} />;
}
