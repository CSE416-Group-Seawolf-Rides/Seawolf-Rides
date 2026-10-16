import { router, useLocalSearchParams } from 'expo-router';

import { isKnownPublicProfile, resolvePublicProfile } from '../../profiles/publicProfiles';
import { PublicProfileScreen } from '../../screens/PublicProfileScreen';

export default function PublicProfileRoute() {
  const { participantId, name } = useLocalSearchParams<{ participantId: string; name?: string }>();
  const id = Array.isArray(participantId) ? participantId[0] : participantId;
  const fallbackName = Array.isArray(name) ? name[0] : name;
  const profile = resolvePublicProfile(id ?? 'missing-participant', fallbackName ?? 'Rider');
  return <PublicProfileScreen onClose={() => router.back()} profile={profile} profileKnown={Boolean(id && isKnownPublicProfile(id))} />;
}
