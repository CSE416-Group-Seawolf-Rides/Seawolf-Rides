import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseApp, FirebaseOptions, getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  connectAuthEmulator,
} from 'firebase/auth';
import { Firestore, getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const requiredConfigValues = [
  ['EXPO_PUBLIC_FIREBASE_API_KEY', firebaseConfig.apiKey],
  ['EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', firebaseConfig.authDomain],
  ['EXPO_PUBLIC_FIREBASE_PROJECT_ID', firebaseConfig.projectId],
  ['EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', firebaseConfig.storageBucket],
  ['EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', firebaseConfig.messagingSenderId],
  ['EXPO_PUBLIC_FIREBASE_APP_ID', firebaseConfig.appId],
] as const;

function validateFirebaseConfig(): FirebaseOptions {
  const missingVariables = requiredConfigValues.filter(([, value]) => !value).map(([name]) => name);

  if (missingVariables.length > 0) {
    throw new Error(`Missing Firebase configuration: ${missingVariables.join(', ')}`);
  }

  return firebaseConfig;
}

function getFirebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(validateFirebaseConfig());
}

let firebaseAuth: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (firebaseAuth) {
    return firebaseAuth;
  }

  const app = getFirebaseApp();
  try {
    firebaseAuth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    // Fast refresh can preserve Firebase's app while reloading this module.
    // In that case Auth is already configured and can be reused safely.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'auth/already-initialized'
    ) {
      firebaseAuth = getAuth(app);
    } else {
      throw error;
    }
  }

  const emulatorHost = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
  if (__DEV__ && emulatorHost && !firebaseAuth.emulatorConfig)
    connectAuthEmulator(firebaseAuth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  return firebaseAuth;
}

// Firebase caches services across Fast Refresh; do not reconnect an already-used emulator service.
const emulatorState = globalThis as typeof globalThis & { __seawolfEmulators?: WeakSet<object> };
const connectedEmulators = (emulatorState.__seawolfEmulators ??= new WeakSet<object>());
let database: Firestore | null = null;
export function getFirebaseFirestore(): Firestore {
  if (!database) {
    database = getFirestore(getFirebaseApp());
    const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
    if (__DEV__ && host && !connectedEmulators.has(database)) {
      connectFirestoreEmulator(database, host, 9095);
      connectedEmulators.add(database);
    }
  }
  return database;
}
let functions: ReturnType<typeof getFunctions> | null = null;
export function getFirebaseFunctions() {
  if (!functions) {
    functions = getFunctions(getFirebaseApp(), 'us-central1');
    const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
    if (__DEV__ && host && !connectedEmulators.has(functions)) {
      connectFunctionsEmulator(functions, host, 5001);
      connectedEmulators.add(functions);
    }
  }
  return functions;
}
