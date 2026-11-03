// Entry point for car (Android Auto / CarPlay) support. Imported once from the
// root layout so the connect listener is registered as soon as JS loads —
// including when Android Auto starts the app headlessly without the phone UI.
import { Platform } from 'react-native';

// STEP 1 (hello world): prove the library builds on RN 0.88 and renders a
// template on the Android Auto Desktop Head Unit. Replaced by real templates
// once this is confirmed.
function registerHelloWorld() {
  // Lazy require so a native-module problem can never crash the phone app.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CarPlay, MessageTemplate } = require('@g4rb4g3/react-native-carplay') as typeof import('@g4rb4g3/react-native-carplay');
    CarPlay.registerOnConnect(() => {
      const template = new MessageTemplate({
        title: 'Seawolf Rides',
        message: 'Hello from Seawolf Rides on Android Auto.',
      });
      CarPlay.setRootTemplate(template, false);
    });
  } catch (error) {
    console.warn('[car] Car support unavailable in this build:', error);
  }
}

if (Platform.OS === 'android') registerHelloWorld();
