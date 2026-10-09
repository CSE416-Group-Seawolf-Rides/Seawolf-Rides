import { router } from 'expo-router';

import { WelcomeScreen } from '../../screens/WelcomeScreen';

export default function WelcomeRoute() {
  return <WelcomeScreen onContinueWithEmail={() => router.push('/email')} />;
}
