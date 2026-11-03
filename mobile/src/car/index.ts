// Entry point for car (Android Auto / Android Automotive) support. Imported once
// from the root layout so the connect listener is registered as soon as JS
// loads — including when the car host starts the app without the phone UI.
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  try {
    // Lazy require so a missing native module (e.g. Expo Go) can never crash the phone app.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./carApp') as typeof import('./carApp')).registerCarApp();
  } catch (error) {
    console.warn('[car] Car support unavailable in this build:', error);
  }
}
