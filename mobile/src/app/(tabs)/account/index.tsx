import { router } from 'expo-router';

import { useSession } from '../../../auth/SessionProvider';
import { AccountScreen } from '../../../screens/AccountScreen';

export default function AccountRoute() {
  const { user, profile, commute, signOut } = useSession();

  // The (tabs) group is only reachable while signed in.
  if (!user) {
    return null;
  }

  return (
    <AccountScreen
      commute={commute}
      onEditCommute={() => router.push('/commute-setup')}
      onSignOut={signOut}
      profile={profile}
      user={user}
    />
  );
}
