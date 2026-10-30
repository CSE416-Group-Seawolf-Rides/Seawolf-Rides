import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { useSession } from '../../auth/SessionProvider';
import { usePublicProfile } from '../../profiles/profileClient';
import { isKnownPublicProfile, resolvePublicProfile } from '../../profiles/publicProfiles';
import { PublicProfileScreen } from '../../screens/PublicProfileScreen';

function PublicProfileRoute() {
  const { user } = useSession();
  const { participantId, name } = useLocalSearchParams<{ participantId: string; name?: string }>();
  const id = Array.isArray(participantId) ? participantId[0] : participantId;
  const fallbackName = Array.isArray(name) ? name[0] : name;
  const syntheticKnown = Boolean(id && isKnownPublicProfile(id));
  const live = usePublicProfile(syntheticKnown ? undefined : id);
  if (!__DEV__ && id?.startsWith('demo3x7-')) return <Redirect href="/map" />;
  const profile = syntheticKnown
    ? resolvePublicProfile(id!, fallbackName ?? 'Rider')
    : live ?? resolvePublicProfile(id ?? 'missing-participant', fallbackName ?? 'Rider');
  return (
    <PublicProfileScreen
      currentUid={user?.id}
      onClose={() => (router.canGoBack() ? router.back() : router.replace('/inbox'))}
      profile={profile}
      profileKnown={syntheticKnown || Boolean(live)}
    />
  );
}

export default PublicProfileRoute;
