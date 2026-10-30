import { saveUserData, loadUserData, saveProfileDetails, savePrimaryCommute } from '../src/persistence/userDataRepository.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
} from 'firebase/firestore';
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from 'firebase/functions';
import {
  localDateAt,
  weekdayForDate,
} from '../src/mvp/settings.ts';
import { toPrivacyArea } from '../src/commute/commuteModel.ts';
import { shiftDate } from '../src/calendar/commuteCalendar.ts';
import { vehicleFixture } from './matching-fixtures.mjs';
if (
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:9095' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
)
  throw new Error('Test emulators required.');
const require = createRequire(
  new URL('../../functions/package.json', import.meta.url),
);
const {
  initializeApp: adminApp,
  deleteApp: deleteAdmin,
} = require('firebase-admin/app');
const { getAuth: adminAuth } = require('firebase-admin/auth');
const { getFirestore: adminFirestore } = require('firebase-admin/firestore');
const admin = adminApp({ projectId: 'demo-seawolf-rides' }, 'profile-workflows-test');
const db = adminFirestore(admin);
const clients = [];
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const points = new URL(req.url, 'http://localhost').pathname
    .split('/')
    .pop()
    .split(';')
    .map((p) => p.split(',').map(Number));
  const durations = points.length === 2 ? [1800] : [600, 1500];
  res.end(
    JSON.stringify({
      code: 'Ok',
      waypoints: points.map((location) => ({
        location,
        distance: 0,
        name: '',
      })),
      routes: [
        {
          duration: durations.reduce((a, b) => a + b, 0),
          distance: 10000,
          geometry: { type: 'LineString', coordinates: points },
          legs: durations.map((duration, i) => ({
            duration,
            distance: 5000,
            summary: '',
            steps: [
              {
                duration,
                distance: 5000,
                name: 'Test road',
                geometry: {
                  type: 'LineString',
                  coordinates: [points[i], points[i + 1]],
                },
                maneuver: { type: 'depart', location: points[i] },
              },
            ],
          })),
        },
      ],
    }),
  );
});
async function client(uid) {
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
  clients.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const database = getFirestore(app);
  connectFirestoreEmulator(database, '127.0.0.1', 9095);
  const functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  await signInWithEmailAndPassword(
    auth,
    `${uid}@stonybrook.edu`,
    'Emulator-test-only-123!',
  );
  return { uid, db: database, functions };
}
async function action(client, name, data) {
  for (let i = 0; i < 10; i++) {
    try {
      return (
        await httpsCallable(client.functions, name, { timeout: 120000 })(data)
      ).data;
    } catch (e) {
      if (e.code !== 'functions/resource-exhausted' || i === 9) throw e;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
}

test('cosmetic edits preserve pending ride revisions, publish names, and never overwrite commute or role', { timeout: 120000 }, async () => {
  await new Promise((resolve) => server.listen(5009, '127.0.0.1', resolve));
  try {
    const driver = await client('profile-workflow-driver');
    const rider = await client('profile-workflow-rider');
    const date = localDateAt(Date.now() / 1000 + 86400);
    const point = { latitude: 40.92047, longitude: -73.12844 };
    for (const [account, mode, role] of [[driver, 'drive', 'driver'], [rider, 'ride', 'rider']]) {
      await saveUserData(account.db, account.uid, { firstName: role, role }, {
        startPoint: point, startArea: toPrivacyArea(point, 'Stony Brook area'),
        discoveryEnabled: true, campusLot: 'westSide',
        days: [{ day: weekdayForDate(date), mode, startAt: 480, arriveBy: 540, leaveAt: 1020 }],
        ...(role === 'driver' ? { seats: 1 } : {}),
      });
    }
    await action(driver, 'saveVehicleDetails', vehicleFixture(driver.uid));
    const requestFor = async (localDate, attemptId) => {
      const result = await action(rider, 'findCommuteMatches', { localDate });
      const match = result.matches.find((value) => value.driverId === driver.uid);
      assert.ok(match);
      const request = await action(rider, 'createRideRequest', {
        source: 'CALENDAR', driverId: driver.uid, riderId: rider.uid, localDate,
        direction: 'TO_CAMPUS', riderRevision: match.riderRevision, driverRevision: match.driverRevision,
        proposedPlan: { departure: match.plan.departure, pickup: match.plan.pickup, vehicleCampusArrival: match.plan.vehicleCampusArrival },
        attemptId,
      });
      assert.equal(request.status, 'PENDING');
      return { request, match };
    };
    const { request, match } = await requestFor(date, 'profile-first-attempt-01');
    const old = await loadUserData(driver.db, driver.uid);
    const privateBefore = await db.doc(`users/${driver.uid}`).get();
    const commuteBefore = await db.doc(`users/${driver.uid}/commutes/primary`).get();
    const cosmetics = { ...old.profile, firstName: 'Updated driver', bio: 'Updated bio', photoBase64: '/9j/AA==' };
    await saveProfileDetails(driver.db, driver.uid, cosmetics);
    assert.deepEqual(await loadUserData(driver.db, driver.uid), { profile: cosmetics, commute: old.commute });
    assert.ok((await db.doc(`users/${driver.uid}`).get()).updateTime.isEqual(privateBefore.updateTime));
    assert.ok((await db.doc(`users/${driver.uid}/commutes/primary`).get()).updateTime.isEqual(commuteBefore.updateTime));
    const refreshed = await action(rider, 'findCommuteMatches', { localDate: date });
    const renamed = refreshed.matches.find((value) => value.driverId === driver.uid);
    assert.equal(renamed.name, 'Updated driver');
    assert.equal(renamed.driverRevision, match.driverRevision, 'existing revision format is preserved');
    const publicDoc = await getDoc(doc(rider.db, 'publicProfiles', driver.uid));
    assert.equal(publicDoc.data().bio, cosmetics.bio);
    assert.equal(publicDoc.data().startPoint, undefined);
    const accepted = await action(driver, 'respondToRideRequest', {
      requestId: request.id, attemptId: request.attemptId, decision: 'ACCEPTED',
    });
    assert.equal(accepted.status, 'ACCEPTED', 'a cosmetic edit cannot strand the existing pending ride');
    assert.equal((await db.doc(`rideRequests/${request.id}`).get()).get('driverName'), 'Updated driver');

    // A profile editor from before another commute save cannot restore that old commute.
    const nextCommute = { ...old.commute, days: old.commute.days.map((day) => ({ ...day, leaveAt: 1050 })) };
    await savePrimaryCommute(driver.db, driver.uid, nextCommute);
    const cleared = await saveProfileDetails(driver.db, driver.uid, { firstName: 'Updated driver', role: 'rider' });
    assert.equal(cleared.role, 'driver', 'cosmetic saves cannot change the private role');
    const reloaded = await loadUserData(driver.db, driver.uid);
    assert.deepEqual(reloaded.profile, { firstName: 'Updated driver', role: 'driver' });
    assert.deepEqual(reloaded.commute, nextCommute);
    const removed = await getDoc(doc(rider.db, 'publicProfiles', driver.uid));
    assert.equal(removed.data().photoBase64, undefined);
    assert.equal(removed.data().bio, undefined);

    // Actual role/schedule edits must still invalidate an earlier proposal.
    const next = await requestFor(shiftDate(date, 7), 'profile-second-attempt-01');
    await saveUserData(driver.db, driver.uid, { ...reloaded.profile, role: 'rider' }, {
      ...nextCommute, days: nextCommute.days.map((day) => ({ ...day, mode: 'ride' })),
    });
    await assert.rejects(action(driver, 'respondToRideRequest', {
      requestId: next.request.id, attemptId: next.request.attemptId, decision: 'ACCEPTED',
    }), { code: 'functions/failed-precondition' });
    assert.equal((await db.doc(`rideRequests/${next.request.id}`).get()).get('status'), 'PENDING');
  } finally {
    for (const app of clients) {
      const uid = app.name;
      await db.doc(`users/${uid}/commutes/primary`).update({ discoveryEnabled: false }).catch(() => {});
    }
    await Promise.all(clients.map(deleteApp));
    await deleteAdmin(admin);
    await new Promise((resolve) => server.close(resolve));
  }
});
