import { Alert } from 'react-native';

// One-button message (errors and notices). The web build uses showAlert.web.ts, because
// React Native Web's Alert.alert does nothing in a browser.
export function showAlert(title: string, message?: string): void {
  Alert.alert(title, message);
}
