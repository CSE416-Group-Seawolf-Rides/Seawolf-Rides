import { router } from 'expo-router';
import { VehicleSetupScreen } from '../vehicle/VehicleSetupScreen';
export default function VehicleSetupRoute() {
  return (
    <VehicleSetupScreen
      onDone={() => (router.canGoBack() ? router.back() : router.replace('/account'))}
      onSkip={() => (router.canGoBack() ? router.back() : router.replace('/account'))}
    />
  );
}
