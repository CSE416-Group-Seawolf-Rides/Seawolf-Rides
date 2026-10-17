import { router } from 'expo-router';
import { View } from 'react-native';
import { MatchingScreen } from '../../../mvp/MatchingScreen';
import { AppButton } from '../../../components/AppButton';
export default function HomeRoute() {
  return (
    <View style={{ flex: 1 }}>
      <MatchingScreen />
      {__DEV__ && (
        <>
          <AppButton
            label="Development simulations (synthetic)"
            variant="secondary"
            onPress={() => router.push('/home/demo-home')}
          />
          <AppButton
            label="Development map (synthetic)"
            variant="secondary"
            onPress={() => router.push('/map/demo-map')}
          />
        </>
      )}
    </View>
  );
}
