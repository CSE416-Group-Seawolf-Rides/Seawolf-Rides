import { router } from 'expo-router';

import { useSession } from '../../../auth/SessionProvider';
import { EditProfileScreen } from '../../../screens/EditProfileScreen';

export default function EditProfileRoute() {
  const { profile, saveProfile } = useSession();
  if (!profile) return null;
  return <EditProfileScreen initial={profile} onBack={() => router.back()} onSave={saveProfile} />;
}
