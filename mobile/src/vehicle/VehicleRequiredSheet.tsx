import { useRef } from 'react';
import { router } from 'expo-router';
import { ChoiceSheet } from '../components/ChoiceSheet';
export function VehicleRequiredSheet({
  onClose,
  visible,
}: {
  onClose: () => void;
  visible: boolean;
}) {
  const openSetup = useRef(false);
  const navigate = () => {
    if (!openSetup.current) return;
    openSetup.current = false;
    router.push('/vehicle-setup');
  };
  return (
    <ChoiceSheet
      visible={visible}
      title="Finish setting up your vehicle"
      message="Add your car details, photo and license plate before connecting as a driver. You can keep browsing matches."
      cancelLabel="Not now"
      onClose={onClose}
      onDismiss={navigate}
      choices={[
        {
          label: 'Set up my vehicle',
          onPress: () => {
            openSetup.current = true;
            onClose();
            if (process.env.EXPO_OS !== 'ios') navigate();
          },
        },
      ]}
    />
  );
}
