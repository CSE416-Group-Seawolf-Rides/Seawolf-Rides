const assert = require('node:assert/strict');
const test = require('node:test');
const { createRideRequest, respondToRideRequest, cancelRideRequest } = require('../lib/functions/src/rideRequests');
test('ride actions fail closed outside the demo emulator, before account or database access', async () => {
  const keys = [
    'FUNCTIONS_EMULATOR',
    'GCLOUD_PROJECT',
    'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_AUTH_EMULATOR_HOST',
  ];
  const before = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    for (const action of [createRideRequest, respondToRideRequest, cancelRideRequest])
      await assert.rejects(action.run({ auth: { uid: 'test' }, data: {} }), {
        code: 'failed-precondition',
      });
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.GCLOUD_PROJECT = 'seawolf-rides';
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9095';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    await assert.rejects(createRideRequest.run({ auth: { uid: 'test' }, data: {} }), {
      code: 'failed-precondition',
    });
  } finally {
    keys.forEach((key, i) => {
      if (before[i] === undefined) delete process.env[key];
      else process.env[key] = before[i];
    });
  }
});
