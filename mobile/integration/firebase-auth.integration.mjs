import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { deleteApp, initializeApp } from 'firebase/app';
import {
  applyActionCode,
  confirmPasswordReset,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  initializeAuth,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

const projectId = 'demo-seawolf-rides';
const emulatorOrigin = 'http://127.0.0.1:9099';
const email = 'firebase-auth-test@stonybrook.edu';
const originalPassword = 'valid-password-1';
const replacementPassword = 'valid-password-2';

let app;
let auth;

async function getOutOfBandCode(requestType) {
  const response = await fetch(`${emulatorOrigin}/emulator/v1/projects/${projectId}/oobCodes`);
  assert.equal(response.ok, true);
  const { oobCodes } = await response.json();
  const matchingCodes = oobCodes.filter(
    (code) => code.email === email && code.requestType === requestType,
  );
  assert.ok(matchingCodes.length > 0, `Expected an ${requestType} code for ${email}`);
  return matchingCodes.at(-1).oobCode;
}

before(() => {
  app = initializeApp({ apiKey: 'demo-api-key', projectId }, 'auth-integration');
  auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, emulatorOrigin, { disableWarnings: true });
});

after(async () => {
  await signOut(auth);
  await deleteApp(app);
});

test('a campus account verifies its email, signs in, and resets its password', async () => {
  const registration = await createUserWithEmailAndPassword(auth, email, originalPassword);
  assert.equal(registration.user.emailVerified, false);

  await sendEmailVerification(registration.user);
  await applyActionCode(auth, await getOutOfBandCode('VERIFY_EMAIL'));
  await reload(registration.user);
  assert.equal(registration.user.emailVerified, true);

  await signOut(auth);
  const verifiedSignIn = await signInWithEmailAndPassword(auth, email, originalPassword);
  assert.equal(verifiedSignIn.user.emailVerified, true);
  assert.equal(verifiedSignIn.user.uid, registration.user.uid);

  await sendPasswordResetEmail(auth, email);
  await confirmPasswordReset(
    auth,
    await getOutOfBandCode('PASSWORD_RESET'),
    replacementPassword,
  );
  await signOut(auth);

  await assert.rejects(signInWithEmailAndPassword(auth, email, originalPassword));
  const resetSignIn = await signInWithEmailAndPassword(auth, email, replacementPassword);
  assert.equal(resetSignIn.user.uid, registration.user.uid);
});
