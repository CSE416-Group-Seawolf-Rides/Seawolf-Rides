import { useNavigation } from 'expo-router';

// Commute setup is a modal with its own stack. Going back in the parent (root) stack
// closes the whole modal from any step, returning people to where they started.
export function useCloseCommuteSetup(): () => void {
  const navigation = useNavigation();
  return () => navigation.getParent()?.goBack();
}
