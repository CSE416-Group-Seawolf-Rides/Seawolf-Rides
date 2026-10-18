import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  onSnapshot,
  doc,
  getDoc,
} from 'firebase/firestore';
import { participantRequestsQuery } from '../src/mvp/rideRequestQuery.ts';
import {
  currentCarpools,
  rideEnd,
  rideHistory,
} from '../src/mvp/ridePresentation.ts';
import { localDateAt, localMinuteToEpoch } from '../src/mvp/settings.ts';
import { shiftDate } from '../src/calendar/commuteCalendar.ts';

if (
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:9095' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
)
  throw new Error('This test requires the loopback demo emulators.');
const require = createRequire(
  new URL('../../functions/package.json', import.meta.url),
);
const {
  initializeApp: adminApp,
  deleteApp: deleteAdmin,
} = require('firebase-admin/app');
const { getAuth: adminAuth } = require('firebase-admin/auth');
const { getFirestore: adminFirestore } = require('firebase-admin/firestore');

function watch(database, accept) {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    const timeout = setTimeout(() => {
      stop();
      reject(new Error('No matching live ride update.'));
    }, 10000);
    stop = onSnapshot(
      participantRequestsQuery(database, database.app.name),
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
        if (accept(items)) {
          clearTimeout(timeout);
          stop();
          resolve(items);
        }
      },
      (error) => {
        clearTimeout(timeout);
        stop();
        reject(error);
      },
    );
  });
}
test('both clients derive live carpools/history from all owned rides, including edits, removals and arrival expiry', async () => {
  const admin = adminApp(
    { projectId: 'demo-seawolf-rides' },
    'presentation-admin',
  );
  const db = adminFirestore(admin);
  const apps = [];
  const clients = [];
  try {
    for (const uid of [
      'presentation-driver',
      'presentation-rider',
      'presentation-outsider',
    ]) {
      await adminAuth(admin).createUser({
        uid,
        email: `${uid}@stonybrook.edu`,
        emailVerified: true,
        password: 'Emulator-test-only-123!',
      });
      const app = initializeApp(
        { projectId: 'demo-seawolf-rides', apiKey: 'emulator-only' },
        uid,
      );
      apps.push(app);
      const auth = getAuth(app);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
        disableWarnings: true,
      });
      const database = getFirestore(app);
      connectFirestoreEmulator(database, '127.0.0.1', 9095);
      await signInWithEmailAndPassword(
        auth,
        `${uid}@stonybrook.edu`,
        'Emulator-test-only-123!',
      );
      clients.push(database);
    }
    const now = Date.now() / 1000;
    const today = localDateAt(now),
      future = shiftDate(today, 1);
    // Protected historical fixtures stand in for a long-running demo account.
    // Creation/acceptance authorization is covered separately by ride-requests.integration.
    const valueFor = (date) => ({
      participantIds: ['presentation-driver', 'presentation-rider'],
      driverId: 'presentation-driver',
      riderId: 'presentation-rider',
      driverName: 'Driver',
      riderName: 'Rider',
      localDate: date,
      status: 'ACCEPTED',
      pickupLabel: 'Station area',
      campusLabel: 'West Side',
      plan: {
        departure: localMinuteToEpoch(date, 450),
        pickup: localMinuteToEpoch(date, 460),
        vehicleCampusArrival: localMinuteToEpoch(date, 510),
        riderDestinationArrival: localMinuteToEpoch(date, 510),
      },
    });
    const batch = db.batch();
    for (let i = 0; i < 150; i++)
      batch.set(
        db.doc(`rideRequests/presentation-history-${i}`),
        valueFor(shiftDate(today, -i - 1)),
      );
    const upcoming = valueFor(future);
    const futureRef = db.doc('rideRequests/zz-presentation-upcoming');
    batch.set(futureRef, upcoming);
    const initial = clients
      .slice(0, 2)
      .map((c) => watch(c, (items) => items.length === 151));
    await batch.commit();
    const snapshots = await Promise.all(initial);
    for (let i = 0; i < 2; i++) {
      const uid = clients[i].app.name;
      assert.equal(currentCarpools(snapshots[i], uid, now).length, 1);
      assert.equal(rideHistory(snapshots[i], uid, now).length, 150);
      assert.equal(
        currentCarpools(snapshots[i], uid, rideEnd(upcoming)).length,
        0,
      );
      assert.equal(
        rideHistory(snapshots[i], uid, rideEnd(upcoming)).length,
        151,
      );
    }
    await assert.rejects(
      getDoc(doc(clients[2], 'rideRequests', futureRef.id)),
      { code: 'permission-denied' },
    );
    const edits = clients
      .slice(0, 2)
      .map((c) =>
        watch(c, (items) =>
          items.some(
            (r) => r.id === futureRef.id && r.riderName === 'Updated rider',
          ),
        ),
      );
    await futureRef.update({
      riderName: 'Updated rider',
      'plan.pickup': upcoming.plan.pickup + 60,
    });
    const changed = await Promise.all(edits);
    assert.equal(
      currentCarpools(changed[0], 'presentation-driver', now)[0].name,
      'Updated rider',
    );
    assert.equal(
      currentCarpools(changed[1], 'presentation-rider', now)[0].accepted[0].plan
        .pickup,
      upcoming.plan.pickup + 60,
    );
    const removals = clients
      .slice(0, 2)
      .map((c) => watch(c, (items) => items.length === 150));
    await futureRef.delete();
    const removed = await Promise.all(removals);
    for (let i = 0; i < 2; i++)
      assert.equal(
        currentCarpools(removed[i], clients[i].app.name, now).length,
        0,
      );
  } finally {
    await Promise.all(apps.map(deleteApp));
    await deleteAdmin(admin);
  }
});
