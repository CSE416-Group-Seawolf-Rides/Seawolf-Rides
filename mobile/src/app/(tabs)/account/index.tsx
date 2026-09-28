import Constants from 'expo-constants';
import { router } from 'expo-router';

import { useSession } from '../../../auth/SessionProvider';
import { buildCommuteSchedule, commuteToDraft } from '../../../commute/commuteModel';
import { useCommuteRole } from '../../../commute/useCommuteRole';
import { AccountScreen } from '../../../screens/AccountScreen';

export default function AccountRoute() {
  const { user, profile, commute, completeOnboarding, saveCommute, signOut } = useSession();
  const role = useCommuteRole();

  // The (tabs) group is only reachable while signed in.
  if (!user) {
    return null;
  }

  return (
    <AccountScreen
      commute={commute}
      firstName={profile?.firstName ?? null}
      onChangeRole={(nextRole) => {
        completeOnboarding({ firstName: profile?.firstName ?? '', role: nextRole });
        // Re-derive each day's drive/ride mode (and seats) for the new role.
        if (commute) {
          saveCommute(buildCommuteSchedule(commuteToDraft(commute), nextRole));
        }
      }}
      onEditCommute={() => router.push('/commute-setup')}
      onSignOut={signOut}
      role={role}
      user={user}
      version={Constants.expoConfig?.version ?? ''}
    />
  );
}
