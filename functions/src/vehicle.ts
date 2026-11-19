import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireBackendEnabled } from './runtimeMode';
import { eligible } from './matchingRuntime';
import { parseVehicle } from '../../mobile/src/vehicle/vehicleModel';

export const saveVehicleDetails = onCall(
  { region: 'us-central1', maxInstances: 1 },
  async (call) => {
    requireBackendEnabled('Vehicle setup is not enabled on this server.');
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
              'fuelType',
              'efficiency',
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
    const ref = getFirestore().doc(`users/${call.auth.uid}/vehicles/primary`);
    // Fuel settings are edited separately; keep them unless this save changes them.
    const existing = (await ref.get()).data() ?? {};
    const fuel = {
      ...(existing.fuelType ? { fuelType: existing.fuelType } : {}),
      ...(typeof existing.efficiency === 'number' ? { efficiency: existing.efficiency } : {}),
    };
    await ref.set({ ...fuel, ...details, updatedAt: new Date() });
    return { saved: true };
  },
);
