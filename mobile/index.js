// Custom app entry. The Android Auto / AAOS host runs the JS bundle's entry and then
// starts the "AndroidAuto" module (see CarPlaySession.invokeStartTask), without ever
// rendering the phone's expo-router layout. So the car side is registered here, once.
// (ES imports are hoisted and evaluate in order: car setup, then the phone entry.)
import { AppRegistry } from 'react-native';

import './src/car';
import 'expo-router/entry';

// The car UI is built from native templates driven by CarPlay.* calls (src/car/carApp.ts);
// the root module itself has nothing to draw.
AppRegistry.registerComponent('AndroidAuto', () => () => null);
AppRegistry.registerComponent('AndroidAutoCluster', () => () => null);
