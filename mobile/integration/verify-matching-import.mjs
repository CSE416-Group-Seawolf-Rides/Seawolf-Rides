import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
if (
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:9095'
)
  throw new Error('Persistence verification requires the loopback test emulators.');
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'demo-seawolf-rides' });
try {
  const db = getFirestore(app);
  for (const uid of ['mvp-driver', 'mvp-rider']) {
    assert.equal((await getAuth(app).getUser(uid)).emailVerified, true);
    assert.equal((await db.doc(`users/${uid}/commutes/primary`).get()).data().ownerId, uid);
  }
  assert.equal((await db.doc('matchingSetups/mvp-driver').get()).data().revision, 'v4');
  assert.equal((await db.doc('matchingSetups/mvp-rider').get()).data().revision, 'v1');
  console.log(
    'PASS: exported Auth accounts, commutes and matching settings survive emulator restart/import.',
  );
} finally {
  await deleteApp(app);
}
