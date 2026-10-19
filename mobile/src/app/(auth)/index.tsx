import { router } from 'expo-router';

import { useSession } from '../../auth/SessionProvider';
import { WelcomeScreen } from '../../screens/WelcomeScreen';

export default function WelcomeRoute() {
  const { signInAsGuest } = useSession();

  return (
    <WelcomeScreen
      onContinueAsGuest={signInAsGuest}
      onContinueWithEmail={() => router.push('/email')}
    />
  );
}
