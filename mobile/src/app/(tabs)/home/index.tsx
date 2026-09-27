import { router } from 'expo-router';

import { useSession } from '../../../auth/SessionProvider';
import { MatchScreen } from '../../../screens/MatchScreen';

export default function MatchRoute() {
  const { commute } = useSession();

  return (
    <MatchScreen
      onFindCommuters={() => router.push('/home/results')}
      onSetUpCommute={commute ? undefined : () => router.push('/commute-setup')}
    />
  );
}
