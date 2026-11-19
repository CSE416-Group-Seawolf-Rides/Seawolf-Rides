import { router } from 'expo-router';

import { canUseSeededDemo } from '../../auth/demoAccount';
import { useSession } from '../../auth/SessionProvider';
import { WelcomeScreen } from '../../screens/WelcomeScreen';

export default function WelcomeRoute() {
  const { signInAsGuest } = useSession();

  return (
    <WelcomeScreen
      // The guest is the seeded emulator account; a real project has no such account.
      onContinueAsGuest={
        canUseSeededDemo()
          ? async () => {
              await signInAsGuest();
              router.replace('/home');
            }
          : undefined
      }
      onContinueWithEmail={() => router.push('/email')}
    />
  );
}
