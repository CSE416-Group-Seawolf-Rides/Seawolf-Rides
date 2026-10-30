import { router } from 'expo-router';

import { useSession } from '../../../auth/SessionProvider';
import { BlockedUsersScreen } from '../../../safety/BlockedUsersScreen';

export default function BlockedRoute() {
  const { user } = useSession();
  return <BlockedUsersScreen currentUid={user?.id ?? ''} onBack={() => router.back()} />;
}
