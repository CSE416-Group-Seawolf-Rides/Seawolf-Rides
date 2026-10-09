import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { useSession } from '../../../auth/SessionProvider';
import { buildCommuteSchedule, commuteToDraft } from '../../../commute/commuteModel';
import { useCommuteRole } from '../../../commute/useCommuteRole';
import { AccountScreen } from '../../../screens/AccountScreen';

export default function AccountRoute() {
  const { user, profile, commute, completeOnboarding, signOut } = useSession();
  const role = useCommuteRole();

  // The (tabs) group is only reachable while signed in.
  if (!user) {
    return null;
  }

  return (
    <AccountScreen
      commute={commute}
      firstName={profile?.firstName ?? null}
      onChangeRole={async (nextRole) => {
        const nextCommute = commute
          ? buildCommuteSchedule(commuteToDraft(commute), nextRole)
          : null;
        try {
          // Save the role and re-derived commute together so Firestore never
          // contains a role that disagrees with the commute's day modes.
          await completeOnboarding(
            { firstName: profile?.firstName ?? '', role: nextRole },
            nextCommute,
          );
        } catch {
          Alert.alert('Couldn’t update your role', 'Check your connection and try again.');
        }
      }}
      onEditCommute={() => router.push('/commute-setup')}
      onSignOut={async () => {
        try {
          await signOut();
        } catch {
          Alert.alert('Couldn’t sign out', 'Check your connection and try again.');
        }
      }}
      role={role}
      user={user}
      version={Constants.expoConfig?.version ?? ''}
    />
  );
}
