import { router } from 'expo-router';
import { VehicleSetupScreen } from '../vehicle/VehicleSetupScreen';
export default function VehicleSetupRoute() {
  return (
    <VehicleSetupScreen
      onDone={() => router.back()}
      onSkip={() => router.back()}
    />
  );
}
