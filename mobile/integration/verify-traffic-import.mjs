import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, getDoc, getDocs, collection, query, orderBy, doc } from 'firebase/firestore';
if (
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:9095' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
)
  throw new Error('Loopback test emulators required.');
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp: initializeAdmin, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getFirestore: adminFirestore } = require('firebase-admin/firestore');
const admin = initializeAdmin({ projectId: 'demo-seawolf-rides' });
try {
  const db = adminFirestore(admin);
  const chats = await db.collection('chats').get();
  const original = chats.docs.find((d) => d.data().participantIds.includes('traffic-rider'));
  assert.ok(original);
  const chatId = original.id;
  assert.ok(original.data().messageCount >= 4);
  const requestOnly = chats.docs.find((d) => d.data().participantIds.includes('symmetric-rider'));
  assert.ok(requestOnly);
  assert.ok(requestOnly.data().messageCount > 0);
  assert.equal((await db.doc(`rideRequests/${requestOnly.data().requestId}`).get()).data().status, 'CANCELLED');
  assert.equal((await db.doc('users/dropoff-rider/commutes/primary').get()).data().riderDropoffPreference, 'any');
  const dropoffRide = await db.collection('rideRequests').where('riderId', '==', 'dropoff-rider').get();
  assert.equal(dropoffRide.docs[0].data().campusLabel, 'West Side');
  assert.equal(dropoffRide.docs[0].data().status, 'ACCEPTED');
  const rides = await db.collection('rideRequests').where('riderId', '==', 'traffic-rider').get();
  assert.equal(rides.size, 1);
  const ride = rides.docs[0];
  assert.equal(ride.data().status, 'ACCEPTED');
  assert.equal(ride.data().plan.vehicleCampusArrival - ride.data().plan.departure, 2220);
  assert.equal(
    (await db.collection('_rideCommitments').where('requestId', '==', ride.id).get()).size,
    2,
  );
  assert.equal((await db.doc('_m3Routing/tomtomBudget').get()).data().count, 18000);
  const symmetric = await db
    .collection('rideRequests')
    .where('participantIds', 'array-contains', 'symmetric-rider')
    .get();
  const byDate = symmetric.docs
    .map((d) => d.data())
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  assert.equal(byDate.length, 4);
  assert.equal(byDate[0].status, 'ACCEPTED');
  assert.equal(byDate[0].initiatorId, 'symmetric-driver');
  assert.equal(byDate[0].attemptId, 'symmetric-driver-proposal-2');
  assert.equal(byDate[1].status, 'DECLINED');
  assert.equal(byDate[3].status, 'CANCELLED');
  assert.equal(byDate[3].attemptId, 'symmetric-crossed-proposal-9');
  assert.ok((await db.collection('_rideRequestAttempts').get()).size >= 9);
  for (const uid of ['traffic-rider', 'traffic-a-driver']) {
    const app = initializeApp({ projectId: 'demo-seawolf-rides', apiKey: 'emulator-only' }, uid);
    try {
      const auth = getAuth(app);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      const client = getFirestore(app);
      connectFirestoreEmulator(client, '127.0.0.1', 9095);
      await signInWithEmailAndPassword(auth, `${uid}@stonybrook.edu`, 'Emulator-test-only-123!');
      assert.equal((await getDoc(doc(client, 'rideRequests', ride.id))).data().status, 'ACCEPTED');
      assert.equal((await getDoc(doc(client, 'ridePickups', ride.id))).exists(), true);
      assert.equal((await getDoc(doc(client, 'chats', chatId))).data().messageCount, original.data().messageCount);
      const messages = await getDocs(query(collection(client, 'chats', chatId, 'messages'), orderBy('sequence')));
      const texts = messages.docs.filter((d) => !d.data().type || d.data().type === 'TEXT');
      assert.deepEqual(texts.map((d) => d.data().sequence), [1, 2, 3]);
      assert.equal(texts.at(-1).data().text, 'Thanks!');
      assert.ok(messages.docs.some((d) => d.data().type === 'RIDE_REQUEST' && d.data().ride.status === 'ACCEPTED'));

    } finally {
      await deleteApp(app);
    }
  }
  for (const uid of ['symmetric-driver', 'symmetric-rider']) {
    const app = initializeApp({ projectId: 'demo-seawolf-rides', apiKey: 'emulator-only' }, uid);
    try {
      const auth = getAuth(app);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      const client = getFirestore(app);
      connectFirestoreEmulator(client, '127.0.0.1', 9095);
      await signInWithEmailAndPassword(auth, `${uid}@stonybrook.edu`, 'Emulator-test-only-123!');
      assert.equal(
        (await getDoc(doc(client, 'rideRequests', byDate[0].id))).data().status,
        'ACCEPTED',
      );
      assert.equal(
        (await getDoc(doc(client, 'rideRequests', byDate[3].id))).data().status,
        'CANCELLED',
      );
      assert.equal((await getDoc(doc(client, 'ridePickups', byDate[0].id))).exists(), true);
      const restoredThread = (await getDoc(doc(client, 'chats', requestOnly.id))).data();
      assert.equal(restoredThread.requestId, byDate[3].id);
      const entries = await getDocs(collection(client, 'chats', requestOnly.id, 'messages'));
      assert.equal(restoredThread.messageCount, entries.size);
      assert.ok(entries.size > 0);
      const restoredEntries = entries.docs.map((d) => d.data());
      assert.ok(restoredEntries.every((entry) => ['RIDE_REQUEST', 'RIDE_CANCELLED'].includes(entry.type)));
      assert.ok(restoredEntries.some((entry) => entry.type === 'RIDE_REQUEST'));
      assert.ok(restoredEntries.some((entry) => entry.type === 'RIDE_CANCELLED'));
    } finally {
      await deleteApp(app);
    }
  }
  console.log(
    'PASS: traffic-derived accepted timing, both accounts, private pickups, commitments demo request counter and both-account chat messages survive import.',
  );
} finally {
  await deleteAdmin(admin);
}
