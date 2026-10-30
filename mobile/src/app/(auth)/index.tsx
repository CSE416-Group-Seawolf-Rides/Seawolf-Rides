import { router } from 'expo-router';

import { useSession } from '../../auth/SessionProvider';
import { WelcomeScreen } from '../../screens/WelcomeScreen';

export default function WelcomeRoute() {
  const { signInAsGuest } = useSession();

  return (
    <WelcomeScreen
      onContinueAsGuest={async () => {
        await signInAsGuest();
        router.replace('/home');
      }}
      onContinueWithEmail={() => router.push('/email')}
    />
  );
}
