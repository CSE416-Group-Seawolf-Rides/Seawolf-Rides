import Constants from 'expo-constants';
import { Platform, TurboModuleRegistry } from 'react-native';

import { getGoogleNavigationAvailability } from './googleNavigation';

interface GoogleNavigationExtra {
  androidConfigured?: boolean;
  iosConfigured?: boolean;
}

export function getRuntimeGoogleNavigationAvailability() {
  const extra = Constants.expoConfig?.extra?.googleNavigation as GoogleNavigationExtra | undefined;
  const configured = Platform.OS === 'android'
    ? extra?.androidConfigured === true
    : Platform.OS === 'ios' && extra?.iosConfigured === true;
  return getGoogleNavigationAvailability({
    configured,
    nativeModuleAvailable: TurboModuleRegistry.get('NavModule') !== null,
  });
}
