import { Redirect, router } from 'expo-router';

import { FindRidersDemoScreen } from '../../../screens/FindRidersDemoScreen';

export default function FindRidersDemoRoute() {
  if (!__DEV__) return <Redirect href="/map" />;
  return <FindRidersDemoScreen onBack={() => router.back()} onOpenProfile={(participantId, name) => router.push({ pathname: '/profile/[participantId]', params: { participantId, name } })} />;
}
