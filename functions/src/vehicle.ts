import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { eligible } from './matchingRuntime';
import { parseVehicle } from '../../mobile/src/vehicle/vehicleModel';

export const saveVehicleDetails = onCall(
  { region: 'us-central1' },
  async (call) => {
    if (
      process.env.FUNCTIONS_EMULATOR !== 'true' ||
      process.env.GCLOUD_PROJECT !== 'demo-seawolf-rides' ||
      !process.env.FIRESTORE_EMULATOR_HOST ||
      !process.env.FIREBASE_AUTH_EMULATOR_HOST
    )
      throw new HttpsError(
        'failed-precondition',
        'Vehicle setup is available only in the local demo emulators.',
      );
    if (!call.auth || !(await eligible(call.auth.uid)))
      throw new HttpsError(
        'permission-denied',
        'Sign in with a verified Stony Brook account.',
      );
    let details;
    try {
      if (
        !call.data ||
        Object.keys(call.data).some(
          (key) =>
            ![
              'schemaVersion',
              'ownerId',
              'type',
              'color',
              'photoBase64',
              'plate',
              'plateRegion',
            ].includes(key),
        )
      )
        throw new Error('Unexpected vehicle fields.');
      details = parseVehicle(call.data, call.auth.uid);
    } catch (e) {
      throw new HttpsError(
        'invalid-argument',
        e instanceof Error ? e.message : 'Check your vehicle details.',
      );
    }
    // No verified flag: this is owner-entered information, never an identity check.
    await getFirestore()
      .doc(`users/${call.auth.uid}/vehicles/primary`)
      .set({ ...details, updatedAt: new Date() });
    return { saved: true };
  },
);
