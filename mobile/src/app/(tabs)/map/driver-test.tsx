import { DevelopmentOnly } from '../../../mvp/DevelopmentOnly';
import { Redirect, router } from 'expo-router';

import { QueensDriverTestScreen } from '../../../screens/QueensDriverTestScreen';

function DriverTestRoute() {
  if (!__DEV__) return <Redirect href="/map" />;
  return <QueensDriverTestScreen onBack={() => router.back()} onOpenProfile={(participantId, name) => router.push({ pathname: '/profile/[participantId]', params: { participantId, name } })} />;
}

export default function DevelopmentRoute() { return <DevelopmentOnly><DriverTestRoute /></DevelopmentOnly>; }
