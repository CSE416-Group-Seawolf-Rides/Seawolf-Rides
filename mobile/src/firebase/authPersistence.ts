import AsyncStorage from '@react-native-async-storage/async-storage';
import { getReactNativePersistence, Persistence } from 'firebase/auth';

// Native builds keep the signed-in session in AsyncStorage so it survives relaunches.
export function getAuthPersistence(): Persistence {
  return getReactNativePersistence(AsyncStorage);
}
