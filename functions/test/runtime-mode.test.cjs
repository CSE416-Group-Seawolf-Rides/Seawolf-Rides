const assert = require('node:assert/strict');
const test = require('node:test');
const { isHostedDeployment, isLocalDemo, requireBackendEnabled } = require('../lib/functions/src/runtimeMode');
const { createRideRequest } = require('../lib/functions/src/rideRequests');

const keys = [
  'SEAWOLF_HOSTED',
  'FUNCTIONS_EMULATOR',
  'GCLOUD_PROJECT',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_AUTH_EMULATOR_HOST',
];
const emulator = {
  FUNCTIONS_EMULATOR: 'true',
  GCLOUD_PROJECT: 'demo-seawolf-rides',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:9095',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
};
const hosted = { SEAWOLF_HOSTED: 'true', GCLOUD_PROJECT: 'seawolf-rides' };

function withEnv(values, check) {
  const before = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, values);
    return check();
  } finally {
    keys.forEach((key, i) => {
      if (before[i] === undefined) delete process.env[key];
      else process.env[key] = before[i];
    });
  }
}
const enabled = (values) => withEnv(values, () => {
  try {
    requireBackendEnabled('off');
    return true;
  } catch (error) {
    assert.equal(error.code, 'failed-precondition');
    return false;
  }
});

test('the demo emulators stay enabled without the hosted flag', () => {
  assert.equal(withEnv(emulator, isLocalDemo), true);
  assert.equal(enabled(emulator), true);
});

test('the hosted flag enables only the real project outside the emulators', () => {
  assert.equal(withEnv(hosted, isHostedDeployment), true);
  assert.equal(enabled(hosted), true);
});

test('the backend fails closed without a deliberate opt-in', () => {
  assert.equal(enabled({}), false);
  assert.equal(enabled({ GCLOUD_PROJECT: 'seawolf-rides' }), false);
  assert.equal(enabled({ SEAWOLF_HOSTED: '1', GCLOUD_PROJECT: 'seawolf-rides' }), false);
  assert.equal(enabled({ SEAWOLF_HOSTED: 'true', GCLOUD_PROJECT: 'other-project' }), false);
  assert.equal(enabled({ SEAWOLF_HOSTED: 'true' }), false);
  assert.equal(enabled({ ...emulator, SEAWOLF_HOSTED: 'true', GCLOUD_PROJECT: 'seawolf-rides' }), false);
  assert.equal(enabled({ ...hosted, FIRESTORE_EMULATOR_HOST: '127.0.0.1:9095' }), false);
});

test('a hosted deployment gets past the gate to the account check', async () => {
  const before = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, hosted);
    // No uid: the gate passes and the account check rejects before any database access.
    await assert.rejects(createRideRequest.run({ data: {} }), { code: 'permission-denied' });
  } finally {
    keys.forEach((key, i) => {
      if (before[i] === undefined) delete process.env[key];
      else process.env[key] = before[i];
    });
  }
});
