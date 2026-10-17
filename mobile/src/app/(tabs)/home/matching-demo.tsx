import { DevelopmentOnly } from '../../../mvp/DevelopmentOnly';
import { Redirect, router } from 'expo-router';

import { MatchingDemoScreen } from '../../../screens/MatchingDemoScreen';

function MatchingDemoRoute() {
  if (!__DEV__) {
    return <Redirect href="/home" />;
  }

  return <MatchingDemoScreen onBack={() => router.back()} />;
}

export default function DevelopmentRoute() { return <DevelopmentOnly><MatchingDemoRoute /></DevelopmentOnly>; }
