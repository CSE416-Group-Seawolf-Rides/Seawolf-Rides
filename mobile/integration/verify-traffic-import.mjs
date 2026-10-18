import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, getDoc, doc } from 'firebase/firestore';
if (
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:9095' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
)
  throw new Error('Loopback test emulators required.');
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const {
  initializeApp: initializeAdmin,
  deleteApp: deleteAdmin,
} = require('firebase-admin/app');
const { getFirestore: adminFirestore } = require('firebase-admin/firestore');
const admin = initializeAdmin({ projectId: 'demo-seawolf-rides' });
try {
  const db = adminFirestore(admin);
  const rides = await db
    .collection('rideRequests')
    .where('riderId', '==', 'traffic-rider')
    .get();
  assert.equal(rides.size, 1);
  const ride = rides.docs[0];
  assert.equal(ride.data().status, 'ACCEPTED');
  assert.equal(ride.data().plan.vehicleCampusArrival - ride.data().plan.departure, 2220);
  assert.equal(
    (await db.collection('_rideCommitments').where('requestId', '==', ride.id).get())
      .size,
    2,
  );
  assert.equal((await db.doc('_m3Routing/tomtomBudget').get()).data().count, 18000);
  for (const uid of ['traffic-rider', 'traffic-a-driver']) {
    const app = initializeApp(
      { projectId: 'demo-seawolf-rides', apiKey: 'emulator-only' },
      uid,
    );
    try {
      const auth = getAuth(app);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      const client = getFirestore(app);
      connectFirestoreEmulator(client, '127.0.0.1', 9095);
      await signInWithEmailAndPassword(
        auth,
        `${uid}@stonybrook.edu`,
        'Emulator-test-only-123!',
      );
      assert.equal(
        (await getDoc(doc(client, 'rideRequests', ride.id))).data().status,
        'ACCEPTED',
      );
      assert.equal((await getDoc(doc(client, 'ridePickups', ride.id))).exists(), true);
    } finally {
      await deleteApp(app);
    }
  }
  console.log(
    'PASS: traffic-derived accepted timing, both accounts, private pickups, commitments and demo request counter survive import.',
  );
} finally {
  await deleteAdmin(admin);
}
