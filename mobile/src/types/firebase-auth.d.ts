import 'firebase/auth';

declare module 'firebase/auth' {
  interface ReactNativeStorage {
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
    setItem(key: string, value: string): Promise<void>;
  }

  // Firebase exposes this from its React Native build, but the umbrella
  // package's platform-neutral type entry does not currently re-export it.
  export function getReactNativePersistence(storage: ReactNativeStorage): Persistence;
}
