import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { initializeApp as clientApp, deleteApp as deleteClient } from 'firebase/app';
import {
  getAuth as clientAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore as clientFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
} from 'firebase/firestore';
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
  const accepted = await db
    .collection('rideRequests')
    .where('riderId', '==', 'aaa-requests-rider')
    .get();
  assert.equal(accepted.size, 1);
  const ride = accepted.docs[0];
  assert.equal(ride.data().status, 'ACCEPTED');
  assert.equal(
    (await db.collection('_rideCommitments').where('requestId', '==', ride.id).get()).size,
    2,
  );
  assert.ok((await db.collection('rideRequests').where('status', '==', 'PENDING').get()).size > 0);
  assert.ok((await db.collection('rideRequests').where('status', '==', 'DECLINED').get()).size > 0);
  for (const uid of ['aaa-requests-rider', 'aaa-requests-driver']) {
    const client = clientApp({ projectId: 'demo-seawolf-rides', apiKey: 'emulator-only' }, uid);
    try {
      const auth = clientAuth(client);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      const database = clientFirestore(client);
      connectFirestoreEmulator(database, '127.0.0.1', 9095);
      await signInWithEmailAndPassword(auth, `${uid}@stonybrook.edu`, 'Emulator-test-only-123!');
      assert.equal(
        (await getDoc(doc(database, 'rideRequests', ride.id))).data().status,
        'ACCEPTED',
      );
    } finally {
      await deleteClient(client);
    }
  }
  console.log(
    'PASS: accounts, commutes, pending/declined requests, accepted ride and reservations survive restart/import; both clients read accepted status.',
  );
} finally {
  await deleteApp(app);
}
