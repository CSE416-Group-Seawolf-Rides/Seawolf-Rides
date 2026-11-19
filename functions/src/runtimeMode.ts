import { HttpsError } from 'firebase-functions/v2/https';

/** The only real Firebase project that may run the backend outside the emulators. */
export const HOSTED_PROJECT_ID = 'seawolf-rides';

/** True only inside the named local demo emulators. */
export function isLocalDemo(): boolean {
  return (
    process.env.FUNCTIONS_EMULATOR === 'true' &&
    process.env.GCLOUD_PROJECT === 'demo-seawolf-rides' &&
    !!process.env.FIRESTORE_EMULATOR_HOST &&
    !!process.env.FIREBASE_AUTH_EMULATOR_HOST
  );
}

/**
 * True only for a deliberate hosted deployment: SEAWOLF_HOSTED=true (set in the
 * git-ignored functions/.env.seawolf-rides) on the real project, outside the emulators.
 */
export function isHostedDeployment(): boolean {
  return (
    process.env.SEAWOLF_HOSTED === 'true' &&
    process.env.GCLOUD_PROJECT === HOSTED_PROJECT_ID &&
    process.env.FUNCTIONS_EMULATOR !== 'true' &&
    !process.env.FIRESTORE_EMULATOR_HOST &&
    !process.env.FIREBASE_AUTH_EMULATOR_HOST
  );
}

/** Fails closed unless running in the local demo or an opted-in hosted deployment. */
export function requireBackendEnabled(message: string): void {
  if (!isLocalDemo() && !isHostedDeployment())
    throw new HttpsError('failed-precondition', message);
}
