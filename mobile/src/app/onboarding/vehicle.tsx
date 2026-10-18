import { router } from 'expo-router';
import { VehicleSetupScreen } from '../../vehicle/VehicleSetupScreen';
export default function OnboardingVehicleRoute() {
  return (
    <VehicleSetupScreen
      onDone={() => router.replace('/onboarding/done')}
      onSkip={() => router.replace('/onboarding/done')}
    />
  );
}
