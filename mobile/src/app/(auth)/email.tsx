import { router } from 'expo-router';

import { EmailAuthScreen } from '../../screens/EmailAuthScreen';

export default function EmailAuthRoute() {
  return <EmailAuthScreen onBack={() => router.back()} />;
}
